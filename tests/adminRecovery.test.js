import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Admin from '../BackEnd/models/AdminModel.js';
import { saveRecoveryCode, verifyRecoveryCode, resetAdminPassword, recoveryStatus } from '../BackEnd/controlles/AdminRecovery.js';
import { createRecoveryLimit } from '../BackEnd/middleware/adminRecoveryLimit.js';
import { recoveryCodeError, recoveryEmail } from '../shared/adminRecovery.js';
import { adminRecoveryFixture, adminId, employeeId, originalPassword } from './helpers/adminRecoveryFixture.js';

const code = 'Recovery-test-code-123!', newpass = 'New-recovered-password-456!', nextpass = 'Next-password-789!';
const codeBody = patch => ({ code, confirmation: code, currentPassword: originalPassword, ...patch });
const verifyBody = patch => ({ email: 'admin@example.test', code, ...patch });
const resetBody = (proof, patch) => ({ proof, newpass, newpass2: newpass, ...patch });
async function invoke(handler, body, user = { id: adminId, role: 'admin' }) {
  const result = { status: 200, headers: {}, data: null };
  const res = { set(key, value) { result.headers[key] = value; return this; }, status(value) { result.status = value; return this; }, json(value) { result.data = JSON.parse(JSON.stringify(value)); return this; } };
  await handler({ body, user }, res); return result;
}
const setup = async t => { const f = await adminRecoveryFixture(t); assert.equal((await invoke(saveRecoveryCode, codeBody())).status, 200); return f; };
const verify = patch => invoke(verifyRecoveryCode, verifyBody(patch));
const reset = (proof, patch) => invoke(resetAdminPassword, resetBody(proof, patch));

test('recovery code is hashed, bound to the authenticated account, hidden from profiles and does not change its password', async t => {
  const f = await adminRecoveryFixture(t), initial = f.admins.get(adminId).password;
  assert.deepEqual((await invoke(recoveryStatus)).data, { configured: false });
  assert.equal((await invoke(saveRecoveryCode, codeBody({ id: '222222222222222222222222' }))).status, 200);
  const stored = f.admins.get(adminId).passwordRecovery;
  assert.ok(await bcrypt.compare(code, stored.codeHash)); assert.notEqual(stored.codeHash, code); assert.equal(f.admins.get(adminId).password, initial);
  assert.deepEqual((await invoke(recoveryStatus)).data, { configured: true });
  assert.equal((await Admin.findById(adminId).select('-password')).passwordRecovery, undefined);
  assert.equal((await Admin.findById(adminId).lean()).passwordRecovery, undefined);
  assert.equal((await Admin.findById(adminId).select('+passwordRecovery')).toJSON().passwordRecovery, undefined);
});

test('saving requires a valid current password, matching code confirmation and an existing admin account', async t => {
  const f = await adminRecoveryFixture(t);
  for (const patch of [{ currentPassword: 'wrong-test-password' }, { currentPassword: {} }, { currentPassword: '' }, { code: 'short' }, { code: {} }, { code: 'a'.repeat(73) }, { confirmation: 'different-code' }, { confirmation: null }]) assert.equal((await invoke(saveRecoveryCode, codeBody(patch))).status, 400);
  assert.equal((await invoke(saveRecoveryCode, codeBody(), { id: '999999999999999999999999' })).status, 403);
  f.admins.get(adminId).role = 'Employe'; assert.equal((await invoke(saveRecoveryCode, codeBody())).status, 403);
  assert.equal(f.control.writes, 0);
});

test('a recovery code for one account cannot recover a different account', async t => {
  const f = await setup(t), otherId = '222222222222222222222222', otherCode = 'Other-admin-recovery-code';
  const otherPassword = await bcrypt.hash('Other-admin-password', 10);
  f.admins.set(otherId, { _id: otherId, name: 'مدير آخر', email: 'other@example.test', role: 'admin', password: otherPassword, passwordRecovery: { codeHash: await bcrypt.hash(otherCode, 10) } });
  assert.equal((await verify({ email: 'other@example.test' })).status, 400);
  const proof = (await verify()).data.proof;
  assert.equal((await reset(proof, { id: otherId, email: 'other@example.test' })).status, 200);
  assert.equal(f.admins.get(otherId).password, otherPassword); assert.ok(await bcrypt.compare(newpass, f.admins.get(adminId).password));
});

