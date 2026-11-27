import bcrypt from 'bcryptjs';
import Admin from '../../BackEnd/models/AdminModel.js';
import Employee from '../../BackEnd/models/EmployeModele.js';
import { adminId, employeeId, originalPassword } from './passwordChangeFixture.js';
export { adminId, employeeId, originalPassword };

const clone = value => JSON.parse(JSON.stringify(value));
const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$gt' in value ? new Date(get(row, key)) > new Date(value.$gt) : String(get(row, key)) === String(value));
function set(row, key, value, remove = false) {
  const parts = key.split('.'), last = parts.pop(); let target = row;
  for (const part of parts) target = target[part] ||= {};
  if (remove) delete target[last]; else target[last] = clone(value);
}
function project(row, projection = {}) {
  const copy = clone(row), inclusions = Object.entries(projection).filter(([, value]) => value === 1);
  if (inclusions.length) return Object.fromEntries([['_id', copy._id], ...inclusions.filter(([key]) => copy[key] !== undefined).map(([key]) => [key, copy[key]])]);
  for (const [key, value] of Object.entries(projection)) if (!value) set(copy, key, undefined, true);
  return copy;
}

// Run real Mongoose queries, field projections, update casting/validation and
// password hooks; replace only MongoDB I/O with isolated in-memory records.
export async function adminRecoveryFixture(t) {
  const admins = new Map([[adminId, { _id: adminId, name: 'مدير الاختبار', email: 'admin@example.test', role: 'admin', password: await bcrypt.hash(originalPassword, 10) }]]);
  const employees = new Map([[employeeId, { _id: employeeId, idAdmin: adminId, name: 'موظف الاختبار', role: 'Employe', isActive: true, moduleAccess: [] }]]);
  const control = { failWrite: false, writes: 0, beforeWrite: null };
  for (const [Model, rows] of [[Admin, admins], [Employee, employees]]) {
    t.mock.method(Model.collection, 'findOne', async (filter, options = {}) => {
      const row = [...rows.values()].find(row => matches(row, filter));
      return row ? project(row, options.projection) : null;
    });
    t.mock.method(Model.collection, 'updateOne', async (filter, update) => {
      if (control.failWrite) throw Error('Isolated recovery persistence failure');
      if (control.beforeWrite) await control.beforeWrite(filter, update);
      const row = [...rows.values()].find(row => matches(row, filter));
      if (!row) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      for (const [key, value] of Object.entries(update.$set || {})) set(row, key, value);
      for (const key of Object.keys(update.$unset || {})) set(row, key, undefined, true);
      control.writes++; return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }
  return { admins, employees, control };
}
