import { creditCheckoutFixture, owner } from './creditCheckoutFixture.js';
import { memoryQuery, matches } from './modelMemory.js';
import Fabric from '../../BackEnd/models/Fabric.js';
import Invoice from '../../BackEnd/models/FabricInvoice.js';
import FabricMovement from '../../BackEnd/models/FabricMovement.js';
import TailoringOrder from '../../BackEnd/models/TailoringOrder.js';
import Client from '../../BackEnd/models/Client.js';
import Employee from '../../BackEnd/models/EmployeModele.js';
import { EMPLOYEE_OPERATIONS } from '../../shared/employeeOperations.js';
import { generateFabricBarcode } from '../../shared/fabrics.js';
export function fabricInvoiceFixture(t) {
  const f = creditCheckoutFixture(t), maps = new Map();
  for (const employee of f.rows(Employee)) { employee.moduleAccess = ['fabrics', 'credit']; employee.operationPermissions = { fabrics: [...EMPLOYEE_OPERATIONS.fabrics], credit: [...EMPLOYEE_OPERATIONS.credit] }; }
  const clone = (Model, row) => row ? new Model(row.toObject()) : null;
  const once = key => { if (f.controls[key]) { delete f.controls[key]; throw new Error('Synthetic ' + key); } };
  for (const Model of [Fabric, Invoice]) {
    const records = []; maps.set(Model, records); const find = scope => records.find(row => matches(row, scope));
    t.mock.method(Model, 'findOne', scope => memoryQuery(() => clone(Model, find(scope))));
    t.mock.method(Model, 'find', scope => memoryQuery(() => records.filter(row => matches(row, scope)).map(row => clone(Model, row))));
    t.mock.method(Model, 'create', async value => {
      if (records.some(row => String(row.idAdmin) === String(value.idAdmin) && row.requestId === value.requestId)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      const row = new Model({ ...value, __v: 0 }); await row.validate(); records.push(row);
      if (Model === Invoice && f.controls.fabricStockRace) { delete f.controls.fabricStockRace; maps.get(Fabric)[1].colors[0].pieces[0].meters = 0; }
      return clone(Model, row);
    });
    t.mock.method(Model.prototype, 'save', async function () {
      await this.validate(); const index = records.findIndex(row => String(row._id) === String(this._id));
      if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error('Conflict'), { name: 'VersionError' });
      if (Model === Fabric) once('fabricBeforeSave');
      this.__v += 1; records[index] = clone(Model, this);
      if (Model === Fabric) once(this.invoiceDebits?.at(-1)?.recordedAt ? 'fabricRecordAfterSave' : 'fabricReserveAfterSave');
      return this;
    });
    t.mock.method(Model, 'updateOne', async (scope, change) => {
      const row = find(scope); if (!row) return { matchedCount: 0 };
      row.set(change.$set); await row.validate();
      if (Model === Invoice && change.$set.status === 'complete') once('invoiceCompleteAfterSave');
      return { matchedCount: 1 };
    });
  }
  t.mock.method(FabricMovement, 'find', () => memoryQuery(() => []));
  t.mock.method(TailoringOrder, 'find', () => memoryQuery(() => []));
  t.mock.method(Client, 'find', () => memoryQuery(() => []));
  const seedFabric = (type, price, purchase) => { const row = new Fabric({ idAdmin: owner, createdBy: owner, type, salePricePerMeter: price, wholesalePricePerMeter: price - 5, purchasePricePerMeter: purchase, colors: [{ name: 'أزرق', pieces: [{ meters: 30, barcode: generateFabricBarcode() }] }], __v: 0 }); maps.get(Fabric).push(row); return row; };
  const first = seedFabric('قطن', 30, 15), second = seedFabric('حرير', 45, 20);
  return { ...f, first, second, fabrics: () => maps.get(Fabric), invoices: () => maps.get(Invoice) };
}
