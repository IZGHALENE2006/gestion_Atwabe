export const WORKER_CATEGORIES = ["machine", "sfifa", "finishing", "brim", "trousers", "shirts", "mesbanto"];

// Existing records use one category; new records may belong to several sections.
export function workerCategories(worker) {
  const assigned = Array.isArray(worker.categories) && worker.categories.length ? worker.categories : [worker.category];
  return WORKER_CATEGORIES.filter(category => assigned.includes(category));
}

export function validateTailoringWorker(input) {
  const fields = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("invalidWorker"), { fields: { name: "required" } });
  const text = (raw, key, max) => {
    if (raw !== undefined && typeof raw !== "string") { fields[key] = "invalidText"; return ""; }
    const value = (raw || "").trim();
    if (!value) fields[key] = "required";
    else if (value.length > max || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields[key] = "invalidText";
    return value;
  };
  const name = text(input.name, "name", 160);
  const phone = text(input.phone, "phone", 40);
  if (phone && !fields.phone && (!/^[+\d\s()./-]+$/.test(phone) || !/^\d{6,20}$/.test(phone.replace(/\D/g, "")))) fields.phone = "invalidPhone";
  const assigned = input.categories === undefined ? [input.category] : input.categories;
  if (!Array.isArray(assigned) || !assigned.length || assigned.length > WORKER_CATEGORIES.length || assigned.some(category => !WORKER_CATEGORIES.includes(category)) || new Set(assigned).size !== assigned.length) fields.categories = "invalidCategory";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWorker"), { fields });
  return { name, phone, categories: WORKER_CATEGORIES.filter(category => assigned.includes(category)) };
}

const searchable = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function filterTailoringWorkers(workers, category, search = "") {
  const query = searchable(search.trim()), digits = query.replace(/[\s()+./-]/g, "");
  return workers.filter(worker => workerCategories(worker).includes(category) && (searchable(worker.name).includes(query) || searchable(worker.phone).includes(query)
    || (/^\d+$/.test(digits) && String(worker.phone).replace(/\D/g, "").includes(digits))));
}
