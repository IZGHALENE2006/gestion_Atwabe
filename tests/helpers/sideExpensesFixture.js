import Admin from '../../BackEnd/models/AdminModel.js';
import Employee from '../../BackEnd/models/EmployeModele.js';
import SideExpense from '../../BackEnd/models/SideExpense.js';

export const expenseOwner = '111111111111111111111111';
export const expenseOtherOwner = '222222222222222222222222';
export const expenseEmployee = '333333333333333333333333';
const query = read => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(read).then(resolve, reject); } });
export function sideExpensesFixture(t) {
  const admins = new Map([[expenseOwner, { _id: expenseOwner, role: 'admin' }], [expenseOtherOwner, { _id: expenseOtherOwner, role: 'admin' }]]);
  const staff = { _id: expenseEmployee, role: 'Employe', idAdmin: expenseOwner, isActive: true, action: { add: true } };
  const records = new Map(), faults = { afterSave: false, read: false };
  const accountReads = t.mock.method(Admin, 'findById', id => query(() => admins.get(String(id))));
  t.mock.method(Employee, 'findById', id => query(() => String(id) === expenseEmployee ? staff : null));
  const matches = (row, scope) => Object.entries(scope).every(([key, value]) => String(row[key]) === String(value));
  const find = scope => [...records.values()].find(row => matches(row, scope));
  t.mock.method(SideExpense, 'findOne', scope => query(() => find(scope)));
  t.mock.method(SideExpense, 'find', scope => query(() => {
    if (faults.read) throw new Error('Private database information');
    return [...records.values()].filter(row => matches(row, scope)).sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id))).map(row => row.toObject());
  }));
  const creates = t.mock.method(SideExpense, 'create', async data => {
    const doc = new SideExpense({ ...data, createdAt: new Date() });
    await doc.validate();
    if (find({ idAdmin: data.idAdmin, requestId: data.requestId }) || (data.monthlyKey && find({ idAdmin: data.idAdmin, monthlyKey: data.monthlyKey }))) throw Object.assign(new Error('Duplicate request'), { code: 11000 });
    records.set(String(doc._id), doc);
    if (faults.afterSave) { faults.afterSave = false; throw new Error('Lost acknowledgement after write'); }
    return doc;
  });
  return { records, admins, staff, creates, faults, accountReads };
}
