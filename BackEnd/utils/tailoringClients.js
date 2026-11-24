import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Client from '../models/Client.js';
import Order from '../models/TailoringOrder.js';
import { validateClient } from '../../shared/clients.js';
import { clientPhoneKey } from '../../shared/tailoringCredit.js';
import { clientNameKey, clientTailoringStatistics } from '../../shared/clientTailoringStats.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function prepareTailoringClient(order, access, { delivery = false } = {}) {
  if (!delivery && !access.canRegisterClient) throw fail('forbidden', 403);
  const rows = await Client.find({ idAdmin: order.idAdmin }).select('_id name phone cin').lean();
  const phone = clientPhoneKey(order.phone), name = clientNameKey(order.clientName);
  const connect = client => { order.clientId = client._id; if (!delivery) { order.clientName = client.name; order.phone = client.phone; } return client; };
  const matches = rows.filter(row => clientPhoneKey(row.phone) === phone && clientNameKey(row.name) === name);
  if (matches.length > 1) throw fail(delivery ? 'creditOwnerAmbiguous' : 'clientRegistrationAmbiguous');
  if (matches.length === 1) return connect(matches[0]);
  const identity = createHash('sha256').update(JSON.stringify([String(order.idAdmin), phone, name])).digest('hex').slice(0, 24);
  const reserved = await Client.findOne({ _id: identity, idAdmin: order.idAdmin });
  if (reserved) {
    if (clientPhoneKey(reserved.phone) !== phone || clientNameKey(reserved.name) !== name) throw fail(delivery ? 'creditOwnerAmbiguous' : 'clientRegistrationAmbiguous');
    return connect(reserved);
  }
  if (!access.canRegisterClient) throw fail('creditClientRegistrationForbidden', 403);
  let value;
  try { value = validateClient({ type: 'person', name: order.clientName, phone: order.phone }, { allowMissingAddress: true }); }
  catch (error) { if (delivery) throw fail('creditClientRegistrationInvalid', 400); throw error; }
  const client = { ...value, _id: new mongoose.Types.ObjectId(identity) };
  order.clientId = client._id;
  order.clientRegistration = { clientId: client._id, name: client.name, phone: client.phone, createdBy: access.createdBy, preparedAt: new Date(), state: 'prepared' };
  return client;
}

// The intent is committed with the order, so a stock failure creates no client.
// Deterministic IDs also keep simultaneous first orders for one client unique.
export async function finishTailoringClient(initial) {
  let order = initial;
  if (!order?.clientRegistration || order.stockOperation) return order;
  for (let attempt = 0; attempt < 5; attempt++) {
    const plan = order.clientRegistration;
    if (plan.state === 'complete') return order;
    const scope = { _id: plan.clientId, idAdmin: order.idAdmin };
    if (!await Client.findOne(scope)) {
      try { await Client.create({ ...scope, name: plan.name, phone: plan.phone, type: 'person', createdBy: plan.createdBy, createdFromTailoringOrderId: order._id }); }
      catch (error) { if (!await Client.findOne(scope)) throw error; }
    }
    plan.state = 'complete';
    try { await order.save(); return order; }
    catch (error) {
      if (error.name !== 'VersionError' || attempt === 4) throw error;
      order = await Order.findOne({ _id: order._id, idAdmin: order.idAdmin });
      if (!order) throw fail('notFound', 404);
    }
  }
}

export async function clientTailoringSummaries(clients, idAdmin) {
  const orders = await Order.find({ idAdmin }).select('clientId clientName phone garmentType cancelledAt deliveredAt').lean();
  const stats = clientTailoringStatistics(clients, orders);
  return clients.map(client => ({ ...(client.toObject?.() || client), tailoringStats: stats.get(String(client._id)) }));
}
