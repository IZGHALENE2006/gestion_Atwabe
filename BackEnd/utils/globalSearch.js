import mongoose from 'mongoose';
import Product from '../models/productModel.js';
import Fabric from '../models/Fabric.js';
import SfifaStock from '../models/SfifaStock.js';
import TailoringOrder from '../models/TailoringOrder.js';
import TailoringWorker from '../models/TailoringWorker.js';
import WorkerWork from '../models/WorkerWork.js';
import Credit from '../models/userCidit.js';
import Employee from '../models/EmployeModele.js';
import Client from '../models/Client.js';
import Category from '../models/Category.js';
import Supplier from '../models/Fournisseur.js';
import Expense from '../models/SideExpense.js';
import SalesDocument from '../models/SalesDocument.js';
import Admin from '../models/AdminModel.js';
import { canEmployeeOperation } from '../../shared/employeePermissions.js';
import { searchText, searchTokens, allowedSearchGroups } from '../../shared/globalSearch.js';
import { productBatchBarcode, isProductBatchBarcode } from '../../shared/productBarcodes.js';
import { tailoringOrderBarcode } from '../../shared/tailoringBarcode.js';
import { tailoringGarmentType } from '../../shared/tailoring.js';
import { shopWorkBarcode, shopPieceBarcode, shopPieceNumber } from '../../shared/workerShopFlow.js';
import { workerCategories } from '../../shared/workers.js';
import { sfifaStockBarcode, formatSfifaCode } from '../../shared/sfifaStock.js';

