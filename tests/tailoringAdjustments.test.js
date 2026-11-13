import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import ShirtCostSettings from '../BackEnd/models/ShirtCostSettings.js';
import TrouserCostSettings from '../BackEnd/models/TrouserCostSettings.js';
import JabadorCostSettings from '../BackEnd/models/JabadorCostSettings.js';
import MalakiyaCostSettings from '../BackEnd/models/MalakiyaCostSettings.js';
import { djellabaFixture, garment, orderInput, owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { tailoringStockFixture } from './helpers/tailoringStockFixture.js';
import { validateTailoringOrder } from '../shared/tailoring.js';
import { quoteTailoringAdjustments, tailoringSuggestedDeposit } from '../shared/tailoringAdjustments.js';
import { tailoringPaymentReceipt } from '../shared/tailoringReceipts.js';

const savedSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-tailoring-adjustments'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/tailoring-orders'; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret; });
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
const request = async (suffix = '', body, actor = admin, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(base + suffix, { method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
const rates = { thinSfifaCostPrice: 25, thinSfifaPrice: 100, thickSfifaCostPrice: 50, thickSfifaPrice: 160, laborPrice: 0, fourFillePrice: 20 };
const adjustments = patch => ({ version: 1, fourFilleUnitPrice: 20, settingsVersion: 0, discount: { type: 'amount', value: 0 }, ...patch });
const input = patch => orderInput({ salePricingVersion: 3, adjustments: adjustments(), paidAmount: 0, ...patch });
function setup(t) { const f = djellabaFixture(t); f.seedSettings(rates); return f; }
const create = async body => { const result = await request('', body); assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data; };
function editInput(order, patch) {
  return { ...order, automaticCosting: Boolean(order.costing), ...(order.costing ? { salePricingVersion: order.costing.pricingVersion, costSettingsVersion: order.costing.settingsVersion } : {}), version: order.__v, items: order.items.map(item => ({ ...item, price: item.pricing?.basePrice ?? item.price, fourFille: item.pricing?.fourFille || false, discount: item.pricing?.discount, fabricUnitPrice: item.costs?.fabricUnitPrice ?? 0 })), ...patch };
}
function settingsFixture(t, Model, type, values) {
  let row = values ? new Model({ idAdmin: owner, updatedBy: owner, __v: 0, ...values }) : null;
  t.mock.method(Model, 'findOne', async scope => String(scope.idAdmin) === owner && row ? new Model(row.toObject()) : null);
  t.mock.method(Model, 'create', async value => { const doc = new Model({ ...value, __v: 0 }); await doc.validate(); row = doc; return doc; });
  t.mock.method(Model.prototype, 'save', async function () { await this.validate(); if (this.__v !== row.__v) throw Object.assign(new Error('Conflict'), { name: 'VersionError' }); this.__v++; row = new Model(this.toObject()); return this; });
  return { url: '/cost-settings?garment=' + type + '&pricingVersion=3', row: () => row };
}

test('exact piece and order discounts include only checked 4fille pieces; suggested deposit rounds to cents', () => {
  const result = quoteTailoringAdjustments([{ price: 100, fourFille: true, discount: { type: 'percent', value: 10 } }, { price: 160, discount: { type: 'amount', value: 5 } }], 20, { type: 'percent', value: 5 });
  assert.deepEqual(result.items.map(item => item.price), [108, 155]); assert.equal(result.adjustments.subtotal, 263); assert.equal(result.adjustments.discountAmount, 13.15); assert.equal(result.totalPrice, 249.85); assert.equal(tailoringSuggestedDeposit(result.totalPrice), 149.91);
  assert.equal(tailoringSuggestedDeposit(.01), .01); assert.equal(tailoringSuggestedDeposit(0), 0); assert.equal(tailoringSuggestedDeposit(null), null);
  assert.equal(quoteTailoringAdjustments([{ price: .05, discount: { type: 'percent', value: 10 } }], 0).totalPrice, .04);
  assert.equal(quoteTailoringAdjustments([{ price: 5, discount: { type: 'percent', value: 100 } }], 0).totalPrice, 0);
});

test('two garments use independent discounts plus one order discount; below-60-percent and zero payments are accepted', async t => {
  const f = setup(t);
  for (const paidAmount of [0, 10]) {
    const order = await create(input({ paidAmount, adjustments: adjustments({ discount: { type: 'percent', value: 5 } }), items: [garment({ fourFille: true, discount: { type: 'percent', value: 10 } }), garment({ sfifa: { width: 'thick', style: 'fabric' }, discount: { type: 'amount', value: 5 } })] }));
    assert.deepEqual(order.items.map(item => item.price), [108, 155]); assert.equal(order.totalPrice, 249.85); assert.equal(order.paidAmount, paidAmount); assert.equal(order.remainingAmount, 249.85 - paidAmount); assert.equal(order.expenseAmount, 75); assert.equal(order.profitAmount, 174.85);
    assert.equal(order.customerReceipt.totalPrice, 249.85); assert.equal(order.customerReceipt.adjustments.discountAmount, 13.15); assert.equal(order.customerReceipt.items[0].pricing.fourFilleAmount, 20); assert.equal(order.customerReceipt.items[0].pricing.discountAmount, 12);
    assert.doesNotMatch(JSON.stringify(order.customerReceipt), /expenseAmount|profitAmount|sfifaCostAmount|costing|photo/);
  }
  assert.equal(f.orders.size, 2);
});

test('ten pieces receive the global amount discount once and never alter fabric expense snapshots', async t => {
  setup(t); const order = await create(input({ items: Array.from({ length: 10 }, () => garment()), adjustments: adjustments({ discount: { type: 'amount', value: 100 } }) }));
  assert.equal(order.adjustments.subtotal, 1000); assert.equal(order.totalPrice, 900); assert.equal(order.expenseAmount, 250); assert.equal(order.profitAmount, 650); assert.equal(order.items.reduce((sum, item) => sum + item.price, 0), 1000);
});

test('invalid discounts, extra precision, invalid flags, and overpayments are rejected before persistence', async t => {
  const f = setup(t);
  for (const discount of [{ type: 'percent', value: 101 }, { type: 'amount', value: -1 }, { type: 'amount', value: '1.001' }, { type: 'unknown', value: 1 }, { type: 'amount', value: 101 }, { type: 'percent', value: null }]) {
    const result = await request('', input({ items: [garment({ price: 100, discount })] })); assert.equal(result.status, 400, JSON.stringify(discount));
  }
  for (const fourFille of ['true', null, 1, {}]) assert.equal((await request('', input({ items: [garment({ fourFille })] }))).status, 400);
  const result = await request('', input({ items: [garment({ price: 9999, discount: { type: 'percent', value: 50 } })], paidAmount: 60 })); assert.equal(result.status, 400); assert.equal(result.data.fields.paidAmount, 'paidExceedsPrice');
  assert.equal((await request('', input({ adjustments: adjustments({ discount: { type: 'amount', value: 101 } }), items: [garment({ price: 100 })] }))).status, 400); assert.equal(f.orders.size, 0);
});

test('a full payment including 4fille may exceed the base garment price', async t => {
  setup(t); const saved = await create(input({ items: [garment({ price: 100, fourFille: true })], paidAmount: 120 })); assert.equal(saved.totalPrice, 120); assert.equal(saved.remainingAmount, 0);
});

test('trusted settings reject forged quotes; retries and edits retain original add-on price and discount snapshots', async t => {
  const f = setup(t); const body = input({ items: [garment({ fourFille: true, discount: { type: 'amount', value: 5 } })] }); const saved = await create(body); const receipt = structuredClone(saved.customerReceipt);
  f.settings.get(owner).fourFillePrice = 90; f.settings.get(owner).__v = 2;
  let result = await request('', body); assert.equal(result.status, 200); assert.equal(result.data.totalPrice, 115); assert.equal(f.orders.size, 1);
  result = await request('', input()); assert.equal(result.status, 409); assert.equal(result.data.message, 'costSettingsChanged');
  result = await request('/' + saved._id, editInput(saved, { phone: '0698765432' }), admin, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.totalPrice, 115); assert.equal(result.data.adjustments.fourFilleUnitPrice, 20); assert.deepEqual(result.data.customerReceipt, receipt);
  const changed = result.data; result = await request('/' + saved._id, editInput(changed, { adjustments: undefined }), admin, 'PUT'); assert.equal(result.status, 400);
});

test('current discount permission blocks new or changed discounts but permits preserving an existing one', async t => {
  const f = setup(t); f.staff.moduleAccess = ['tailoring']; f.staff.operationPermissions = { tailoring: ['add', 'update', 'payment', 'details'] };
  let result = await request('', input({ items: [garment({ discount: { type: 'amount', value: 1 } })] }), staff); assert.equal(result.status, 403);
  result = await request('', input({ adjustments: adjustments({ discount: { type: 'percent', value: 10 } }) }), staff); assert.equal(result.status, 403);
  result = await request('', input(), staff); assert.equal(result.status, 201);
  const saved = await create(input({ items: [garment({ discount: { type: 'amount', value: 10 } })] }));
  result = await request('/' + saved._id, editInput(saved, { clientName: 'اسم معدل' }), staff, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data));
  f.staff.operationPermissions.tailoring.push('discount'); result = await request('', input({ items: [garment({ discount: { type: 'amount', value: 10 } })] }), staff); assert.equal(result.status, 201);
});

test('model detects forged totals, missing snapshots, invalid percentages and divergent automatic base prices', async t => {
  const f = setup(t); const saved = await create(input({ items: [garment({ fourFille: true, discount: { type: 'percent', value: 10 } })] })); const stored = f.orders.get(saved._id).toObject();
  for (const mutate of [row => { row.totalPrice = 1; }, row => { row.items[0].price = 1; }, row => { row.items[0].pricing.fourFilleAmount = 1; }, row => { row.items[0].pricing.discount.value = 101; }, row => { row.items[0].pricing.basePrice = 999; }, row => { delete row.items[0].pricing; }, row => { delete row.adjustments; }]) { const copy = structuredClone(stored); mutate(copy); await assert.rejects(new TailoringOrder(copy).validate()); }
});

test('payment receipts use discounted remaining balance, preserve 4fille, and stay immutable after later edits', async t => {
  setup(t); const saved = await create(input({ paidAmount: 10, items: [garment({ fourFille: true, discount: { type: 'amount', value: 20 } })], adjustments: adjustments({ discount: { type: 'amount', value: 10 } }) }));
  const body = { amount: 20, version: saved.__v, requestId: randomUUID() }; let result = await request('/' + saved._id + '/payments', body); assert.equal(result.status, 200); assert.equal(result.data.remainingAmount, 60);
  const paid = result.data, receipt = tailoringPaymentReceipt(paid, paid.addedPayments[0]); assert.equal(receipt.totalPrice, 90); assert.equal(receipt.paidAmount, 30); assert.equal(receipt.items[0].pricing.fourFille, true);
  result = await request('/' + saved._id + '/payments', body); assert.equal(result.status, 200); assert.equal(result.data.addedPayments.length, 1);
  result = await request('/' + saved._id, editInput(paid, { adjustments: { ...paid.adjustments, discount: { type: 'amount', value: 5 } } }), admin, 'PUT'); assert.equal(result.status, 200); assert.deepEqual(result.data.addedPayments[0].document, receipt);
});

test('standalone stock reservation, discounted delivery profit and cancellation retain their existing material behavior', async t => {
  const f = tailoringStockFixture(t); f.controls.standalone = true; f.settings.get(owner).fourFillePrice = 20;
  const fabric = f.fabric, item = garment({ price: 100, fabricSource: 'shop', fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), fabricPieceId: String(fabric.colors[0].pieces[0]._id), fabricMeters: 2, fabricUnitPrice: 30, fourFille: true, discount: { type: 'amount', value: 10 } });
  const body = input({ deductFabricStock: true, items: [item], adjustments: adjustments({ discount: { type: 'amount', value: 5 } }) }); const saved = await create(body); assert.equal(saved.totalPrice, 105); assert.equal(saved.expenseAmount, 85); assert.equal(f.meters(), 33);
  let result = await request('/' + saved._id + '/deliver', { version: saved.__v }); assert.equal(result.status, 200); assert.equal(result.data.deliveryFinancials.revenueAmount, 105); assert.equal(result.data.deliveryFinancials.expenseAmount, 85);
  result = await request('/' + saved._id + '/cancel', { version: result.data.__v }); assert.equal(result.status, 200); assert.equal(f.meters(), 33); assert.ok(result.data.cancelledAt);
  const second = await create({ ...body, requestId: randomUUID() }); assert.equal(f.meters(), 31); result = await request('/' + second._id + '/cancel', { version: second.__v }); assert.equal(result.status, 200); assert.equal(f.meters(), 33);
});

for (const [type, Model] of [['jabador', JabadorCostSettings], ['malakiya', MalakiyaCostSettings], ['shirts', ShirtCostSettings]]) test(type + ' has its own 4fille setting, optional piece surcharge, discounts and preserved expenses', async t => {
  setup(t); const withSfifa = ['jabador', 'malakiya'].includes(type); const ownRates = withSfifa ? rates : { fourFillePrice: 20 };
  const s = settingsFixture(t, Model, type, ownRates); const get = await request(s.url); assert.equal(get.status, 200); assert.equal(get.data.fourFillePrice, 20);
  let result = await request(s.url, { rates: get.data.rates, fourFillePrice: 25, version: 0 }, admin, 'PUT'); assert.equal(result.status, 200); assert.equal(result.data.fourFillePrice, 25);
  const version = result.data.version; const piece = garment({ price: 100, fourFille: true, discount: { type: 'percent', value: 20 }, ...(type === 'shirts' ? { shirtType: 'قميص' } : type === 'trousers' ? { trouserType: 'regular' } : {}) });
  const body = input({ garmentType: type, automaticCosting: withSfifa ? true : undefined, salePricingVersion: withSfifa ? 3 : undefined, costSettingsVersion: withSfifa ? version : undefined, expenseAmount: 10, items: [piece], adjustments: adjustments({ fourFilleUnitPrice: 25, settingsVersion: version, discount: { type: 'amount', value: 5 } }) });
  const saved = await create(body); assert.equal(saved.totalPrice, 95); assert.equal(saved.items[0].pricing.fourFilleAmount, 25); assert.equal(saved.expenseAmount, withSfifa ? 25 : 10);
  result = await request(s.url, { rates: get.data.rates, fourFillePrice: -1, version }, admin, 'PUT'); assert.equal(result.status, 400); assert.equal(s.row().fourFillePrice, 25);
});

test('multipart submits adjustments as JSON and preserves zero/blank optional discounts', async t => {
  setup(t); const body = input({ paidAmount: 1, items: [garment({ price: 100, fourFille: true, discount: { type: 'amount', value: '' } })] }); const normalized = validateTailoringOrder(body); assert.equal(normalized.totalPrice, 120);
  const form = new FormData(); for (const [key, value] of Object.entries(body)) if (value !== undefined) form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
  const result = await request('', form); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.totalPrice, 120); assert.equal(result.data.paidAmount, 1);
});

