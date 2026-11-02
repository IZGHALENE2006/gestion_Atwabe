import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import { djellabaFixture, owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { createTailoringReceipt, tailoringOrderReceipt, tailoringPaymentReceipt, publicTailoringReceipt } from '../shared/tailoringReceipts.js';
const secret = process.env.JWT_SECRET, previousDirectory = process.env.TAILORING_PHOTOS_DIRECTORY;
process.env.TAILORING_PHOTOS_DIRECTORY = await mkdtemp(path.join(tmpdir(), 'tailoring-receipt-photos-'));
process.env.JWT_SECRET = 'isolated-tailoring-receipts-tests';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/tailoring-orders'; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; if (previousDirectory === undefined) delete process.env.TAILORING_PHOTOS_DIRECTORY; else process.env.TAILORING_PHOTOS_DIRECTORY = previousDirectory; });
const request = async (suffix = '', body, method = body === undefined ? 'GET' : 'POST', actor = { id: owner, role: 'admin' }) => {
  const response = await fetch(base + suffix, { method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
const input = (type = 'djellaba', patch = {}) => ({ garmentType: type, clientName: 'أمينة العميلة', phone: '0612345678', orderDate: '2026-11-02', readyDate: '2026-11-10', paidAmount: 100, expenseAmount: 123.45, items: [500, 300].map((price, index) => ({ lineId: randomUUID().replaceAll('-', '').slice(0, 24), price, fabricSource: 'client', fabricType: 'قطن ' + index, fabricColor: 'أزرق', ...(type === 'trousers' ? { trouserType: 'qandrissi' } : type === 'shirts' ? { shirtType: 'قميص رجالي' } : { sfifa: { width: 'thin', style: 'fabric' } }) })), requestId: randomUUID(), ...patch });
const safe = receipt => { assert.doesNotMatch(JSON.stringify(receipt), /"(?:photo|hasPhoto|costs|fabricCost|expenseAmount|profitAmount|costing|fabricId|colorId|createdBy|requestId)"/); };

test('receipt projection excludes every photo, cost and internal field even from already-built documents', () => {
  const order = { _id: '123456789012345678901234', ...input(), totalPrice: 800, photo: 'PRIVATE-IMAGE', costing: { totalAmount: 9999 }, profitAmount: 2222 };
  order.items[0] = { ...order.items[0], photo: 'PRIVATE-PHOTO', costs: { fabricAmount: 123 }, fabricCost: { fabricAmount: 123 }, fabricId: 'PRIVATE-STOCK' };
  const receipt = createTailoringReceipt(order, { issuedAt: '2026-11-02T12:00:00Z' }); safe(receipt); assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE-/);
  const projected = publicTailoringReceipt({ ...receipt, expenseAmount: 777, photo: 'PRIVATE', items: receipt.items.map(item => ({ ...item, costs: { total: 777 } })) }); safe(projected);
  assert.equal(receipt.items.length, 2); assert.equal(receipt.items[0].fabricType, 'قطن 0'); assert.deepEqual([receipt.totalPrice, receipt.paidAmount, receipt.remainingAmount], [800, 100, 700]);
});

for (const type of ['djellaba', 'trousers', 'shirts', 'jabador', 'malakiya']) test(type + ' stores one original receipt and historical payment receipts that survive edits and retries', async t => {
  const f = djellabaFixture(t), body = input(type, { customerReceipt: { totalPrice: 0, photo: 'FORGED' } });
  const created = await request('', body); assert.equal(created.status, 201, JSON.stringify(created.data)); let order = created.data;
  const original = structuredClone(order.customerReceipt); safe(original); assert.equal(original.garmentType, type); assert.equal(original.historical, true); assert.equal(original.kind, 'order'); assert.deepEqual([original.totalPrice, original.paidAmount, original.remainingAmount], [800, 100, 700]);
  assert.match(original.reference, /^FS-[A-F0-9]{24}-O$/); assert.equal((await request('', body)).status, 200); assert.equal(f.orders.size, 1);
  const firstRequest = { requestId: randomUUID(), amount: '50.25', version: order.__v, document: { paidAmount: 0 } };
  const first = await request('/' + order._id + '/payments', firstRequest); assert.equal(first.status, 200); const receipt = structuredClone(first.data.paymentReceipt.document); safe(receipt);
  assert.deepEqual([receipt.paymentAmount, receipt.paidAmount, receipt.remainingAmount], [50.25, 150.25, 649.75]); assert.match(receipt.reference, /-P001$/);
  const second = await request('/' + order._id + '/payments', { requestId: randomUUID(), amount: '49.75', version: first.data.__v }); assert.equal(second.status, 200); order = second.data;
  assert.equal(order.paymentReceipt.document.remainingAmount, 600); assert.equal(order.paymentReceipt.document.paidAmount, 200);
  const replay = await request('/' + order._id + '/payments', firstRequest); assert.equal(replay.status, 200); assert.equal(replay.data.paidAmount, 200); assert.deepEqual(replay.data.paymentReceipt.document, receipt);
  const changed = await request('/' + order._id, { ...body, clientName: 'اسم جديد', phone: '0698765432', paidAmount: 200, items: body.items.map(item => ({ ...item, price: item.price + 100 })), version: order.__v, customerReceipt: { reference: 'FORGED' } }, 'PUT'); assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.totalPrice, 1000); assert.equal(changed.data.clientName, 'اسم جديد'); assert.deepEqual(changed.data.customerReceipt, original); assert.deepEqual(changed.data.addedPayments[0].document, receipt);
  const listed = (await request()).data.orders[0]; assert.deepEqual(listed.customerReceipt, original); assert.deepEqual(tailoringPaymentReceipt(listed, listed.addedPayments[0]), receipt);
  assert.equal(listed.addedPayments.length, 2); assert.equal(listed.paymentReceipts, undefined); assert.equal(listed.addedPayments[0].requestId, undefined); safe(listed.addedPayments[1].document);
});

test('a photographed fabric remains absent from the stored and printable receipt', async t => {
  djellabaFixture(t); const body = input(); body.items[0].imageIndex = 0;
  const form = new FormData(); for (const [key, value] of Object.entries(body)) form.append(key, key === 'items' ? JSON.stringify(value) : String(value)); form.append('images', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'fabric.png');
  const result = await request('', form); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.items[0].hasPhoto, true); safe(result.data.customerReceipt); assert.equal(result.data.customerReceipt.items[0].fabricType, 'قطن 0');
});

test('legacy receipts distinguish current balances from unknown historical balances without fabricating them', async t => {
  const f = djellabaFixture(t), body = input(); const result = await request('', body); const row = f.orders.get(result.data._id);
  const plain = row.toObject(); delete plain.customerReceipt; plain.paidAmount = 200; plain.paymentReceipts = [{ requestId: randomUUID(), amount: 50, paidAt: new Date('2026-11-01T12:00:00Z'), createdBy: owner }]; f.orders.set(result.data._id, new TailoringOrder(plain));
  const legacy = (await request()).data.orders[0]; assert.equal(legacy.customerReceipt, undefined);
  const order = tailoringOrderReceipt(legacy), payment = tailoringPaymentReceipt(legacy, legacy.addedPayments[0]);
  assert.equal(order.historical, false); assert.equal(payment.historical, false); assert.deepEqual([payment.paymentAmount, payment.paidAmount, payment.remainingAmount], [50, 200, 600]); safe(payment);
  const next = await request('/' + legacy._id + '/payments', { amount: 10, requestId: randomUUID(), version: legacy.__v }); assert.equal(next.status, 200); assert.equal(next.data.paymentReceipt.document.historical, true); assert.equal(next.data.paymentReceipt.document.reference.endsWith('-P002'), true);
});

test('failed and concurrent payments cannot leave a receipt without its matching money update', async t => {
  const f = djellabaFixture(t), created = (await request('', input())).data;
  f.faults.orderSave = true; assert.equal((await request('/' + created._id + '/payments', { amount: 50, requestId: randomUUID(), version: 0 })).status, 500);
  assert.equal(f.orders.get(created._id).paidAmount, 100); assert.equal(f.orders.get(created._id).paymentReceipts.length, 0); f.faults.orderSave = false;
  const payments = [1, 2].map(() => ({ amount: 100, requestId: randomUUID(), version: 0 }));
  const responses = await Promise.all(payments.map(body => request('/' + created._id + '/payments', body))); assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  const saved = f.orders.get(created._id); assert.equal(saved.paidAmount, 200); assert.equal(saved.paymentReceipts.length, 1); assert.equal(saved.paymentReceipts[0].document.paidAmount, 200);
});

test('zero-priced orders get printable zero receipts, and employee permissions and ownership still govern payments', async t => {
  const f = djellabaFixture(t), body = input('shirts'); body.items.forEach(item => { item.price = 0; }); body.paidAmount = 0;
  const free = await request('', body); assert.equal(free.status, 201); assert.deepEqual([free.data.customerReceipt.totalPrice, free.data.customerReceipt.paidAmount, free.data.customerReceipt.remainingAmount], [0, 0, 0]);
  const order = (await request('', input())).data; f.staff.action.update = false;
  assert.equal((await request('/' + order._id + '/payments', { amount: 10, requestId: randomUUID(), version: 0 }, 'POST', { id: employee, role: 'Employe' })).status, 403);
  assert.equal((await request('/' + order._id + '/payments', { amount: 10, requestId: randomUUID(), version: 0 }, 'POST', { id: otherOwner, role: 'admin' })).status, 404);
  assert.equal(f.orders.get(order._id).paymentReceipts.length, 0);
});
