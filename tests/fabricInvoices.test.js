import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import { fabricInvoiceFixture } from './helpers/fabricInvoiceFixture.js';
import { owner, otherOwner, employeeId, colleagueId, inactiveId } from './helpers/creditCheckoutFixture.js';
import { creditInvoiceBalances } from '../shared/creditInvoiceBalances.js';
import { employeeCanRequest } from '../shared/employeeRequestPermissions.js';
import { validateFabricInvoice } from '../shared/fabricInvoices.js';
import { creditInvoiceReference } from '../shared/creditDocuments.js';
process.env.JWT_SECRET = 'isolated-fabric-invoice-tests';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const admin = { id: owner, role: 'admin' }, staff = { id: employeeId, role: 'Employe' };
async function request(path, body, actor = admin, method = body === undefined ? 'GET' : 'POST') { const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; }
const line = (fabric, meters) => ({ fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), pieceId: String(fabric.colors[0].pieces[0]._id), meters, pricingMode: 'retail', discountValue: '', expectedUnitPrice: fabric.salePricePerMeter });
const input = (f, patch) => ({ requestId: randomUUID(), paymentMode: 'paid', clientName: 'مريم', phone: '0612345678', lines: [line(f.first, 2), line(f.second, 1.25)], ...patch });
const creditInput = (f, patch) => input(f, { paymentMode: 'credit', customerId: String(f.customer._id), amountPaid: 20, ...patch });
const create = body => request('/fabrics/invoices', body);

