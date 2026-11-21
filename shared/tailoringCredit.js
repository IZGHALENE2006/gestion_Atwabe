export function tailoringCreditInput(input) {
  const fields = {}, raw = input?.clientId, flag = input?.deliverOnCredit, register = input?.registerClient;
  if (raw != null && raw !== '' && (typeof raw !== 'string' || !/^[a-f\d]{24}$/i.test(raw))) fields.clientId = 'chooseCreditClient';
  if (![undefined, false, true, 'false', 'true'].includes(flag)) fields.deliverOnCredit = 'invalidCreditDelivery';
  const deliverOnCredit = flag === true || flag === 'true';
  if (![undefined, false, true, 'false', 'true'].includes(register)) fields.registerClient = 'invalidClientRegistration';
  const registerClient = register === true || register === 'true';
  if (registerClient && raw) fields.registerClient = 'chooseExistingClient';
  if (deliverOnCredit && !raw && !registerClient) fields.clientId = 'chooseCreditClient';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidOrder'), { fields });
  return { ...(raw ? { clientId: raw.toLowerCase() } : Object.hasOwn(input || {}, 'clientId') ? { clientId: null } : {}), ...(deliverOnCredit ? { deliverOnCredit: true } : {}), ...(registerClient ? { registerClient: true } : {}) };
}
export function creditDeliveryDepositValid(total, paid) {
  const cents = value => Math.round(Number(value) * 100);
  return Number.isFinite(Number(total)) && Number.isFinite(Number(paid)) && cents(total) > 0 && cents(paid) >= 0 && cents(paid) < cents(total);
}
export const clientPhoneKey = value => String(value || '').replace(/\D/g, '').replace(/^00212/, '212').replace(/^0(?=\d{9}$)/, '212');
export function matchingClientCredits(client, accounts) {
  const linked = accounts.filter(account => String(account.clientId || '') === String(client._id));
  if (linked.length) return linked;
  const phone = clientPhoneKey(client.phone), cin = String(client.cin || '').trim().toUpperCase();
  return accounts.filter(account => !account.clientId && (cin && String(account.cin || '').trim().toUpperCase() === cin || phone.length >= 6 && clientPhoneKey(account.phone) === phone));
}
