export function recoveryCodeError(code, confirmation = code) {
  if (typeof code !== 'string' || !code.trim()) return 'recoveryCodeRequired';
  if (code.length < 8 || new TextEncoder().encode(code).length > 72) return 'recoveryCodeLength';
  if (code !== confirmation) return 'recoveryCodeMismatch';
  return null;
}

export function recoveryEmail(email) {
  return typeof email === 'string' && email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : null;
}
