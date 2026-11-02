const plain = value => value?.toObject ? value.toObject() : value;
const same = (a, b) => {
  a = plain(a); b = plain(b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => same(value, b[index]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !a._bsontype && !b._bsontype && !(a instanceof Date) && !(b instanceof Date)) return Object.keys(b).length === Object.keys(a).length && Object.keys(b).every(key => same(a[key], b[key]));
  return a == null || b == null ? a == null && b == null : String(a) === String(b);
};
const values = (row, parts) => {
  if (!parts.length) return [row];
  if (Array.isArray(row)) return row.flatMap(value => values(value, parts));
  return values(row?.[parts[0]], parts.slice(1));
};
function compare(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !expected._bsontype && !(expected instanceof Date) && Object.keys(expected).some(key => key.startsWith('$'))) {
    return Object.entries(expected).every(([key, value]) => {
      if (key === '$exists') return actual.some(item => item !== undefined) === value;
      if (key === '$ne') return !actual.some(item => same(item, value) || (Array.isArray(item) && item.some(entry => same(entry, value))));
      if (key === '$gte') return actual.some(item => item >= value);
      if (key === '$lte') return actual.some(item => item <= value);
      if (key === '$in') return actual.some(item => value.some(entry => same(item, entry)));
      if (key === '$elemMatch') return actual.some(item => Array.isArray(item) && item.some(entry => matches(entry, value)));
      if (key === '$eq') return actual.some(item => same(item, value));
      throw new Error('Unsupported test operator ' + key);
    });
  }
  return actual.some(item => same(item, expected) || (!Array.isArray(expected) && Array.isArray(item) && item.some(entry => same(entry, expected))));
}
export function matches(row, scope) {
  return Object.entries(scope).every(([key, expected]) => {
    if (key === '$or') return expected.some(entry => matches(row, entry));
    if (key === '$and') return expected.every(entry => matches(row, entry));
    return compare(values(row, key.split('.')), expected);
  });
}
export function update(row, change) {
  for (const [key, amount] of Object.entries(change.$inc || {})) row[key] = (row[key] || 0) + amount;
  for (const [key, value] of Object.entries(change.$set || {})) row[key] = value;
  for (const [key, value] of Object.entries(change.$push || {})) { row[key] ??= []; row[key].push(...(value.$each || [value])); }
  for (const [key, value] of Object.entries(change.$addToSet || {})) { row[key] ??= []; if (!row[key].some(entry => String(entry) === String(value))) row[key].push(value); }
  for (const [key, value] of Object.entries(change.$pull || {})) row[key] = row[key].filter(entry => String(entry) !== String(value));
}
export const memoryQuery = action => ({ select() { return this; }, session() { return this; }, sort() { return this; }, populate() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(action).then(resolve, reject); } });
