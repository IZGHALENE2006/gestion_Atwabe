export function passwordChangeError(input) {
  if (!input || ['old', 'newpass', 'newpass2'].some(key => typeof input[key] !== 'string' || input[key].length === 0)) return 'passwordFieldsRequired';
  return passwordResetError(input);
}

export function passwordResetError(input) {
  if (!input || ['newpass', 'newpass2'].some(key => typeof input[key] !== 'string' || input[key].length === 0)) return 'passwordFieldsRequired';
  if (input.newpass !== input.newpass2) return 'Password not confirmed';
  if (input.newpass.length < 8) return 'passwordTooShort';
  if (new TextEncoder().encode(input.newpass).length > 72) return 'passwordTooLong';
  return null;
}
