const errorKeys = {
  "email if exite": "emailExists",
  "cin if exite": "cinExists",
  "CIN already exists": "cinExists",
  "CIN is required": "cinRequired",
  "nom is required": "nameRequired",
  "email is required": "emailRequired",
  "password is required": "passwordRequired",
  "CIN length must be between 6 and 8 digits": "cinLength",
};

export function employeeErrorKey(error, fallback) {
  const message = typeof error === "string" ? error : error?.message;
  return `employees.${errorKeys[message] || fallback}`;
}
