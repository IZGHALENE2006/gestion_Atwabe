import mongoose from '../../BackEnd/node_modules/mongoose/index.js';
import Product from '../../BackEnd/models/productModel.js';
import Fabric from '../../BackEnd/models/Fabric.js';
import SfifaStock from '../../BackEnd/models/SfifaStock.js';
import TailoringOrder from '../../BackEnd/models/TailoringOrder.js';
import TailoringWorker from '../../BackEnd/models/TailoringWorker.js';
import WorkerWork from '../../BackEnd/models/WorkerWork.js';
import Credit from '../../BackEnd/models/userCidit.js';
import Employee from '../../BackEnd/models/EmployeModele.js';
import Client from '../../BackEnd/models/Client.js';
import Category from '../../BackEnd/models/Category.js';
import Supplier from '../../BackEnd/models/Fournisseur.js';
import Expense from '../../BackEnd/models/SideExpense.js';
import SalesDocument from '../../BackEnd/models/SalesDocument.js';
import Admin from '../../BackEnd/models/AdminModel.js';

export const searchOwner = '600000000000000000000001', searchOther = '600000000000000000000002', searchEmployee = '600000000000000000000003';
const id = number => '700000000000000000' + String(number).padStart(6, '0');
const values = (row, path) => !path.length ? [row] : Array.isArray(row) ? row.flatMap(entry => values(entry, path)) : values(row?.[path[0]], path.slice(1));
const same = (a, b) => a === b || a != null && b != null && String(a) === String(b);
export function searchMatch(row, scope) {
  return Object.entries(scope).every(([key, value]) => {
    if (key === '$and') return value.every(entry => searchMatch(row, entry));
    if (key === '$or') return value.some(entry => searchMatch(row, entry));
    const candidates = values(row, key.split('.')).flatMap(entry => Array.isArray(entry) ? entry : [entry]);
    if (value instanceof RegExp) return candidates.some(entry => entry != null && value.test(String(entry)));
    if (value && typeof value === 'object' && !value._bsontype) {
      if ('$exists' in value) return candidates.some(entry => entry !== undefined) === value.$exists;
      if ('$in' in value) return candidates.some(entry => value.$in.some(expected => same(entry, expected)));
    }
    return candidates.some(entry => same(entry, value));
  });
}
function aggregate(rows, pipeline) {
  for (const stage of pipeline) {
    if (stage.$match) rows = rows.filter(row => searchMatch(row, stage.$match));
    else if (stage.$unwind) { const key = stage.$unwind.slice(1); rows = rows.flatMap(row => (row[key] || []).map(entry => ({ ...row, [key]: entry }))); }
    else if (stage.$replaceRoot) { const key = stage.$replaceRoot.newRoot.slice(1); rows = rows.map(row => row[key]); }
    else if (stage.$limit) rows = rows.slice(0, stage.$limit);
    else if (stage.$sort) { const [key, direction] = Object.entries(stage.$sort)[0]; rows = [...rows].sort((a, b) => String(values(a, key.split('.'))[0]).localeCompare(String(values(b, key.split('.'))[0])) * direction); }
  }
  return rows;
}
export function globalSearchFixture(t) {
  const rows = new Map(), calls = [];
  const models = [Product, Fabric, SfifaStock, TailoringOrder, TailoringWorker, WorkerWork, Credit, Employee, Client, Category, Supplier, Expense, SalesDocument, Admin];
  for (const Model of models) {
    rows.set(Model, []);
    t.mock.method(Model, 'find', scope => {
      const call = { model: Model.modelName, scope }; calls.push(call);
      const chain = { select(fields) { call.fields = fields; return this; }, sort() { return this; }, populate() { return this; }, limit(limit) { call.limit = limit; return this; }, maxTimeMS(ms) { call.timeout = ms; return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(() => { if (call.fail || failures.has(Model)) throw new Error('Synthetic unavailable collection'); return rows.get(Model).filter(row => searchMatch(row, scope)).slice(0, call.limit); }).then(resolve, reject); } };
      return chain;
    });
    t.mock.method(Model, 'aggregate', pipeline => {
      const call = { model: Model.modelName, pipeline }; calls.push(call);
      return { option(options) { call.options = options; return this; }, then(resolve, reject) { return Promise.resolve().then(() => { if (failures.has(Model)) throw new Error('Synthetic unavailable collection'); return aggregate(rows.get(Model), pipeline); }).then(resolve, reject); } };
    });
  }
  const failures = new Set();
  let sequence = 1;
  const seed = (Model, fields) => { const row = { _id: id(sequence++), idAdmin: searchOwner, ...fields }; rows.get(Model).push(row); return row; };
  const product = seed(Product, { name: 'منتج نور', barcode: 'PROD-001', quantite: 8, prix_vente: 30, prix_achat: 13, password: 'never-return', stockBatches: [{ batchId: 'initial', number: 1, barcode: 'PROD-001', quantite: 5, prix_achat: 13 }, { batchId: 'second', number: 2, quantite: 3, prix_achat: 20 }] });
  const fabric = seed(Fabric, { type: 'ثوب نور', reference: 'REF-01', colors: [{ _id: id(70), name: 'أزرق', number: '01', pieces: [{ _id: id(71), meters: 30, barcode: '1234567890128' }, { _id: id(72), meters: 47, barcode: '2345678901234' }] }] });
  const stock = seed(SfifaStock, { width: 'thin', family: '01-30', quantity: 17, unassignedQuantity: 2, variants: [{ _id: id(80), code: 1, quantity: 7 }, { _id: id(81), code: 2, quantity: 8 }], production: [] });
  const order = seed(TailoringOrder, { clientName: 'زبون نور', phone: '06 12 34 56 78', garmentType: 'djellaba', orderDate: '2025-01-14', readyDate: '2025-01-21', totalPrice: 500, paidAmount: 200, fabricType: 'حرير', items: [{ fabricType: 'حرير', fabricColor: 'أزرق' }] });
  const worker = seed(TailoringWorker, { name: 'عامل نور', phone: '0611111111', categories: ['machine', 'finishing'], payments: [{ amount: 999 }] });
  const work = seed(WorkerWork, { productName: 'عمل نور', category: 'machine', workType: 'shop', garmentType: 'djellaba', workerId: worker._id, quantity: 2, completedQuantity: 1 });
  const credit = seed(Credit, { idUser: searchOwner, name: 'مدين نور', phone: '0622222222', email: 'nour@example.test', Total: 100, Paye: 25, produit: [{ nom: 'زربية خاصة', prix: 100, Quantite: 1 }] });
  const employee = seed(Employee, { _id: searchEmployee, name: 'موظف نور', phone: '0633333333', email: 'employee@example.test', isActive: true, role: 'Employe', moduleAccess: ['products'], operationPermissions: { products: [] }, password: 'secret-password', Facture: [{ _id: id(95), clientName: 'زبون نور', nameEmp: 'موظف نور', DateFacture: '2024-02-01', TotalPrix: 45, Product: [{ name: 'نور' }] }] });
  const client = seed(Client, { name: 'عميل نور', phone: '0644444444', address: 'شارع نور' });
  seed(Category, { name: 'فئة نور' }); seed(Supplier, { name: 'مورد نور', email: 'supplier@example.test', phone: '0655555555' });
  seed(Expense, { type: 'other', otherName: 'مصاريف نور', amountCents: 5000, month: '2024-05' });
  seed(Expense, { type: 'water', amountCents: 2500, month: '2024-06' });
  seed(SalesDocument, { reference: 'DEVIS-NOUR', clientName: 'عميل نور', nameEmp: 'موظف نور', createdBy: searchEmployee, documentType: 'quote', DateFacture: '2024-04-01', TotalPrix: 600 });
  seed(Admin, { _id: searchOwner, name: 'مدير نور', Facture: [{ _id: id(96), clientName: 'عميل نور', nameEmp: 'مدير نور', DateFacture: '2024-01-01', TotalPrix: 90, Product: [{ name: 'نور' }] }] });
  t.mock.method(Employee, 'findById', employeeId => ({ select() { return Promise.resolve(rows.get(Employee).find(row => same(row._id, employeeId))); } }));
  return { rows, calls, seed, failures, product, fabric, stock, order, worker, work, credit, employee, client, models: { Product, Fabric, SfifaStock, TailoringOrder, TailoringWorker, WorkerWork, Credit, Employee, Client, Category, Supplier, Expense, SalesDocument, Admin }, oid: value => new mongoose.Types.ObjectId(value) };
}
