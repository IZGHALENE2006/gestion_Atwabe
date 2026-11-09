import WorkerWork from '../models/WorkerWork.js';
import { workerWageCents } from '../../shared/workerWork.js';
import TailoringWorker from '../models/TailoringWorker.js';
import { workerMaterialRows, workerMaterialPending } from '../../shared/workerMaterials.js';
import { SHOP_FLOW_GARMENTS, SHOP_FLOW_STAGES, isShopFlowOrigin, shopFlowOriginId, shopWorkBarcode, shopFlowSlot } from '../../shared/workerShopFlow.js';
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function loadShopFlowWorks(idAdmin) {
  return WorkerWork.find({ idAdmin, $or: [{ category: 'machine', workType: { $ne: 'client' }, garmentType: { $in: SHOP_FLOW_GARMENTS } }, { 'shopFlow.originId': { $exists: true } }] }).sort({ createdAt: -1, _id: -1 }).lean();
}
export async function shopFlowNames(works, idAdmin) {
  const ids = [...new Set(works.map(work => String(work.workerId)))];
  const workers = ids.length ? await TailoringWorker.find({ idAdmin, _id: { $in: ids } }).select('name').lean() : [];
  return new Map(workers.map(worker => [String(worker._id), worker.name]));
}
export function shopFlowState(origin, works, names) {
  const stages = SHOP_FLOW_STAGES.map(category => {
    const work = category === 'machine' ? origin : works.find(work => !work.deletedAt && work.category === category && String(work.shopFlow?.originId) === String(origin._id));
    return { category, ...(work && !work.deletedAt ? { workId: String(work._id), workerName: names.get(String(work.workerId)) || '', quantity: work.quantity, completedQuantity: work.completedQuantity, done: work.quantity === work.completedQuantity && !workerMaterialPending(work), assignedAt: work.createdAt, ...(work.quantity === work.completedQuantity && work.completions?.length ? { completedAt: work.completions.at(-1).date } : {}) } : {}) };
  });
  const current = [...stages].reverse().find(stage => stage.workId);
  return { stages, category: current?.category || 'machine', done: stages.every(stage => stage.done) };
}
export function shopStageAvailability(origin, works, category) {
  if (origin.deletedAt || !isShopFlowOrigin(origin)) return { available: false, reason: 'shopWorkNotFound' };
  const linked = works.filter(work => !work.deletedAt && String(work.shopFlow?.originId) === String(origin._id));
  if (linked.some(work => work.category === category)) return { available: false, reason: 'shopAlreadyAssigned' };
  if (origin.quantity !== origin.completedQuantity || workerMaterialPending(origin)) return { available: false, reason: 'shopMachinePending' };
  if (category === 'mesbanto') {
    const previous = linked.find(work => work.category === 'finishing');
    if (!previous) return { available: false, reason: 'shopFinishingRequired' };
    if (previous.quantity !== previous.completedQuantity) return { available: false, reason: 'shopFinishingPending' };
  }
  return { available: true };
}
export function publicShopOption(origin, works, names, category) {
  return { _id: String(origin._id), productName: origin.productName, garmentType: origin.garmentType, quantity: origin.quantity, barcode: shopWorkBarcode(origin), workerName: names.get(String(origin.workerId)) || '', createdAt: origin.createdAt, materials: workerMaterialRows(origin).map(row => { const { unitWage: _unitWage, ...material } = row.toObject ? row.toObject() : row; return material; }), flow: shopFlowState(origin, works, names), ...shopStageAvailability(origin, works, category) };
}
export async function resolveShopFlow(input, idAdmin) {
  const works = await loadShopFlowWorks(idAdmin), origin = works.find(work => String(work._id) === input.shopOriginId && isShopFlowOrigin(work));
  if (!origin || origin.deletedAt || origin.garmentType !== input.garmentType) throw fail('shopWorkNotFound', 404);
  const availability = shopStageAvailability(origin, works, input.category);
  if (!availability.available) throw fail(availability.reason);
  if (workerWageCents(input.unitWage, origin.quantity, input.category) === null) throw Object.assign(fail('invalidWork', 400), { fields: { unitWage: 'invalidWage' } });
  const names = await shopFlowNames(works, idAdmin), source = input.category === 'finishing' ? origin : works.find(work => !work.deletedAt && work.category === 'finishing' && String(work.shopFlow?.originId) === input.shopOriginId);
  const option = publicShopOption(origin, works, names, input.category);
  return { productName: origin.productName, category: input.category, workType: 'shop', garmentType: origin.garmentType, quantity: origin.quantity, unitWage: input.unitWage, shopFlowSlot: shopFlowSlot(origin._id, input.category), shopFlow: { originId: origin._id, sourceWorkId: source._id, sourceCategory: source.category, originWorkerName: option.workerName, sourceWorkerName: names.get(String(source.workerId)) || '', materials: option.materials } };
}
export async function requireNoLaterShopStage(work, idAdmin) {
  const originId = shopFlowOriginId(work);
  if (!originId) return;
  const index = SHOP_FLOW_STAGES.indexOf(work.category);
  const next = await WorkerWork.findOne({ idAdmin, 'shopFlow.originId': originId, category: { $in: SHOP_FLOW_STAGES.slice(index + 1) }, deletedAt: { $exists: false } });
  if (next) throw fail('shopHasLaterStage');
}
export async function attachShopFlowState(works, idAdmin) {
  if (!works.some(shopFlowOriginId)) return works;
  const all = await loadShopFlowWorks(idAdmin), names = await shopFlowNames(all, idAdmin);
  return works.map(work => {
    const originId = shopFlowOriginId(work), origin = all.find(row => String(row._id) === originId && isShopFlowOrigin(row));
    return origin ? { ...work, shopBarcode: shopWorkBarcode(work), flow: shopFlowState(origin, all, names) } : work;
  });
}