const aliases = {
  garmentType: { djellaba: 'جلابة جلابيب جلالب djellaba djellabas', jabador: 'جبادور جبادورات jabador', malakiya: 'ملكية مالكية malakiya', trousers: 'سروال سراويل pantalon pantalons', shirts: 'قميص أقمصة chemise chemises' },
  category: { machine: 'آلة الالة machine', sfifa: 'سفيفة sfifa', finishing: 'تصفية finition', brim: 'بريم brim', trousers: 'سراويل سروال pantalons', shirts: 'قميص أقمصة chemises', mesbanto: 'مصبنة غسيل lavage blanchisserie' },
  width: { thin: 'رقيقة رقيق fine thin', thick: 'عريضة عريض غليظة large thick' },
  type: { water: 'ماء الماء eau', electricity: 'كهرباء ضوء كهربائية électricité', internet: 'انترنت واي فاي wifi internet', rent: 'كراء إيجار loyer location', other: 'أخرى autre' },
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Literal, bounded expressions; Arabic spelling variants and Latin accents are equivalent.
export function searchRegex(token) {
  const variants = { a: 'aàâäá', e: 'eéèêë', i: 'iîïí', o: 'oôöó', u: 'uùûüú', c: 'cç', 'ا': 'اأإآٱ', 'ي': 'يى', 'ه': 'هة' };
  return new RegExp([...searchText(token)].map(char => variants[char] ? '[' + variants[char] + ']' : /\d/.test(char) ? '[' + char + String.fromCharCode(0x660 + Number(char)) + String.fromCharCode(0x6f0 + Number(char)) + '][\\s()./+-]*' : escapeRegex(char)).join('[\\u0300-\\u036f\\u064b-\\u065f\\u0670]*'), 'i');
}
export function searchConditions(query, fields, enums = {}) {
  return { $and: searchTokens(query).map(token => ({ $or: [
    ...fields.map(field => ({ [field]: searchRegex(token) })),
    ...Object.entries(enums).flatMap(([field, kind]) => {
      const values = Object.entries(aliases[kind] || {}).filter(([value, words]) => searchText(value + ' ' + words).split(/\s+/).includes(token)).map(([value]) => value);
      return values.length ? [{ [field]: { $in: values } }] : [];
    }),
  ] })) };
}
const fact = (label, value, format) => ({ label, value, ...(format ? { format } : {}) });
const keyFact = (label, value) => fact(label, value, 'key');
const text = value => String(value ?? '').slice(0, 240);
const toId = value => String(value?._id ?? value ?? '');
const pathFor = (path, row, label, params = {}) => path + '?' + new URLSearchParams({ ...params, record: toId(row), recordLabel: text(label) });
const item = (row, title, path, facts = [], barcode = '') => ({ id: toId(row), title: text(title), path, facts: facts.filter(entry => entry.value !== undefined && entry.value !== '' && entry.value !== null), ...(barcode ? { barcode } : {}) });
const find = (Model, scope, fields, limit) => Model.find(scope).select(fields).sort({ _id: -1 }).limit(limit).maxTimeMS(3000).lean();
const oid = value => new mongoose.Types.ObjectId(value);

function workQuery(query) {
  const match = /^SW-([a-f\d]{24})(?:-(\d+))?$/i.exec(query);
  return match ? { $or: [{ _id: oid(match[1]) }, { 'shopFlow.originId': oid(match[1]) }] } : searchConditions(query,
    ['productName', 'tailoring.clientName', 'tailoring.phone', 'tailoring.barcode', 'tailoring.items.fabricType', 'tailoring.items.fabricColor', 'shopTrouser.fabricType', 'shopFlow.originWorkerName', 'shopFlow.sourceWorkerName', 'materialOperations.rows.fabricType', 'materialOperations.rows.fabricColor'],
    { garmentType: 'garmentType', 'tailoring.garmentType': 'garmentType', category: 'category', 'sfifa.width': 'width' });
}
export async function searchApplication({ owner, actorId, role, user, query, group = '', limit = 6 }) {
  const allowed = allowedSearchGroups(role, user), selected = group ? allowed.filter(key => key === group) : allowed;
  const scope = { idAdmin: owner }, take = limit + 1;
  const jobs = {
    products: async () => {
      let filter = searchConditions(query, ['name', 'barcode', 'stockBatches.barcode', 'fournisseur']);
      if (isProductBatchBarcode(query)) {
        const id = BigInt(query.slice(1, 30)).toString(16).padStart(24, '0'), number = Number(query.slice(30));
        if (id.length === 24 && number > 0) filter = { $or: [filter, { _id: oid(id), $or: [{ 'stockBatches.number': number }, ...(number === 1 ? [{ stockBatches: { $exists: false } }] : [])] }] };
      }
      const rows = await find(Product, { ...scope, ...filter }, '_id name barcode quantite prix_vente stockBatches.batchId stockBatches.number stockBatches.barcode stockBatches.quantite', take);
      return rows.filter(row => !isProductBatchBarcode(query) || searchText(row.barcode) === searchText(query) || (!row.stockBatches?.length && searchText(productBatchBarcode(row, { batchId: 'initial', number: 1 })) === searchText(query)) || (row.stockBatches || []).some(batch => searchText(productBatchBarcode(row, batch)) === searchText(query))).map(row => {
        const batch = row.stockBatches?.find(batch => searchText(productBatchBarcode(row, batch)) === searchText(query));
        return item(row, row.name, pathFor('/Home/products', row, row.name), [fact('quantity', row.quantite), fact('price', row.prix_vente, 'money'), ...(batch ? [fact('barcode', productBatchBarcode(row, batch)), fact('batchQuantity', batch.quantite)] : [])], batch ? productBatchBarcode(row, batch) : row.barcode);
      });
    },
    fabrics: async () => {
      const rows = await find(Fabric, { ...scope, ...searchConditions(query, ['type', 'reference', 'colors.name', 'colors.number', 'colors.pieces.barcode']) }, '_id type reference colors', take);
      return rows.map(row => {
        const matches = row.colors.flatMap(color => color.pieces.filter(piece => searchText(piece.barcode) === searchText(query)).map(piece => ({ color, piece })));
        const found = matches[0];
        return item(row, row.type, pathFor('/Home/Atwabe', row, row.type, found ? { piece: found.piece.barcode } : {}), [fact('reference', row.reference), ...(found ? [fact('color', found.color.name), fact('meters', found.piece.meters)] : [fact('colors', row.colors.map(color => color.name).join('، '))])], found?.piece.barcode);
      });
    },
    sfifa: async () => {
      const codeMatch = /^SF-([a-f\d]{24})$/i.exec(query), number = /^\d+$/.test(searchText(query)) ? Number(searchText(query)) : null;
      const filter = codeMatch ? { $or: [{ _id: oid(codeMatch[1]) }, { 'variants._id': oid(codeMatch[1]) }] } : number !== null ? { 'variants.code': number } : searchConditions(query, ['family'], { width: 'width' });
      const rows = await find(SfifaStock, { ...scope, ...filter }, '_id width family variants unassignedQuantity quantity', take);
      return rows.flatMap(row => {
        const variants = (row.variants || []).filter(entry => codeMatch ? toId(entry).toLowerCase() === codeMatch[1].toLowerCase() : number === null || entry.code === number);
        const choices = variants.length ? variants : codeMatch && toId(row).toLowerCase() !== codeMatch[1].toLowerCase() || number !== null ? [] : [{ _id: row._id, quantity: row.unassignedQuantity ?? row.quantity }];
        return choices.slice(0, take).map(entry => ({ ...item(entry, formatSfifaCode(entry.code, row.family) || row.family, pathFor('/Home/SfifaStock', entry, formatSfifaCode(entry.code, row.family) || row.family), [keyFact('width', 'sfifaStock.widths.' + row.width), fact('family', row.family), fact('meters', entry.quantity)], sfifaStockBarcode(entry)), titleKey: 'globalSearch.sfifaItem', titleValue: formatSfifaCode(entry.code, row.family) || row.family }));
      });
    },
    tailoring: async () => {
      const code = /^FS-([a-f\d]{24})$/i.exec(query);
      const rows = await find(TailoringOrder, { ...scope, ...(code ? { _id: oid(code[1]) } : searchConditions(query, ['clientName', 'phone', 'fabricType', 'fabricColor', 'fabricReference', 'items.fabricType', 'items.fabricColor', 'items.fabricReference', 'items.shirtType'], { garmentType: 'garmentType' })) }, '_id garmentType clientName phone orderDate readyDate totalPrice paidAmount fabricType items.fabricType items.fabricColor deliveredAt cancelledAt', take);
      return rows.map(row => item(row, row.clientName, pathFor('/Home/Fesla', row, row.clientName, { garment: tailoringGarmentType(row) }), [keyFact('garment', 'fesla.garmentTypes.' + tailoringGarmentType(row)), fact('phone', row.phone), fact('date', row.orderDate), fact('total', row.totalPrice, 'money'), fact('paid', row.paidAmount, 'money'), keyFact('status', 'globalSearch.status.' + (row.cancelledAt ? 'cancelled' : row.deliveredAt ? 'delivered' : 'pending'))], tailoringOrderBarcode(row)));
    },
    workers: async () => (await find(TailoringWorker, { ...scope, deletedAt: { $exists: false }, ...searchConditions(query, ['name', 'phone'], { category: 'category', categories: 'category' }) }, '_id name phone category categories', take)).map(row => item(row, row.name, '/Home/Khadama/' + workerCategories(row)[0] + '/workers/' + toId(row), [fact('phone', row.phone), ...workerCategories(row).map(category => keyFact('section', 'workers.categories.' + category))])),
    work: async () => {
      const fields = '_id workerId category workType garmentType productName quantity completedQuantity shopFlow.originId tailoring.clientName tailoring.barcode tailoring.garmentType';
      const filter = { ...scope, deletedAt: { $exists: false }, ...workQuery(query) };
      const [regular, sfifa] = await Promise.all([
        find(WorkerWork, filter, fields, take),
        SfifaStock.aggregate([{ $match: { idAdmin: oid(owner) } }, { $unwind: '$production' }, { $replaceRoot: { newRoot: '$production' } }, { $match: { ...filter, idAdmin: oid(owner) } }, { $sort: { _id: -1 } }, { $limit: take }, { $project: Object.fromEntries(fields.split(' ').map(field => [field, 1])) }]).option({ maxTimeMS: 3000 }),
      ]);
      const rows = [...regular, ...sfifa].filter(row => !/-\d+$/.test(query) || !query.toUpperCase().startsWith('SW-') || shopPieceNumber(row, query) !== null);
      const workers = rows.length ? await find(TailoringWorker, { ...scope, _id: { $in: rows.map(row => row.workerId) } }, '_id name', take * 2) : [];
      const names = new Map(workers.map(worker => [toId(worker), worker.name]));
      return rows.map(row => {
        const piece = shopPieceNumber(row, query), barcode = piece ? shopPieceBarcode(row, piece) : shopWorkBarcode(row) || row.tailoring?.barcode;
        const family = row.garmentType || row.tailoring?.garmentType || 'legacy';
        return item(row, row.productName, pathFor('/Home/Khadama/' + row.category + '/workers/' + toId(row.workerId), row, row.productName, { type: row.workType || 'shop', garment: family }), [fact('worker', names.get(toId(row.workerId))), keyFact('section', 'workers.categories.' + row.category), fact('client', row.tailoring?.clientName), fact('quantity', row.quantity), fact('completed', row.completedQuantity), ...(piece ? [fact('piece', piece)] : [])], barcode);
      });
    },
    credit: async () => (await find(Credit, { idUser: owner, ...searchConditions(query, ['name', 'phone', 'email', 'cin', 'produit.nom', 'creditInvoices.lines.nom', 'creditInvoices.line.nom']) }, '_id name phone email Total Paye produit.prix produit.Quantite produit.lineTotal produit.Paiement', take)).map(row => {
      const canDetails = role === 'admin' || ['details', 'addDebt', 'payment', 'history', 'print', 'share'].some(operation => canEmployeeOperation(role, user, 'credit', operation));
      const total = row.Total || (row.produit || []).reduce((sum, line) => sum + Number(line.lineTotal ?? Number(line.prix || 0) * Number(line.Quantite || 1)), 0), paid = row.Paye || (row.produit || []).reduce((sum, line) => sum + Number(line.Paiement || 0), 0);
      return item(row, row.name, canDetails ? '/Home/cridit/UserCreditDetails/' + toId(row) : pathFor('/Home/cridit/UserCridit', row, row.name), [fact('phone', row.phone), fact('email', row.email), fact('total', total, 'money'), fact('paid', paid, 'money'), fact('remaining', Math.max(0, total - paid), 'money')]);
    }),
    employees: async () => (await find(Employee, { ...scope, ...searchConditions(query, ['name', 'phone', 'email', 'cin']) }, '_id name phone email isActive', take)).map(row => item(row, row.name, pathFor('/Home/employees/EmployeeDashboard', row, row.name), [fact('phone', row.phone), fact('email', row.email), keyFact('status', 'globalSearch.status.' + (row.isActive ? 'active' : 'inactive'))])),
    clients: async () => (await find(Client, { ...scope, ...searchConditions(query, ['name', 'phone', 'cin', 'address', 'fax', 'website']) }, '_id name phone address', take)).map(row => item(row, row.name, pathFor('/Home/Clients', row, row.name), [fact('phone', row.phone), fact('address', row.address)])),
    categories: async () => (await find(Category, { ...scope, ...searchConditions(query, ['name']) }, '_id name', take)).map(row => item(row, row.name, pathFor('/Home/Categories', row, row.name))),
    suppliers: async () => (await find(Supplier, { ...scope, ...searchConditions(query, ['name', 'phone', 'email', 'Ville']) }, '_id name phone email Ville', take)).map(row => item(row, row.name, pathFor('/Home/Fornisseur', row, row.name), [fact('phone', row.phone), fact('email', row.email), fact('address', row.Ville)])),
    expenses: async () => (await find(Expense, { ...scope, ...searchConditions(query, ['otherName', 'month'], { type: 'type' }) }, '_id type otherName amountCents month createdAt', take)).map(row => ({ ...item(row, row.otherName, pathFor('/Home/SideExpenses', row, row.otherName || row.type, { month: row.month || '' }), [fact('month', row.month), fact('total', row.amountCents / 100, 'money')]), ...(row.type !== 'other' ? { titleKey: 'sideExpenses.types.' + row.type } : {}) })),
    invoices: async () => {
      const employee = role === 'Employe';
      const noteScope = { ...scope, ...(employee ? { createdBy: actorId } : {}), ...searchConditions(query, ['reference', 'clientName', 'nameEmp', 'Product.name', 'Product.code']) };
      const match = searchConditions(query, ['Facture.clientName', 'Facture.nameEmp', 'Facture.Product.name', 'Facture.Product.code']);
      if (/^(?:#)?[a-f\d]{5,24}$/i.test(query)) match.$and[0].$or.push({ 'Facture._id': /^[a-f\d]{24}$/i.test(query) ? oid(query) : { $exists: false } });
      const pipeline = ownerMatch => [{ $match: ownerMatch }, { $unwind: '$Facture' }, { $match: match }, { $sort: { 'Facture.DateFacture': -1 } }, { $limit: take }, { $replaceRoot: { newRoot: '$Facture' } }, { $project: { _id: 1, clientName: 1, nameEmp: 1, DateFacture: 1, TotalPrix: 1, invoiceOrigin: 1 } }];
      const [notes, adminInvoices, employeeInvoices] = await Promise.all([
        find(SalesDocument, noteScope, '_id reference clientName nameEmp documentType DateFacture TotalPrix', take),
        employee ? [] : Admin.aggregate(pipeline({ _id: oid(owner) })).option({ maxTimeMS: 3000 }),
        Employee.aggregate(pipeline(employee ? { _id: oid(actorId), idAdmin: { $in: [owner, oid(owner)] } } : { idAdmin: { $in: [owner, oid(owner)] } })).option({ maxTimeMS: 3000 }),
      ]);
      return [...notes, ...adminInvoices, ...employeeInvoices].sort((a, b) => new Date(b.DateFacture) - new Date(a.DateFacture)).map(row => item(row, row.reference || '#' + toId(row).slice(-5).toUpperCase(), pathFor(row.invoiceOrigin === 'cashier' || !row.documentType && row.invoiceOrigin !== 'manual' ? '/Home/Facture/caisse' : '/Home/Facture', row, row.reference || row.clientName), [fact('client', row.clientName), fact('employee', row.nameEmp), fact('date', new Date(row.DateFacture).toISOString().slice(0, 10)), fact('total', row.TotalPrix, 'money')]));
    },
  };
  const results = await Promise.all(selected.map(async key => {
    try {
      const items = await jobs[key]();
      items.sort((a, b) => Number(searchText(b.barcode) === searchText(query)) - Number(searchText(a.barcode) === searchText(query)) || Number(searchText(b.title) === searchText(query)) - Number(searchText(a.title) === searchText(query)));
      return { key, items: items.slice(0, limit), hasMore: items.length > limit };
    } catch { return { key, items: [], hasMore: false, error: true }; }
  }));
  return { groups: results, availableGroups: allowed };
}