test('trousers retain both discounts and advisory deposits while 4fille is unavailable', async t => {
  setup(t); const s = settingsFixture(t, TrouserCostSettings, 'trousers', { regularLaborPrice: 12, qandrissiLaborPrice: 25 });
  const piece = garment({ price: 100, trouserType: 'regular', discount: { type: 'amount', value: 5 } });
  const body = input({ garmentType: 'trousers', automaticCosting: undefined, salePricingVersion: undefined, costSettingsVersion: undefined, expenseAmount: 12, items: [piece], adjustments: adjustments({ fourFilleUnitPrice: 0, discount: { type: 'amount', value: 10 } }) });
  const order = await create(body); assert.equal(order.totalPrice, 85); assert.equal(order.expenseAmount, 12); assert.equal(order.items[0].pricing.fourFille, false); assert.equal(tailoringSuggestedDeposit(order.totalPrice), 51);
  let result = await request('', { ...body, requestId: randomUUID(), items: [{ ...piece, fourFille: true }] }); assert.equal(result.status, 400);
  result = await request(s.url, { rates: { regularLaborPrice: 12, qandrissiLaborPrice: 25 }, fourFillePrice: 20, version: 0 }, admin, 'PUT'); assert.equal(result.status, 400); assert.equal(result.data.fields.fourFillePrice, 'invalidFourFille');
});
