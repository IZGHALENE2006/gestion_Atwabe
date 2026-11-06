import Employee from '../../BackEnd/models/EmployeModele.js';
import Admin from '../../BackEnd/models/AdminModel.js';
import Payroll from '../../BackEnd/models/EmployeePayroll.js';
import { matches, memoryQuery } from './modelMemory.js';

export const owner = '111111111111111111111111', otherOwner = '222222222222222222222222', employeeId = '555555555555555555555555';
export function employeePayrollFixture(t) {
  const rows = new Map([[Employee, []], [Admin, []], [Payroll, []]]);
  const clone = row => row ? new row.constructor(row.toObject()) : null;
  const seed = (Model, data) => { const doc = new Model({ __v: 0, ...data }); rows.get(Model).push(doc); return doc; };
  for (const Model of rows.keys()) {
    t.mock.method(Model, 'findOne', scope => memoryQuery(() => clone(rows.get(Model).find(row => matches(row, scope)))));
    t.mock.method(Model, 'findById', id => memoryQuery(() => clone(rows.get(Model).find(row => String(row._id) === String(id)))));
    t.mock.method(Model, 'create', async input => {
      const doc = new Model({ __v: 0, ...input }); await doc.validate();
      if (Model === Payroll && rows.get(Model).some(row => String(row.idAdmin) === String(doc.idAdmin) && String(row.employeeId) === String(doc.employeeId))) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      rows.get(Model).push(doc); return clone(doc);
    });
  }
  t.mock.method(Payroll.prototype, 'save', async function () {
    await this.validate();
    const list = rows.get(Payroll), index = list.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || list[index].__v !== this.__v) throw Object.assign(new Error('Version changed'), { name: 'VersionError' });
    this.__v++; list[index] = clone(this); return this;
  });
  seed(Admin, { _id: owner, name: 'مالك المحل' });
  const employee = seed(Employee, { _id: employeeId, idAdmin: owner, name: 'أمين المبيعات', cin: 'AB123456', phone: '0612345678', isActive: true, email: 'employee@example.test', password: 'fixture-password', moduleAccess: ['cashier'], action: { add: true } });
  const foreign = seed(Employee, { idAdmin: otherOwner, name: 'موظف محل آخر', isActive: true });
  return { rows: Model => rows.get(Model), employee, foreign, seed };
}
