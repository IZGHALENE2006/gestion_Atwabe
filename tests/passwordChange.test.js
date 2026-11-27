import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Admin from '../BackEnd/models/AdminModel.js';
import { passwordChangeError } from '../shared/passwordChange.js';
import { passwordChangeFixture, adminId, employeeId, originalPassword } from './helpers/passwordChangeFixture.js';

const originalSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-password-change'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
const admin = { id: adminId, role: 'admin' }, staff = { id: employeeId, role: 'Employe' };
const newPassword = 'New-test-password-456!';
const input = patch => ({ old: originalPassword, newpass: newPassword, newpass2: newPassword, ...patch });
async function request(path, body, actor) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const change = (body, actor = admin) => request('/api/admin/UpdatePassword', body, actor);
const login = (password, role = 'admin') => request(role === 'admin' ? '/api/admin/Login' : '/Employe/Login', { email: role === 'admin' ? 'admin@example.test' : 'staff@example.test', password });

test('admin password change runs the actual save hook exactly once and the new password works for login', async t => {
  const f = await passwordChangeFixture(t), before = f.admins.get(adminId).password;
  assert.equal((await login(originalPassword)).status, 200);
  const result = await change(input()); assert.equal(result.status, 200); assert.deepEqual(result.data, { message: 'Password updated successfully' });
  const stored = f.admins.get(adminId).password; assert.notEqual(stored, before); assert.notEqual(stored, newPassword); assert.ok(await bcrypt.compare(newPassword, stored));
  assert.equal((await login(newPassword)).status, 200); assert.equal((await login(originalPassword)).status, 404);
  const next = 'Another-test-password-789!'; assert.equal((await change(input({ old: newPassword, newpass: next, newpass2: next }))).status, 200); assert.equal((await login(next)).status, 200); assert.equal((await login(newPassword)).status, 404);
  assert.equal(f.control.writes, 2);
});

test('changing profile fields does not hash an unchanged password again; registration still hashes once', async t => {
  const f = await passwordChangeFixture(t), before = f.admins.get(adminId).password, row = await Admin.findById(adminId);
  row.name = 'اسم جديد'; await row.save(); assert.equal(f.admins.get(adminId).password, before); assert.equal((await login(originalPassword)).status, 200);
  const created = new Admin({ name: 'مدير آخر', email: 'other@example.test', password: newPassword }); await created.save(); assert.ok(await bcrypt.compare(newPassword, f.admins.get(String(created._id)).password));
});

test('employee changes only their own password and can login with the replacement without business module access', async t => {
  const f = await passwordChangeFixture(t), adminBefore = f.admins.get(adminId).password;
  assert.equal((await change(input({ id: adminId, role: 'admin', idAdmin: '999999999999999999999999' }), staff)).status, 200);
  assert.equal((await login(newPassword, 'Employe')).status, 200); assert.equal((await login(originalPassword, 'Employe')).status, 404); assert.equal(f.admins.get(adminId).password, adminBefore); assert.deepEqual(f.employees.get(employeeId).moduleAccess, []);
});

test('wrong current password, absent fields, mismatched confirmation and invalid types leave both accounts unchanged', async t => {
  const f = await passwordChangeFixture(t), before = JSON.stringify([...f.admins, ...f.employees]);
  assert.equal(passwordChangeError(null), 'passwordFieldsRequired');
  for (const actor of [admin, staff]) for (const bad of [input({ old: 'wrong-test-password' }), {}, input({ old: {} }), input({ newpass: 12345678, newpass2: 12345678 }), input({ newpass2: 'different-password' }), input({ newpass: 'short', newpass2: 'short' }), input({ newpass: 'a'.repeat(73), newpass2: 'a'.repeat(73) })]) {
    const result = await change(bad, actor); assert.equal(result.status, 400, JSON.stringify(result.data));
  }
  assert.equal(f.control.writes, 0); assert.equal(JSON.stringify([...f.admins, ...f.employees]), before);
});

test('authentication and current active-account checks cannot be bypassed by a forged body or JWT role', async t => {
  const f = await passwordChangeFixture(t);
  assert.equal((await change(input(), null)).status, 401);
  assert.equal((await change(input(), { id: adminId, role: 'unknown' })).status, 403);
  assert.equal((await change(input(), { id: '999999999999999999999999', role: 'admin' })).status, 404);
  f.employees.get(employeeId).isActive = false; assert.equal((await change(input(), staff)).status, 403);
  assert.equal(f.control.writes, 0);
});

test('a failed save reports failure, leaves the old password valid and allows a subsequent successful change', async t => {
  const f = await passwordChangeFixture(t); f.control.failWrite = true;
  assert.equal((await change(input())).status, 500); assert.equal((await login(originalPassword)).status, 200); assert.equal((await login(newPassword)).status, 404);
  f.control.failWrite = false; assert.equal((await change(input())).status, 200); assert.equal((await login(newPassword)).status, 200);
});

test('validation preserves spaces and unicode and rejects passwords beyond bcrypt’s byte limit', async t => {
  const f = await passwordChangeFixture(t), password = '  اختبار كلمة المرور  ';
  assert.equal(passwordChangeError(input({ newpass: password, newpass2: password })), null);
  assert.equal((await change(input({ newpass: password, newpass2: password }))).status, 200); assert.equal((await login(password)).status, 200); assert.equal((await login(password.trim())).status, 404);
  const long = 'ع'.repeat(37); assert.equal(passwordChangeError(input({ newpass: long, newpass2: long })), 'passwordTooLong'); assert.equal(f.control.writes, 1);
});
