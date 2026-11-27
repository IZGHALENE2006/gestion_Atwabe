import bcrypt from 'bcryptjs';
import Admin from '../../BackEnd/models/AdminModel.js';
import Employee from '../../BackEnd/models/EmployeModele.js';

export const adminId = '111111111111111111111111', employeeId = '333333333333333333333333';
export const originalPassword = 'Original-test-123!';
const clone = value => JSON.parse(JSON.stringify(value));
const query = task => ({ select() { return this; }, then(resolve, reject) { return Promise.resolve().then(task).then(resolve, reject); } });

// Mock only persistence: real Mongoose validation and pre-save password hooks
// must execute so the regression test detects accidental double hashing.
export async function passwordChangeFixture(t) {
  const admins = new Map([[adminId, { _id: adminId, name: 'مدير الاختبار', email: 'admin@example.test', role: 'admin', password: await bcrypt.hash(originalPassword, 10) }]]);
  const employees = new Map([[employeeId, { _id: employeeId, idAdmin: adminId, name: 'موظف الاختبار', email: 'staff@example.test', role: 'Employe', isActive: true, moduleAccess: [], password: originalPassword }]]);
  const control = { failWrite: false, writes: 0 };
  for (const [Model, rows] of [[Admin, admins], [Employee, employees]]) {
    const hydrate = row => row ? Model.hydrate(clone(row)) : null;
    t.mock.method(Model, 'findById', id => query(() => hydrate(rows.get(String(id)))));
    t.mock.method(Model, 'findOne', scope => query(() => hydrate([...rows.values()].find(row => Object.entries(scope).every(([key, value]) => String(row[key]) === String(value))))));
    t.mock.method(Model.collection, 'updateOne', async (scope, update) => {
      if (control.failWrite) throw Error('Isolated password persistence failure');
      const old = rows.get(String(scope._id));
      if (!old) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      rows.set(String(scope._id), { ...old, ...clone(update.$set || {}) }); control.writes++;
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
    t.mock.method(Model.collection, 'insertOne', async input => { if (control.failWrite) throw Error('Isolated password persistence failure'); rows.set(String(input._id), clone(input)); control.writes++; return { acknowledged: true, insertedId: input._id }; });
  }
  return { admins, employees, control };
}
