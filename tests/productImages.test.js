import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import app from '../BackEnd/app.js';
import ProductModel from '../BackEnd/models/productModel.js';
import CategoryModel from '../BackEnd/models/Category.js';
import { deleteProductImage, productImagesDirectory } from '../BackEnd/utils/productImages.js';

const require = createRequire(new URL('../BackEnd/package.json', import.meta.url));
const jwt = require('jsonwebtoken');
const owner = '111111111111111111111111';
const categoryId = '222222222222222222222222';
const productId = '333333333333333333333333';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
const fields = { name: 'Photo product', barcode: 'PHOTO-001', quantite: 5, prix_achat: 10, prix_vente: 20, categorie: categoryId, datecreate: new Date().toISOString(), status: true };
let server, base, token;
const previousSecret = process.env.JWT_SECRET;
const images = new Set();

before(async () => {
  process.env.JWT_SECRET = 'test-product-image-key';
  token = jwt.sign({ id: owner, idAdmin: owner, role: 'admin' }, process.env.JWT_SECRET);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const image of images) await deleteProductImage(image);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

function setup(t) {
  let stored;
  t.mock.method(CategoryModel, 'findOne', async (filter) => {
    assert.equal(filter.idAdmin, owner);
    return filter._id === categoryId ? { _id: categoryId, name: 'Category' } : null;
  });
  const create = t.mock.method(ProductModel, 'create', async (data) => {
    stored = new ProductModel({ _id: productId, ...data });
    await stored.validate();
    if (stored.image) images.add(stored.image);
    return stored;
  });
  t.mock.method(ProductModel, 'findOne', async (filter) => {
    assert.equal(String(filter.idAdmin), owner);
    if (filter.barcode) return null;
    return filter._id === productId ? stored : null;
  });
  const update = t.mock.method(ProductModel, 'findOneAndUpdate', async (filter, data) => {
    assert.equal(filter.idAdmin, owner);
    stored = new ProductModel({ ...stored.toObject(), ...data.$set, __v: (stored.__v || 0) + (data.$inc?.__v || 0) });
    await stored.validate();
    if (stored.image) images.add(stored.image);
    return stored;
  });
  t.mock.method(ProductModel, 'findOneAndDelete', async (filter) => {
    assert.equal(filter.idAdmin, owner);
    return filter._id === productId ? stored : null;
  });
  return { create, update };
}
function form({ file = png, type = 'image/png', extra = {}, field = 'image' } = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...fields, ...extra })) data.append(key, String(value));
  if (file) data.append(field, new Blob([file], { type }), 'original-name.png');
  return data;
}
const request = (route, body, method = 'POST', authenticated = true) => fetch(`${base}/Product/${route}`, { method, body, headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
const files = async () => (await readdir(productImagesDirectory).catch(() => [])).sort();

test('multipart product saves image bytes, generated URL, category and numeric fields', async t => {
  setup(t);
  const response = await request('Add', form());
  assert.equal(response.status, 201);
  const product = await response.json();
  assert.match(product.image, /^\/uploads\/products\/[a-f0-9-]{36}\.png$/);
  assert.equal(product.quantite, 5);
  assert.equal(product.categorie.name, 'Category');
  const imageResponse = await fetch(`${base}${product.image}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(imageResponse.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);
});

test('photo is optional for both multipart and existing JSON clients', async t => {
  setup(t);
  const multipart = await request('Add', form({ file: null }));
  assert.equal(multipart.status, 201);
  assert.equal((await multipart.json()).image, '');
  const json = await fetch(`${base}/Product/Add`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
  assert.equal(json.status, 201);
  assert.equal((await json.json()).image, '');
});

test('editing retains, replaces and removes a photo, then deletion cleans its file', async t => {
  setup(t);
  const created = await (await request('Add', form())).json();
  const original = created.image;
  const retained = await (await request(`Update/${productId}`, form({ file: null, extra: { name: 'Edited product' } }), 'PUT')).json();
  assert.equal(retained.image, original);
  const replaced = await (await request(`Update/${productId}`, form(), 'PUT')).json();
  assert.notEqual(replaced.image, original);
  await assert.rejects(readFile(path.join(productImagesDirectory, path.basename(original))), { code: 'ENOENT' });
  const removed = await (await request(`Update/${productId}`, form({ file: null, extra: { removeImage: true } }), 'PUT')).json();
  assert.equal(removed.image, '');
  await assert.rejects(readFile(path.join(productImagesDirectory, path.basename(replaced.image))), { code: 'ENOENT' });
  const final = await (await request(`Update/${productId}`, form(), 'PUT')).json();
  assert.equal((await request(`Delete/${productId}`, undefined, 'DELETE')).status, 200);
  await assert.rejects(readFile(path.join(productImagesDirectory, path.basename(final.image))), { code: 'ENOENT' });
});

test('invalid types, forged image bytes, oversized files and wrong fields are rejected before saving', async t => {
  const { create } = setup(t);
  const beforeFiles = await files();
  for (const [options, status, code] of [
    [{ type: 'text/plain' }, 400, 'imageTypeInvalid'],
    [{ file: Buffer.from('<html>not an image</html>') }, 400, 'imageTypeInvalid'],
    [{ file: Buffer.alloc(5 * 1024 * 1024 + 1) }, 413, 'imageTooLarge'],
    [{ field: 'wrongField' }, 400, 'imageUploadInvalid'],
  ]) {
    const response = await request('Add', form(options));
    assert.equal(response.status, status);
    assert.equal((await response.json()).message, code);
  }
  assert.equal(create.mock.callCount(), 0);
  assert.deepEqual(await files(), beforeFiles);
});

test('failed database save cleans the new image and unauthorized requests never store it', async t => {
  const { create } = setup(t);
  const beforeFiles = await files();
  create.mock.mockImplementation(async () => { throw new Error('Save failed'); });
  assert.equal((await request('Add', form())).status, 500);
  assert.deepEqual(await files(), beforeFiles);
  assert.equal((await request('Add', form(), 'POST', false)).status, 401);
  assert.equal((await request('Update/444444444444444444444444', form(), 'PUT')).status, 404);
  assert.equal((await request('Add', form({ extra: { categorie: '444444444444444444444444' } }))).status, 404);
  assert.deepEqual(await files(), beforeFiles);
});

test('wholesale price is saved, retained when omitted, updated and cleared with an empty field', async t => {
  setup(t);
  const added = await request('Add', form({ file: null, extra: { prix_gros: '16.75' } }));
  assert.equal(added.status, 201);
  assert.equal((await added.json()).prix_gros, 16.75);
  const retained = await request(`Update/${productId}`, form({ file: null }), 'PUT');
  assert.equal((await retained.json()).prix_gros, 16.75);
  const updated = await request(`Update/${productId}`, form({ file: null, extra: { prix_gros: '15.50' } }), 'PUT');
  assert.equal((await updated.json()).prix_gros, 15.5);
  const cleared = await request(`Update/${productId}`, form({ file: null, extra: { prix_gros: '' } }), 'PUT');
  assert.equal((await cleared.json()).prix_gros, null);
});

test('invalid wholesale prices do not save products or upload files', async t => {
  const { create, update } = setup(t);
  const beforeFiles = await files();
  for (const value of ['-1', 'invalid', 'Infinity']) {
    const response = await request('Add', form({ extra: { prix_gros: value } }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, 'invalidWholesalePrice');
  }
  assert.equal(create.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
  assert.deepEqual(await files(), beforeFiles);
});

test('multipart fees calculate final prices, survive stock changes, and can be edited or removed', async t => {
  setup(t);
  const extra = { quantite: 10, prix_achat: 70, prix_vente_base: 100, prix_gros_base: 80, frais_total: 60 };
  const added = await request('Add', form({ extra }));
  assert.equal(added.status, 201);
  const created = await added.json();
  assert.equal(created.prix_vente, 106);
  assert.equal(created.prix_gros, 86);
  assert.equal(created.frais_unitaire, 6);
  assert.equal(created.frais_quantite, 10);
  assert.equal(created.profite, 30);
  for (let index = 0; index < 2; index++) {
    const updated = await request(`Update/${productId}`, form({ file: null, extra: { ...extra, quantite: 3 } }), 'PUT');
    assert.equal(updated.status, 200);
    const product = await updated.json();
    assert.equal(product.prix_vente, 106);
    assert.equal(product.frais_quantite, 10);
    assert.equal(product.quantite, 3);
    assert.equal(product.image, created.image);
  }
  const changed = await (await request(`Update/${productId}`, form({ file: null, extra: { ...extra, quantite: 3, frais_total: 120 } }), 'PUT')).json();
  assert.equal(changed.prix_vente, 112);
  assert.equal(changed.prix_gros, 92);
  assert.equal(changed.profite, 30);
  const cleared = await (await request(`Update/${productId}`, form({ file: null, extra: { ...extra, frais_total: '' } }), 'PUT')).json();
  assert.equal(cleared.prix_vente, 100);
  assert.equal(cleared.prix_gros, 80);
  assert.equal(cleared.frais_unitaire, 0);
});

test('invalid expenses and zero quantities are rejected before saving an uploaded photo', async t => {
  const { create } = setup(t);
  const beforeFiles = await files();
  for (const extra of [{ frais_total: -60 }, { frais_total: 'invalid' }, { frais_total: 60, quantite: 0 }, { frais_total: 60, frais_quantite: 1.5 }]) {
    const response = await request('Add', form({ extra }));
    assert.equal(response.status, 400);
  }
  assert.equal(create.mock.callCount(), 0);
  assert.deepEqual(await files(), beforeFiles);
});
