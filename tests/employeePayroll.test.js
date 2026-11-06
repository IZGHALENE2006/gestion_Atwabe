import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import Payroll from '../BackEnd/models/EmployeePayroll.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import { payrollDay, payrollMonth, nextPayrollMonth, payrollCents, validateCompensation, validateEmployeePayment, buildEmployeePayroll } from '../shared/employeePayroll.js';
import { employeePayrollFixture, owner, employeeId } from './helpers/employeePayrollFixture.js';

process.env.JWT_SECRET = 'isolated-employee-payroll-tests';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.closeAllConnections(); server.close(); });
const current = payrollMonth(), currentYear = current.slice(0, 4), previousYear = String(Number(currentYear) - 1), previous = `${previousYear}-12`;
const request = async (id = employeeId, suffix = 'payroll', body, actor = { id: owner, role: 'admin' }) => {
  const response = await fetch(`${base}/Employe/${id}/${suffix}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
const sale = (profit, month = current, name = 'منتج') => ({ profite: profit, DateVante: `${month}-02T12:00:00Z`, name, quantite: 1, price: 9999 });
const payment = (amount, month = current) => ({ amount, month, paidOn: payrollDay(), note: '', requestId: randomUUID() });

test('money validation rejects malformed, fractional-cent, negative and excessive salaries', () => {
  for (const amount of ['', null, true, {}, -1, Infinity, 1.001, 1e10]) assert.equal(payrollCents(amount), null);
  assert.equal(payrollCents('30.30'), 3030); assert.equal(payrollCents(-15, true), -1500);
  for (const input of [{ type: 'unknown', effectiveMonth: current }, { type: 'monthly', monthlyAmount: 0, effectiveMonth: current }, { type: 'monthly', monthlyAmount: 1, effectiveMonth: '2026-13' }, { type: 'profitShare', effectiveMonth: nextPayrollMonth(nextPayrollMonth(current)) }]) assert.throws(() => validateCompensation(input));
  assert.deepEqual(validateCompensation({ type: 'profitShare', monthlyAmount: 999, effectiveMonth: current }), { type: 'profitShare', monthlyAmount: 0, effectiveMonth: current });
});
test('months follow Paris local calendar and safely cross years', () => {
  assert.equal(payrollMonth('2025-12-31T23:30:00Z'), '2026-01'); assert.equal(nextPayrollMonth('2025-12'), '2026-01');
  assert.equal(payrollMonth('invalid'), null);
});
test('fixed monthly balances retain unpaid months and do not mix their payments', () => {
  const report = buildEmployeePayroll([{ type: 'monthly', monthlyAmount: 1500, effectiveMonth: '2025-12' }], [], [{ month: '2025-12', amount: 500 }, { month: '2026-01', amount: 1500 }], '2026-02');
  assert.deepEqual(report.months.map(row => [row.month, row.earned, row.paid, row.due, row.status]), [['2026-02',1500,0,1500,'unpaid'], ['2026-01',1500,1500,0,'paid'], ['2025-12',1500,500,1000,'partial']]);
  assert.deepEqual(report.totals, { earned:4500, paid:2000, due:2500, overpaid:0 });
});
test('commission is exactly a third of monthly saved net profits including losses, rounded once', () => {
  const report = buildEmployeePayroll([{ type: 'profitShare', monthlyAmount: 0, effectiveMonth: '2026-01' }], [sale(15, '2026-01'), sale(20, '2026-01'), sale(-5, '2026-01'), sale(0.01, '2026-01'), sale(900, '2026-02')], [], '2026-01');
  assert.equal(report.months[0].profit, 30.01); assert.equal(report.months[0].earned, 10); assert.equal(report.months[0].salesCount, 4); assert.equal(report.months[0].provisional, true);
});
test('commission months without sales or with net losses have no debt; excess paid stays visible', () => {
  const report = buildEmployeePayroll([{ type: 'profitShare', monthlyAmount: 0, effectiveMonth: '2026-01' }], [sale(-30,'2026-01')], [{ month:'2026-01',amount:5 }], '2026-02');
  assert.equal(report.months[0].earned,0); assert.equal(report.months[1].due,0); assert.equal(report.totals.overpaid,5);
});
test('undated or invalid sales cannot silently become commission for the current month', () => {
  const report = buildEmployeePayroll([{ type:'profitShare',monthlyAmount:0,effectiveMonth:current }],[{profite:300},{profite:300,DateVante:null},{profite:300,DateVante:'invalid'}],[],current);
  assert.equal(report.months[0].earned,0);assert.equal(report.months[0].salesCount,0);
});
test('future changes never alter fixed salary months or create future debt', () => {
  const plans = [{ type:'monthly', monthlyAmount:1000,effectiveMonth:'2025-12' }, {type:'profitShare',monthlyAmount:0,effectiveMonth:'2026-02'}];
  const report = buildEmployeePayroll(plans,[sale(600,'2026-02')],[], '2026-02');
  assert.deepEqual(report.months.map(row=>row.earned),[200,1000,1000]);
  assert.equal(buildEmployeePayroll(plans,[],[],'2025-11').months.length,0);
});
test('payment validation requires an existing calendar date, positive cents, past/current month and short note', () => {
  const valid = payment(5); assert.equal(validateEmployeePayment(valid).amount, 5);
  for (const change of [{ amount:0 },{ amount:0.001 },{ month:nextPayrollMonth(current) },{ paidOn:'2026-02-30' },{ paidOn:'9999-01-01' },{ note:'x'.repeat(301) },{ note:'bad\nvalue' }]) assert.throws(()=>validateEmployeePayment({...valid,...change}));
});
test('new employee compensation is persisted and invalid settings fail before creation', async t => {
  const fixture = employeePayrollFixture(t);
  const input = { name:'موظف جديد',email:'new@example.test',cin:'CD123456',password:'fixture',compensation:{type:'monthly',monthlyAmount:2300,effectiveMonth:current} };
  const token = jwt.sign({id:owner,role:'admin'},process.env.JWT_SECRET);
  const send = async data => {const r = await fetch(base+'/Employe/add',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  const invalid = await send({...input,compensation:{...input.compensation,monthlyAmount:-1}}); assert.equal(invalid.status,400);
  const result = await send(input); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(fixture.rows(Employee).at(-1).compensation.monthlyAmount,2300);
});
test('monthly account can be configured for an existing employee and displays all unpaid months', async t => {
  employeePayrollFixture(t);
  let result = await request(); assert.equal(result.status,200); assert.equal(result.data.months.length,0);
  result=await request(employeeId,'compensation',{type:'monthly',monthlyAmount:1200,effectiveMonth:previous}); assert.equal(result.status,201,JSON.stringify(result));
  result=await request(); assert.equal(result.data.months.at(-1).month,previous); assert.equal(result.data.months[0].due,1200);
});
test('owner scoping and staff access protect payroll reads, configuration and payments', async t => {
  const fixture = employeePayrollFixture(t);
  for (const [suffix, body] of [['payroll',undefined],['compensation',{type:'monthly',monthlyAmount:1,effectiveMonth:current}],['payments',payment(1)]]) {
    assert.equal((await request(fixture.foreign._id,suffix,body)).status,404);
    assert.equal((await request(employeeId,suffix,body,{id:employeeId,role:'Employe',idAdmin:owner})).status,403);
  }
  assert.equal((await request('bad-id')).status,404);
});
test('commission uses only this employee and their saved batch profit, including credit sales', async t => {
  const fixture=employeePayrollFixture(t); fixture.employee.compensation={type:'profitShare',monthlyAmount:0,effectiveMonth:current};
  fixture.employee.ventes.push(sale(150),{...sale(120),saleType:'credit'},sale(-30));
  fixture.seed(Employee,{idAdmin:owner,name:'زميل',ventes:[sale(9999)]});
  const result=await request(); assert.equal(result.status,200,JSON.stringify(result)); assert.equal(result.data.months[0].profit,240); assert.equal(result.data.months[0].earned,80); assert.equal(result.data.sales.length,3);
});
test('partial payment creates immutable receipt; retry cannot duplicate payment or change its body', async t => {
  const fixture=employeePayrollFixture(t); fixture.employee.compensation={type:'monthly',monthlyAmount:1000,effectiveMonth:previous};
  const input=payment(400,previous), result=await request(employeeId,'payments',input);
  assert.equal(result.status,201,JSON.stringify(result)); const receipt=result.data.payment;
  assert.equal(receipt.remaining,600); assert.equal(receipt.paidBefore,0); assert.equal(receipt.paidAfter,400); assert.equal(receipt.employeeName,fixture.employee.name); assert.equal(receipt.createdByName,'مالك المحل'); assert.ok(receipt.reference.startsWith('EP-')); assert.equal(receipt.requestId,undefined);
  assert.equal((await request(employeeId,'payments',input)).status,200);
  assert.equal((await request(employeeId,'payments',{...input,amount:200})).status,409);
  const final=await request(employeeId,'payments',payment(600,previous)); assert.equal(final.status,201); assert.equal(final.data.payment.remaining,0);
  const account=await request(); assert.equal(account.data.months.find(row=>row.month===previous).status,'paid'); assert.equal(account.data.months.find(row=>row.month===current).due,1000);
  assert.equal(account.data.payments.find(row=>row._id===receipt._id).remaining,600); assert.equal(fixture.rows(Payroll)[0].payments.length,2);
});
test('payment cannot exceed a monthly balance or precede the compensation agreement', async t => {
  const fixture=employeePayrollFixture(t);fixture.employee.compensation={type:'monthly',monthlyAmount:100,effectiveMonth:current};
  for(const input of [payment(101),payment(1,previous),{...payment(1),requestId:'invalid'}]) assert.ok([400,409].includes((await request(employeeId,'payments',input)).status));
  assert.equal(fixture.rows(Payroll)[0].payments.length,0);
});
test('concurrent payments serialize; same request retried concurrently remains idempotent', async t => {
  const fixture=employeePayrollFixture(t);fixture.employee.compensation={type:'monthly',monthlyAmount:100,effectiveMonth:current};await request();
  const results=await Promise.all([request(employeeId,'payments',payment(80)),request(employeeId,'payments',payment(80))]);
  assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);assert.equal(fixture.rows(Payroll)[0].payments.length,1);
  const input=payment(20), retries=await Promise.all([request(employeeId,'payments',input),request(employeeId,'payments',input)]);
  assert.deepEqual(retries.map(row=>row.status).sort(),[200,201]);assert.equal(fixture.rows(Payroll)[0].payments.length,2);
});
test('changing salary applies next month; an earlier receipt and debt remain unchanged', async t => {
  const fixture=employeePayrollFixture(t);fixture.employee.compensation={type:'monthly',monthlyAmount:100,effectiveMonth:current};
  await request(employeeId,'payments',payment(25));
  assert.equal((await request(employeeId,'compensation',{type:'profitShare',effectiveMonth:current})).status,409);
  assert.equal((await request(employeeId,'compensation',{type:'profitShare',effectiveMonth:nextPayrollMonth(current)})).status,201);
  assert.equal((await request(employeeId,'compensation',{type:'monthly',monthlyAmount:500,effectiveMonth:nextPayrollMonth(current)})).status,409);
  const result=await request();assert.equal(result.data.months[0].due,75);assert.equal(result.data.payments[0].earned,100);assert.equal(result.data.plans.length,2);
});
test('unknown historical sale profits block commission payments instead of inventing a cost', async t => {
  const fixture=employeePayrollFixture(t);fixture.employee.compensation={type:'profitShare',monthlyAmount:0,effectiveMonth:current};fixture.employee.ventes.push(sale(300),sale(undefined));
  assert.equal((await request(employeeId,'payments',payment(10))).status,409);assert.equal(fixture.rows(Payroll)[0].payments.length,0);
});
