export const CREDIT_CUSTOMER_FIELDS = ['name', 'cin', 'phone', 'email'];

export function validateCreditCustomerProfile(input) {
  const fail = () => { throw Object.assign(new Error('creditCustomerProfileInvalid'), { status: 400 }); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const limits = { name: 160, cin: 40, phone: 40, email: 254 };
  const profile = {};
  for (const key of CREDIT_CUSTOMER_FIELDS) {
    if (typeof input[key] !== 'string') fail();
    const value = input[key].trim();
    if (value.length > limits[key] || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail();
    profile[key] = key === 'email' ? value.toLowerCase() : value;
  }
  if (!profile.name || profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail();
  if (profile.phone && (!/^[+\d\s()./-]+$/.test(profile.phone) || !/^\d{6,20}$/.test(profile.phone.replace(/\D/g, '')))) fail();
  return profile;
}