test('wrong, missing and unconfigured account credentials return the same failure without issuing a proof', async t => {
  await setup(t);
  for (const patch of [{ email: 'missing@example.test' }, { email: { $ne: null } }, { code: 'wrong-recovery-code' }, { code: '' }, { code: {} }, { email: '' }]) {
    const result = await verify(patch); assert.equal(result.status, 400); assert.deepEqual(result.data, { message: 'recoveryInvalid' });
  }
  const f = await Admin.findById(adminId).select('+passwordRecovery'); f.passwordRecovery = undefined; await f.save();
  assert.deepEqual((await verify()).data, { message: 'recoveryInvalid' });
});

test('verified reset hashes once, changes only its account, consumes proof and preserves the configured recovery code', async t => {
  const f = await setup(t), verified = await verify(); assert.equal(verified.status, 200); assert.match(verified.data.proof, /^[a-f0-9]{64}$/);
  const stored = f.admins.get(adminId).passwordRecovery;
  assert.notEqual(stored.proofHash, verified.data.proof); assert.equal(JSON.stringify(stored).includes(verified.data.proof), false);
  assert.equal(verified.headers['Cache-Control'], 'no-store');
  assert.equal((await reset(verified.data.proof, { id: '999999999999999999999999' })).status, 200);
  const row = f.admins.get(adminId); assert.ok(await bcrypt.compare(newpass, row.password)); assert.equal(await bcrypt.compare(originalPassword, row.password), false);
  assert.ok(row.passwordRecovery.codeHash); assert.equal(row.passwordRecovery.proofHash, undefined); assert.equal((await reset(verified.data.proof)).status, 400);
  assert.equal((await verify()).status, 200);
});

test('unverified, expired and superseded proofs are rejected, and password validation leaves an active proof usable', async t => {
  const f = await setup(t), first = (await verify()).data.proof, second = (await verify()).data.proof;
  for (const proof of [undefined, {}, 'not-an-auth-token', 'a'.repeat(64), first]) assert.equal((await reset(proof)).status, 400);
  for (const patch of [{ newpass2: 'different-password' }, { newpass: 'short', newpass2: 'short' }, { newpass: {}, newpass2: {} }, { newpass: 'ع'.repeat(37), newpass2: 'ع'.repeat(37) }]) assert.equal((await reset(second, patch)).status, 400);
  assert.ok(await bcrypt.compare(originalPassword, f.admins.get(adminId).password));
  f.admins.get(adminId).passwordRecovery.proofExpiresAt = new Date(Date.now() - 1000).toISOString(); assert.equal((await reset(second)).status, 400);
  const fresh = (await verify()).data.proof, password = '  كلمة مرور جديدة  '; assert.equal((await reset(fresh, { newpass: password, newpass2: password })).status, 200); assert.ok(await bcrypt.compare(password, f.admins.get(adminId).password));
});

test('rotating the recovery code and normal password changes revoke outstanding verification', async t => {
  const f = await setup(t), first = (await verify()).data.proof;
  const nextCode = 'Replacement-recovery-code'; assert.equal((await invoke(saveRecoveryCode, codeBody({ code: nextCode, confirmation: nextCode }))).status, 200);
  assert.equal((await reset(first)).status, 400); assert.equal((await verify()).status, 400);
  const second = (await verify({ code: nextCode })).data.proof;
  const admin = await Admin.findById(adminId); admin.password = nextpass; await admin.save();
  assert.equal((await reset(second)).status, 400); assert.ok(await bcrypt.compare(nextpass, f.admins.get(adminId).password));
});

test('concurrent reset attempts can consume the proof only once', async t => {
  const f = await setup(t), proof = (await verify()).data.proof, before = f.control.writes;
  const results = await Promise.all([reset(proof), reset(proof, { newpass: nextpass, newpass2: nextpass })]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 400]); assert.equal(f.control.writes, before + 1);
});

