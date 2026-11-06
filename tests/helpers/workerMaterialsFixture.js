import Fabric from '../../BackEnd/models/Fabric.js';
import SfifaStock from '../../BackEnd/models/SfifaStock.js';
import WorkerWork from '../../BackEnd/models/WorkerWork.js';
import { garmentWorkerFixture } from './garmentWorkerFixture.js';
import { query, owner } from './djellabaCostsFixture.js';
import { matches } from './modelMemory.js';
import { generateFabricBarcode } from '../../shared/fabrics.js';

export function workerMaterialsFixture(t) {
  const f = garmentWorkerFixture(t), fabrics = [], stocks = [], controls = {};
  const models = [[Fabric, fabrics, 'fabric'], [SfifaStock, stocks, 'sfifa']];
  const clone = (Model, row) => row ? new Model(row.toObject()) : null;
  for (const [Model, rows, kind] of models) {
    t.mock.method(Model, 'findOne', scope => query(() => clone(Model, rows.find(row => matches(row, scope)))));
    t.mock.method(Model, 'find', scope => query(() => rows.filter(row => matches(row, scope)).map(row => row.toObject())));
    t.mock.method(Model.prototype, 'save', async function () {
      await this.validate();
      if (controls.failBefore === kind) { delete controls.failBefore; throw new Error('Isolated stock write failure'); }
      if (controls.conflictOnce === kind) { delete controls.conflictOnce; throw Object.assign(new Error('Conflict'), { name: 'VersionError' }); }
      const index = rows.findIndex(row => String(row._id) === String(this._id));
      if (index >= 0 && rows[index].__v !== this.__v) throw Object.assign(new Error('Conflict'), { name: 'VersionError' });
      this.__v = index < 0 ? 0 : this.__v + 1;
      if (index < 0) rows.push(clone(Model, this)); else rows[index] = clone(Model, this);
      if (controls.failAfter === kind) { delete controls.failAfter; throw new Error('Isolated lost stock acknowledgement'); }
      return this;
    });
  }
  const createBase = WorkerWork.create, saveBase = WorkerWork.prototype.save;
  t.mock.method(WorkerWork, 'find', scope => query(() => f.records.filter(row => matches(row, scope)).map(row => row.toObject())));
  t.mock.method(WorkerWork, 'create', async input => { const row = await createBase(input); if (controls.afterCreate) { const callback = controls.afterCreate; delete controls.afterCreate; callback(); } return row; });
  t.mock.method(WorkerWork.prototype, 'save', async function () {
    if (controls.failWorkBefore) { delete controls.failWorkBefore; throw new Error('Isolated work save failure'); }
    const saved = await saveBase.call(this);
    if (controls.afterWorkSave) { const callback = controls.afterWorkSave; delete controls.afterWorkSave; callback(); }
    if (controls.failWorkAfter) { delete controls.failWorkAfter; throw new Error('Isolated lost work acknowledgement'); }
    return saved;
  });
  const seedFabric = ({ meters = 20, idAdmin = owner } = {}) => {
    const row = new Fabric({ idAdmin, createdBy: idAdmin, type: 'قطن', reference: 'C12', __v: 0, colors: [{ name: 'أزرق', number: '01', pieces: [{ meters, barcode: generateFabricBarcode() }, { meters: 9, barcode: generateFabricBarcode() }] }] });
    fabrics.push(row); return row;
  };
  const seedSfifa = ({ quantity = 20, width = 'thin', idAdmin = owner, legacy = false } = {}) => {
    const row = new SfifaStock({ idAdmin, createdBy: idAdmin, __v: 0, width, family: '01-30', quantity, ...(legacy ? {} : { unassignedQuantity: 0, variants: [{ code: 12, quantity }] }) });
    stocks.push(row); return row;
  };
  const fabric = seedFabric(), sfifa = seedSfifa();
  const selection = (lineId, meters = 2, chosenFabric = fabric, chosenSfifa = sfifa, pieceIndex = 0) => ({ lineId, fabricId: String(chosenFabric._id), colorId: String(chosenFabric.colors[0]._id), pieceId: String(chosenFabric.colors[0].pieces[pieceIndex]._id), meters, sfifaId: String(chosenSfifa._id), variantId: String(chosenSfifa.variants?.[0]?._id || chosenSfifa._id) });
  return { ...f, fabrics, stocks, controls, fabric, sfifa, seedFabric, seedSfifa, selection };
}
