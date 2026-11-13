import mongoose from '../../BackEnd/node_modules/mongoose/index.js';
import SfifaStock from '../../BackEnd/models/SfifaStock.js';
import JabadorSettings from '../../BackEnd/models/JabadorCostSettings.js';
import MalakiyaSettings from '../../BackEnd/models/MalakiyaCostSettings.js';
import { tailoringStockFixture } from './tailoringStockFixture.js';
import { owner, query } from './djellabaCostsFixture.js';
import { randomUUID } from 'node:crypto';

export function tailoringSfifaFixture(t) {
  const f = tailoringStockFixture(t), stocks = new Map();
  for (const Model of [JabadorSettings, MalakiyaSettings]) t.mock.method(Model, 'findOne', () => query(() => f.settings.get(owner)));
  const clone = row => row ? new SfifaStock(row.toObject()) : null;
  const chain = fn => ({ ...query(fn), session() { return this; } });
  t.mock.method(SfifaStock, 'findOne', scope => chain(() => {
    const row = stocks.get(String(scope._id)); return row && String(row.idAdmin) === String(scope.idAdmin) ? clone(row) : null;
  }));
  t.mock.method(SfifaStock, 'find', scope => chain(() => [...stocks.values()].filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject())));
  t.mock.method(SfifaStock.prototype, 'save', async function () {
    if (f.controls.failSfifaBefore) { delete f.controls.failSfifaBefore; throw new Error('Isolated sfifa write failure'); }
    await this.validate(); const old = stocks.get(String(this._id));
    if (old && old.__v !== this.__v) throw Object.assign(new Error('Concurrent stock write'), { name: 'VersionError' });
    this.__v = (this.__v || 0) + 1; stocks.set(String(this._id), clone(this));
    if (f.controls.failSfifaAfter) { delete f.controls.failSfifaAfter; throw new Error('Isolated sfifa acknowledgement loss'); }
    return this;
  });
  const start = mongoose.startSession;
  t.mock.method(mongoose, 'startSession', async () => {
    const session = await start();
    const original = session.withTransaction;
    session.withTransaction = async fn => {
      const snapshot = [...stocks].map(([id, row]) => [id, row.toObject()]);
      const restore = () => { stocks.clear(); for (const [id, row] of snapshot) stocks.set(id, new SfifaStock(row)); };
      let attempts = 0;
      try { return await original(async () => { if (attempts++) restore(); return fn(); }); }
      catch (error) { restore(); throw error; }
    }; return session;
  });
  const seedSfifa = ({ width = 'thin', quantity = 20, idAdmin = owner } = {}) => {
    const row = new SfifaStock({ idAdmin, createdBy: idAdmin, width, family: '01-30', quantity, unassignedQuantity: 0, variants: [{ code: 12, quantity }], receipts: [{ requestId: randomUUID(), quantity, code: 12, styleMeters: { single: quantity * .5, double: quantity * .3, gradient: quantity * .2 }, createdBy: idAdmin, date: new Date() }], __v: 0 });
    stocks.set(String(row._id), row); return row;
  };
  const sfifa = seedSfifa();
  const selection = (row = sfifa, patch = {}) => ({ stockId: String(row._id), variantId: String(row.variants[0]._id), meters: 3, meterType: 'single', ...patch });
  const sfifaMeters = (row = sfifa) => stocks.get(String(row._id)).variants[0].quantity;
  return { ...f, stocks, sfifa, seedSfifa, selection, sfifaMeters };
}