test('code rotation racing a verification/reset cannot reuse stale credentials', async t => {
  const f = await setup(t);
  f.control.beforeWrite = async () => { f.control.beforeWrite = null; f.admins.get(adminId).passwordRecovery = { codeHash: await bcrypt.hash('Other-recovery-code', 10) }; };
  assert.equal((await verify()).status, 400);
  assert.equal((await invoke(saveRecoveryCode, codeBody())).status, 200);
  const proof = (await verify()).data.proof;
  f.control.beforeWrite = () => { f.control.beforeWrite = null; f.admins.get(adminId).passwordRecovery = { codeHash: 'rotated' }; };
  assert.equal((await reset(proof)).status, 400); assert.ok(await bcrypt.compare(originalPassword, f.admins.get(adminId).password));
});

test('database errors never report success and a failed reset remains retryable', async t => {
  const f = await adminRecoveryFixture(t); f.control.failWrite = true;
  assert.equal((await invoke(saveRecoveryCode, codeBody())).status, 500); assert.equal(f.admins.get(adminId).passwordRecovery, undefined);
  f.control.failWrite = false; assert.equal((await invoke(saveRecoveryCode, codeBody())).status, 200);
  f.control.failWrite = true; assert.equal((await verify()).status, 500);
  f.control.failWrite = false; const proof = (await verify()).data.proof;
  f.control.failWrite = true; assert.equal((await reset(proof)).status, 500); assert.ok(await bcrypt.compare(originalPassword, f.admins.get(adminId).password));
  f.control.failWrite = false; assert.equal((await reset(proof)).status, 200);
});

test('recovery validation handles unicode/whitespace byte limits and rejects query objects', () => {
  assert.equal(recoveryCodeError('  رمز استعادة  '), null); assert.equal(recoveryCodeError('ع'.repeat(37)), 'recoveryCodeLength'); assert.equal(recoveryCodeError('        '), 'recoveryCodeRequired');
  assert.equal(recoveryEmail({ $ne: null }), null); assert.equal(recoveryEmail('  admin@example.test  '), 'admin@example.test');
});

test('rate limiting expires, separates buckets, bounds memory and sends Retry-After', async () => {
  let time = 0, allowed = 0;
  const limit = createRecoveryLimit({ limit: 2, windowMs: 1000, capacity: 2, now: () => time });
  const run = async ip => { const output = { status: 200, headers: {} }; const res = { set(k, v) { output.headers[k] = v; return this; }, status(code) { output.status = code; return this; }, json(data) { output.data = data; return this; } }; await limit({ ip }, res, () => allowed++); return output; };
  assert.equal((await run('a')).status, 200); assert.equal((await run('a')).status, 200);
  const blocked = await run('a'); assert.equal(blocked.status, 429); assert.equal(blocked.headers['Retry-After'], '1');
  assert.equal((await run('b')).status, 200); assert.equal((await run('c')).status, 429); assert.equal(allowed, 3);
  time = 1001; assert.equal((await run('a')).status, 200); assert.equal((await run('c')).status, 200);
});

let server, base; const originalSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-admin-recovery'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
async function request(path, body, actor, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + (typeof actor === 'string' ? actor : jwt.sign(actor, process.env.JWT_SECRET)) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
test('real routes enforce admin-only setup, public reset cannot authenticate, and the recovered password works for login', async t => {
  await adminRecoveryFixture(t);
  const admin = { id: adminId, role: 'admin' }, staff = { id: employeeId, role: 'Employe' };
  for (const [actor, status] of [[null, 401], [staff, 403]]) for (const method of ['GET', 'PUT']) assert.equal((await request('/api/admin/recovery-code', method === 'PUT' ? codeBody() : null, actor, method)).status, status);
  assert.equal((await request('/api/admin/recovery-code', codeBody(), admin, 'PUT')).status, 200);
  const verified = await request('/api/admin/recovery/verify', verifyBody()); assert.equal(verified.status, 200);
  assert.equal((await request('/api/admin/recovery-code', null, verified.data.proof, 'GET')).status, 401);
  assert.equal((await request('/api/admin/recovery/reset', resetBody(verified.data.proof))).status, 200);
  const login = password => request('/api/admin/Login', { email: 'admin@example.test', password });
  assert.equal((await login(newpass)).status, 200); assert.equal((await login(originalPassword)).status, 404);
  const me = await request('/user/getMe', null, admin, 'GET'); assert.equal(me.status, 200); assert.equal(me.data.user.passwordRecovery, undefined); assert.equal(me.data.user.password, undefined);
});
