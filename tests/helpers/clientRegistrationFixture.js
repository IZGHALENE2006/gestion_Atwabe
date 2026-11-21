import { randomUUID } from 'node:crypto';
import Client from '../../BackEnd/models/Client.js';
import Credit from '../../BackEnd/models/userCidit.js';
import Order from '../../BackEnd/models/TailoringOrder.js';
import { djellabaFixture, garment, query, owner } from './djellabaCostsFixture.js';
import { tailoringStockFixture } from './tailoringStockFixture.js';
import { matches } from './modelMemory.js';

export function clientRegistrationFixture(t, { stock = false } = {}) {
  const f = stock ? tailoringStockFixture(t) : djellabaFixture(t), clients = new Map(), credits = new Map();
  if (!stock) f.seedSettings();
  const findClient = scope => [...clients.values()].find(row => matches(row, scope));
  t.mock.method(Client, 'find', scope => query(() => [...clients.values()].filter(row => matches(row, scope)).map(row => row.toObject())));
  t.mock.method(Client, 'findOne', scope => query(() => { const row = findClient(scope); return row ? new Client(row.toObject()) : null; }));
  t.mock.method(Client, 'create', async input => {
    if (f.faults.clientBefore) { delete f.faults.clientBefore; throw Error('Isolated client save outage'); }
    const row = new Client(input); await row.validate();
    if (clients.has(String(row._id))) throw Object.assign(Error('duplicate'), { code: 11000 });
    clients.set(String(row._id), row);
    if (f.faults.clientAfter) { delete f.faults.clientAfter; throw Error('Isolated lost client acknowledgement'); }
    return new Client(row.toObject());
  });
  t.mock.method(Client.prototype, 'save', async function () { await this.validate(); clients.set(String(this._id), new Client(this.toObject())); return this; });
  t.mock.method(Client, 'findOneAndUpdate', async (scope, input) => { const row = findClient(scope); if (!row) return null; row.set(input.$set); await row.validate(); return row; });
  t.mock.method(Order, 'create', async input => {
    const row = new Order({ ...input, __v: 0, createdAt: new Date(), updatedAt: new Date() }); await row.validate();
    if ([...f.orders.values()].some(old => String(old.idAdmin) === String(row.idAdmin) && old.requestId === row.requestId)) throw Object.assign(Error('duplicate'), { code: 11000 });
    f.orders.set(String(row._id), row); return row;
  });
  const cloneCredit = row => row ? new Credit(row.toObject()) : null;
  t.mock.method(Credit, 'find', scope => query(() => [...credits.values()].filter(row => matches(row, scope)).map(cloneCredit)));
  t.mock.method(Credit, 'findOne', scope => query(() => cloneCredit([...credits.values()].find(row => matches(row, scope)))));
  t.mock.method(Credit, 'create', async input => { const row = new Credit({ ...input, __v: 0 }); await row.validate(); if (credits.has(String(row._id))) throw Object.assign(Error('duplicate'), { code: 11000 }); credits.set(String(row._id), row); return cloneCredit(row); });
  t.mock.method(Credit.prototype, 'save', async function () { await this.validate(); const before = credits.get(String(this._id)); if (!before || before.__v !== this.__v) throw Object.assign(Error('Conflict'), { name: 'VersionError' }); this.__v++; credits.set(String(this._id), cloneCredit(this)); return this; });
  const seedClient = (patch = {}) => { const row = new Client({ idAdmin: owner, createdBy: owner, type: 'person', name: 'عميل جديد', phone: '0677777777', address: 'الرباط', ...patch }); clients.set(String(row._id), row); return row; };
  const input = (patch = {}) => ({ clientName: 'عميل جديد', phone: '0677777777', registerClient: true, orderDate: '2026-11-20', readyDate: '2026-12-01', garmentType: 'shirts', expenseAmount: 100, paidAmount: 0, items: [garment({ shirtType: 'عادي', price: 400 })], requestId: randomUUID(), ...patch });
  return { ...f, clients, credits, seedClient, input };
}
