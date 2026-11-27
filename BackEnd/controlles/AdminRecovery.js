import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import Admin from '../models/AdminModel.js';
import { recoveryCodeError, recoveryEmail } from '../../shared/adminRecovery.js';
import { passwordResetError } from '../../shared/passwordChange.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const proofPattern = /^[a-f0-9]{64}$/;
// Same bcrypt work for unknown accounts and accounts without a recovery code.
const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
const failure = res => res.status(400).json({ message: 'recoveryInvalid' });
const expired = res => res.status(400).json({ message: 'recoveryExpired' });
const privateHeaders = res => res.set('Cache-Control', 'no-store');

export async function recoveryStatus(req, res) {
  privateHeaders(res);
  try {
    const admin = await Admin.findById(req.user.id).select('+passwordRecovery');
    if (!admin || admin.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    return res.json({ configured: Boolean(admin.passwordRecovery?.codeHash) });
  } catch { return res.status(500).json({ message: 'Server error' }); }
}

export async function saveRecoveryCode(req, res) {
  privateHeaders(res);
  try {
    const { code, confirmation, currentPassword } = req.body || {};
    const error = recoveryCodeError(code, confirmation);
    if (error || typeof confirmation !== 'string' || typeof currentPassword !== 'string' || !currentPassword) return res.status(400).json({ message: error || 'passwordFieldsRequired' });
    const admin = await Admin.findById(req.user.id);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    if (!await bcrypt.compare(currentPassword, admin.password)) return res.status(400).json({ message: 'Current password incorrect' });
    const codeHash = await bcrypt.hash(code, 10);
    // Replacing the whole recovery record also revokes any outstanding proof.
    const result = await Admin.updateOne({ _id: admin._id, role: 'admin', password: admin.password }, { $set: { passwordRecovery: { codeHash } } }, { runValidators: true });
    if (result.matchedCount !== 1) return res.status(409).json({ message: 'recoverySaveConflict' });
    return res.json({ configured: true });
  } catch { return res.status(500).json({ message: 'Server error' }); }
}

export async function verifyRecoveryCode(req, res) {
  privateHeaders(res);
  try {
    const { email, code } = req.body || {};
    const address = recoveryEmail(email);
    if (!address || recoveryCodeError(code)) return failure(res);
    const admin = await Admin.findOne({ email: address, role: 'admin' }).select('+passwordRecovery');
    const codeHash = admin?.passwordRecovery?.codeHash;
    const matches = await bcrypt.compare(code, codeHash || dummyHash);
    if (!admin || !codeHash || !matches) return failure(res);
    const proof = randomBytes(32).toString('hex');
    const result = await Admin.updateOne({ _id: admin._id, role: 'admin', password: admin.password, 'passwordRecovery.codeHash': codeHash }, {
      $set: { 'passwordRecovery.proofHash': digest(proof), 'passwordRecovery.proofExpiresAt': new Date(Date.now() + 10 * 60_000), 'passwordRecovery.proofCredentialHash': digest(admin.password) },
    });
    if (result.matchedCount !== 1) return failure(res);
    // This opaque proof is scoped to password reset, is not an auth JWT, and
    // only its digest is persisted. A later verification replaces it.
    return res.json({ proof, expiresIn: 600 });
  } catch { return res.status(500).json({ message: 'Server error' }); }
}

export async function resetAdminPassword(req, res) {
  privateHeaders(res);
  try {
    const { proof, newpass } = req.body || {};
    if (typeof proof !== 'string' || !proofPattern.test(proof)) return expired(res);
    const error = passwordResetError(req.body);
    if (error) return res.status(400).json({ message: error });
    const proofHash = digest(proof);
    const admin = await Admin.findOne({ role: 'admin', 'passwordRecovery.proofHash': proofHash, 'passwordRecovery.proofExpiresAt': { $gt: new Date() } }).select('+passwordRecovery');
    if (!admin || admin.passwordRecovery?.proofCredentialHash !== digest(admin.password)) return expired(res);
    // updateOne bypasses the model save hook, so hash exactly once here. The
    // conditional update changes the password and consumes the proof atomically.
    const password = await bcrypt.hash(newpass, 10);
    const result = await Admin.updateOne({ _id: admin._id, role: 'admin', password: admin.password, 'passwordRecovery.proofHash': proofHash, 'passwordRecovery.proofExpiresAt': { $gt: new Date() } }, {
      $set: { password }, $unset: { 'passwordRecovery.proofHash': '', 'passwordRecovery.proofExpiresAt': '', 'passwordRecovery.proofCredentialHash': '' },
    }, { runValidators: true });
    if (result.matchedCount !== 1) return expired(res);
    return res.json({ message: 'Password updated successfully' });
  } catch { return res.status(500).json({ message: 'Server error' }); }
}