test('one cash invoice deducts several fabrics, records their exact profits and prints only public prices', async t => {
  const f = fabricInvoiceFixture(t), result = await create(input(f)); assert.equal(result.status, 201, JSON.stringify(result.data)); const invoice = result.data.invoice;
  assert.equal(invoice.total, 116.25); assert.equal(invoice.paidAmount, 116.25); assert.equal(invoice.remaining, 0); assert.equal(invoice.lines.length, 2); assert.equal(invoice.customer.name, 'مريم');
  assert.deepEqual(f.fabrics().map(row => row.colors[0].pieces[0].meters), [28, 28.75]);
  assert.equal(f.fabrics().flatMap(row => row.movements).reduce((sum, row) => sum + row.sale.profitAmount, 0), 61.25);
  assert.doesNotMatch(JSON.stringify(invoice), /purchaseUnitPrice|costAmount|profitAmount|fingerprint|requestId|invoiceDebits/);
  assert.equal(f.account().Total, 300); assert.equal(invoice.payments[0].document.remaining, 0);
  const profits = await request('/fabrics/profits'); assert.equal(profits.status, 200); assert.equal(profits.data.summary.revenueAmount ?? profits.data.summary.revenue, 116.25);
});
test('partial credit writes the full invoice and initial payment once to the existing account', async t => {
  const f = fabricInvoiceFixture(t), body = creditInput(f); let result = await create(body); assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.invoice.remaining, 96.25); assert.equal(f.account().Total, 416.25); assert.equal(f.account().Paye, 120); assert.equal(f.account().creditInvoices[0].origin, 'fabric');
  assert.deepEqual(f.account().produit.slice(1).map(row => row.Quantite), [2, 1.25]);
  assert.equal(creditInvoiceReference(f.account().creditInvoices[0]), result.data.invoice.reference);
  result = await create(body); assert.equal(result.status, 201); assert.equal(f.account().creditInvoices.length, 1); assert.equal(f.account().paymentHistory.length, 1); assert.deepEqual(f.fabrics().map(row => row.colors[0].pieces[0].meters), [28, 28.75]);
});
test('each invoice line keeps its own percentage or amount discount in revenue and credit totals', async t => {
  const f = fabricInvoiceFixture(t), body = creditInput(f, { lines: [{ ...line(f.first, 2), discountType: 'percent', discountValue: 10 }, { ...line(f.second, 1.25), discountType: 'amount', discountValue: 6.25 }] });
  const result = await create(body); assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.invoice.subtotal, 116.25); assert.equal(result.data.invoice.discountAmount, 12.25); assert.equal(result.data.invoice.total, 104); assert.equal(result.data.invoice.remaining, 84); assert.deepEqual(result.data.invoice.lines.map(row => row.total), [54, 50]); assert.equal(f.account().Total, 404);
});
test('a new credit customer can buy fractional meters entirely on credit and retains the employee attribution', async t => {
  const f = fabricInvoiceFixture(t), body = input(f, { lines: [line(f.first, 0.25)], paymentMode: 'credit', amountPaid: 0, newCustomer: { name: 'فاطمة الجديدة', phone: '0600000000', email: 'client@example.test' } });
  const result = await request('/fabrics/invoices', body, staff); assert.equal(result.status, 201, JSON.stringify(result.data));
  const account = f.accounts().find(row => row.name === 'فاطمة الجديدة'); assert.ok(account); assert.equal(account.Total, 7.5); assert.equal(account.Paye, 0); assert.equal(account.produit[0].Quantite, 0.25); assert.equal(account.produit[0].unit, 'meter');
  assert.equal(String(account.createdBy.id), employeeId); assert.equal(String(account.creditInvoices[0].actor.id), employeeId); assert.equal(result.data.invoice.actor.name, f.rows(Employee)[0].name);
});
test('invalid invoices, stale prices and foreign credit customers leave all stock and credit unchanged', async t => {
  const f = fabricInvoiceFixture(t);
  const bodies = [input(f, { lines: [] }), input(f, { lines: [line(f.first, 1), line(f.first, 2)] }), input(f, { lines: [line(f.first, 31)] }), input(f, { lines: [{ ...line(f.first, 1), expectedUnitPrice: 29 }] }), creditInput(f, { amountPaid: 200 }), creditInput(f, { customerId: String(f.foreignCustomer._id) }), creditInput(f, { amountPaid: -1 }), creditInput(f, { newCustomer: { name: 'x' } })];
  for (const body of bodies) assert.ok((await create(body)).status >= 400);
  assert.deepEqual(f.fabrics().map(row => row.colors[0].pieces[0].meters), [30, 30]); assert.equal(f.invoices().length, 0); assert.equal(f.account().Total, 300);
  assert.throws(() => validateFabricInvoice(input(f, { requestId: 'invalid' })));
});
test('reusing a request with changed inputs or another actor cannot change its invoice', async t => {
  const f = fabricInvoiceFixture(t), body = input(f); const first = await create(body); assert.equal(first.status, 201);
  f.fabrics()[0].salePricePerMeter = 99;
  assert.equal((await create(body)).data.invoice.total, 116.25);
  assert.equal((await create({ ...body, clientName: 'other' })).status, 409);
  assert.equal((await request('/fabrics/invoices', body, staff)).status, 409);
  const other = await request('/fabrics/invoices', undefined, { id: otherOwner, role: 'admin' }); assert.equal(other.status, 200); assert.deepEqual(other.data.invoices, []);
});
for (const fault of ['fabricReserveAfterSave', 'creditBeforeSave', 'creditAfterSave', 'fabricRecordAfterSave', 'invoiceCompleteAfterSave']) test('lost acknowledgement at ' + fault + ' is recoverable without duplicate meters, debt or receipts', async t => {
  const f = fabricInvoiceFixture(t), body = creditInput(f); f.controls[fault] = true;
  assert.equal((await create(body)).status, 503);
  const result = await create(body); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.invoice.status, 'complete');
  assert.equal(f.account().Total, 416.25); assert.equal(f.account().Paye, 120); assert.equal(f.account().creditInvoices.length, 1); assert.equal(f.account().paymentHistory.length, 1);
  assert.deepEqual(f.fabrics().map(row => row.colors[0].pieces[0].meters), [28, 28.75]); assert.equal(f.fabrics().flatMap(row => row.movements).length, 2);
});
test('stock changing between preparation and reservation compensates all prior reservations', async t => {
  const f = fabricInvoiceFixture(t); f.controls.fabricStockRace = true; const body = creditInput(f);
  const result = await create(body); assert.equal(result.status, 409); assert.equal(result.data.message, 'invoiceCancelled');
  assert.equal(f.fabrics()[0].colors[0].pieces[0].meters, 30); assert.equal(f.fabrics()[0].movements.length, 0); assert.ok(f.fabrics()[0].invoiceDebits[0].returnedAt); assert.equal(f.invoices()[0].status, 'cancelled'); assert.equal(f.account().Total, 300);
  assert.equal((await create(body)).status, 409); assert.equal(f.fabrics()[0].colors[0].pieces[0].meters, 30);
});
test('invoice payments and payments entered in credit share one balance and historical receipts', async t => {
  const f = fabricInvoiceFixture(t); const created = await create(creditInput(f)); assert.equal(created.status, 201); const invoice = created.data.invoice, body = { requestId: randomUUID(), amount: 30 };
  let result = await request('/fabrics/invoices/' + invoice._id + '/payments', body, staff); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.invoice.remaining, 66.25); assert.equal(result.data.payment.document.amount, 30); assert.equal(result.data.payment.document.remainingBefore, 96.25); assert.equal(result.data.payment.document.remaining, 66.25); assert.equal(String(result.data.payment.actor.id), employeeId);
  assert.equal((await request('/fabrics/invoices/' + invoice._id + '/payments', body, staff)).data.invoice.remaining, 66.25);
  result = await request('/usercridite/add-payment/' + f.customer._id, { requestId: randomUUID(), amount: 220 }); assert.equal(result.status, 200, JSON.stringify(result.data));
  const listed = await request('/fabrics/invoices'); const updated = listed.data.invoices[0]; assert.equal(updated.remaining, 46.25); assert.equal(updated.paidAmount, 70); assert.equal(updated.payments.at(-1).amount, 20); assert.equal(updated.payments.at(-1).document.remaining, 46.25);
  assert.equal(f.account().Total - f.account().Paye, 46.25); assert.equal(creditInvoiceBalances(f.account()).get(invoice._id).remaining, 46.25);
  assert.equal((await request('/fabrics/invoices/' + invoice._id + '/payments', { requestId: randomUUID(), amount: 47 })).status, 400);
});
test('linked credit lines and customer accounts cannot be removed behind their invoices', async t => {
  const f = fabricInvoiceFixture(t); await create(creditInput(f));
  assert.equal((await request('/usercridite/DeleteProduct/' + f.customer._id + '/' + f.account().produit[1].id, undefined, admin, 'DELETE')).status, 409);
  assert.equal((await request('/usercridite/Delete/' + f.customer._id, undefined, admin, 'DELETE')).status, 409); assert.equal(f.account().Total, 416.25);
});
test('historical payments for deleted purchases never settle a newly created fabric invoice', async t => {
  const f = fabricInvoiceFixture(t);
  assert.equal((await request('/usercridite/add-payment/' + f.customer._id, { requestId: randomUUID(), amount: 100 })).status, 200);
  assert.equal((await request('/usercridite/DeleteProduct/' + f.customer._id + '/OLD', undefined, admin, 'DELETE')).status, 200);
  assert.equal(f.account().Paye, 0);
  const result = await create(creditInput(f)); assert.equal(result.status, 201); assert.equal(result.data.invoice.paidAmount, 20); assert.equal(result.data.invoice.remaining, 96.25); assert.equal(result.data.invoice.payments.length, 1);
});
test('current employee operations control invoice creation, credit, payments and cross-shop access', async t => {
  const f = fabricInvoiceFixture(t), actor = f.rows(Employee)[0]; actor.moduleAccess = ['fabrics', 'credit']; actor.operationPermissions = { fabrics: ['invoiceHistory'], credit: ['addDebt'] };
  assert.equal((await request('/fabrics/invoices', input(f), staff)).status, 403); assert.equal((await request('/fabrics/invoices', undefined, staff)).status, 200);
  actor.operationPermissions.fabrics.push('addInvoice', 'sell'); assert.equal((await request('/fabrics/invoices', creditInput(f), staff)).status, 403);
  actor.operationPermissions.fabrics.push('creditSale'); assert.equal((await request('/fabrics/invoices', creditInput(f), staff)).status, 403);
  actor.operationPermissions.credit.push('payment'); const result = await request('/fabrics/invoices', creditInput(f), staff); assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal((await request('/fabrics/invoices/' + result.data.invoice._id + '/payments', { amount: 1, requestId: randomUUID() }, staff)).status, 403);
  assert.equal((await request('/fabrics/invoices', input(f), { id: inactiveId, role: 'Employe' })).status, 403);
  assert.equal(employeeCanRequest(actor, 'POST', '/fabrics/invoices', creditInput(f)), true); actor.operationPermissions.credit = []; assert.equal(employeeCanRequest(actor, 'POST', '/fabrics/invoices', creditInput(f)), false);
});
test('colleagues can see invoices but cannot replay another employee’s unfinished sale', async t => {
  const f = fabricInvoiceFixture(t), body = creditInput(f); f.controls.fabricReserveAfterSave = true;
  assert.equal((await request('/fabrics/invoices', body, staff)).status, 503); const invoice = f.invoices()[0];
  assert.equal((await request('/fabrics/invoices/' + invoice._id + '/resume', {}, { id: colleagueId, role: 'Employe' })).status, 403);
  assert.equal((await request('/fabrics/invoices/' + invoice._id + '/resume', {})).status, 200); assert.equal(f.account().creditInvoices[0].actor.name, f.rows(Employee)[0].name);
});
