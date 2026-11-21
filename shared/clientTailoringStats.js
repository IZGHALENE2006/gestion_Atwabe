import { TAILORING_GARMENT_TYPES, tailoringGarmentType } from './tailoring.js';
import { clientPhoneKey } from './tailoringCredit.js';

export const clientNameKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const counts = () => ({ total: 0, active: 0, delivered: 0, cancelled: 0 });
export const emptyClientTailoringStats = () => ({ ...counts(), byType: Object.fromEntries(TAILORING_GARMENT_TYPES.map(type => [type, counts()])) });

// Linked identities take precedence. Older manual orders use an unambiguous
// phone match, or a unique name match when a family shares the same phone.
export function clientTailoringStatistics(clients, orders) {
  const result = new Map(clients.map(client => [String(client._id), emptyClientTailoringStats()]));
  const phones = new Map();
  for (const client of clients) {
    const key = clientPhoneKey(client.phone);
    if (key.length >= 6) phones.set(key, [...(phones.get(key) || []), client]);
  }
  for (const order of orders) {
    let clientId = order.clientId ? String(order.clientId) : null;
    if (!clientId) {
      let matches = phones.get(clientPhoneKey(order.phone)) || [];
      if (matches.length > 1) matches = matches.filter(client => clientNameKey(client.name) === clientNameKey(order.clientName));
      if (matches.length === 1) clientId = String(matches[0]._id);
    }
    const summary = result.get(clientId), type = tailoringGarmentType(order);
    if (!summary || !summary.byType[type]) continue;
    const state = order.cancelledAt ? 'cancelled' : order.deliveredAt ? 'delivered' : 'active';
    summary.total++; summary[state]++; summary.byType[type].total++; summary.byType[type][state]++;
  }
  return result;
}
