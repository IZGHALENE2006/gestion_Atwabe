import WorkerWork from '../models/WorkerWork.js';
import { workerWageCents } from '../../shared/workerWork.js';
import TailoringWorker from '../models/TailoringWorker.js';
import { workerMaterialRows, workerMaterialPending } from '../../shared/workerMaterials.js';
import { SHOP_FLOW_GARMENTS, SHOP_FLOW_STAGES, isShopFlowOrigin, shopFlowOriginId, shopWorkBarcode, shopFlowSlot, shopFlowPieceSlot, shopPieceBarcode } from '../../shared/workerShopFlow.js';
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a) === String(b);
const linkedWorks = (origin, works) => works.filter(work => !work.deletedAt && same(work.shopFlow?.originId, origin._id));
const completedIds = work => new Set(workerMaterialPending(work) ? [] : work.completedQuantity === work.quantity ? workerMaterialRows(work).map(row => row.lineId) : (work.completions || []).flatMap(event => event.lineIds || []));
const cleanMaterials = work => workerMaterialRows(work).map(row => { const { unitWage: _unitWage, ...material } = row.toObject ? row.toObject() : row; return material; });

export async function loadShopFlowWorks(idAdmin) {
  return WorkerWork.find({ idAdmin, $or: [{ category: 'machine', workType: { $ne: 'client' }, garmentType: { $in: SHOP_FLOW_GARMENTS } }, { 'shopFlow.originId': { $exists: true } }] }).sort({ createdAt: -1, _id: -1 }).lean();
}
export async function shopFlowNames(works, idAdmin) {
  const ids = [...new Set(works.map(work => String(work.workerId)))];
  const workers = ids.length ? await TailoringWorker.find({ idAdmin, _id: { $in: ids } }).select('name').lean() : [];
  return new Map(workers.map(worker => [String(worker._id), worker.name]));
}
export function shopFlowState(origin, works, names) {
  const linked = linkedWorks(origin, works);
  const stages = SHOP_FLOW_STAGES.map(category => {
    const assigned = (category === 'machine' ? [origin] : linked.filter(work => work.category === category)).filter(work => !work.deletedAt);
    if (!assigned.length) return { category };
    const quantity = assigned.reduce((sum, work) => sum + work.quantity, 0), completedQuantity = assigned.reduce((sum, work) => sum + work.completedQuantity, 0);
    const done = quantity === origin.quantity && completedQuantity === origin.quantity && assigned.every(work => !workerMaterialPending(work));
    const dates = assigned.flatMap(work => work.completions || []).map(event => event.date).sort((a, b) => new Date(a) - new Date(b));
    return { category, workId: String(assigned[0]._id), workIds: assigned.map(work => String(work._id)), workerName: [...new Set(assigned.map(work => names.get(String(work.workerId)) || '').filter(Boolean))].join('، '), quantity, totalQuantity: origin.quantity, completedQuantity, done, assignedAt: assigned.at(-1).createdAt, ...(done && dates.length ? { completedAt: dates.at(-1) } : {}) };
  });
  const current = [...stages].reverse().find(stage => stage.workId);
  return { stages, category: current?.category || 'machine', done: stages.every(stage => stage.done) };
}
export function shopStagePieces(origin, works, category) {
  const linked = linkedWorks(origin, works), previous = linked.filter(work => work.category === 'finishing');
  const machineDone = completedIds(origin), assigned = linked.filter(work => work.category === category);
  return workerMaterialRows(origin).map((row, index) => {
    const existing = assigned.find(work => !work.shopFlow.lineIds || work.shopFlow.lineIds.includes(row.lineId));
    const source = category === 'finishing' ? origin : previous.find(work => completedIds(work).has(row.lineId));
    const reason = existing ? 'shopAlreadyAssigned' : !machineDone.has(row.lineId) ? 'shopMachinePending' : category === 'mesbanto' && !source ? previous.some(work => !work.shopFlow.lineIds || work.shopFlow.lineIds.includes(row.lineId)) ? 'shopFinishingPending' : 'shopFinishingRequired' : '';
    return { lineId: row.lineId, pieceNumber: index + 1, barcode: shopPieceBarcode(origin, index + 1), available: !reason, ...(reason ? { reason } : {}), ...(source ? { sourceWorkId: String(source._id) } : {}) };
  });
}
export function shopStageAvailability(origin, works, category) {
  if (origin.deletedAt || !isShopFlowOrigin(origin)) return { available: false, reason: 'shopWorkNotFound' };
  const pieces = shopStagePieces(origin, works, category);
  if (pieces.length === origin.quantity) {
    if (pieces.some(piece => piece.available)) return { available: true };
    const reason = pieces.every(piece => piece.reason === 'shopAlreadyAssigned') ? 'shopAlreadyAssigned' : pieces.find(piece => piece.reason !== 'shopAlreadyAssigned')?.reason || 'shopMachinePending';
    return { available: false, reason };
  }
  // Work without a complete piece list retains its original aggregate workflow.
  const linked = linkedWorks(origin, works);
  if (linked.some(work => work.category === category)) return { available: false, reason: 'shopAlreadyAssigned' };
  if (origin.quantity !== origin.completedQuantity || workerMaterialPending(origin)) return { available: false, reason: 'shopMachinePending' };
  if (category === 'mesbanto') {
    const previous = linked.find(work => work.category === 'finishing');
    if (!previous) return { available: false, reason: 'shopFinishingRequired' };
    if (previous.quantity !== previous.completedQuantity || workerMaterialPending(previous)) return { available: false, reason: 'shopFinishingPending' };
  }
  return { available: true };
}
export function publicShopOption(origin, works, names, category) {
  const pieces = shopStagePieces(origin, works, category), partial = pieces.length === origin.quantity;
  return { _id: String(origin._id), productName: origin.productName, garmentType: origin.garmentType, quantity: origin.quantity, barcode: shopWorkBarcode(origin), workerName: names.get(String(origin.workerId)) || '', createdAt: origin.createdAt, materials: cleanMaterials(origin), ...(partial ? { pieces, availableQuantity: pieces.filter(piece => piece.available).length } : {}), flow: shopFlowState(origin, works, names), ...shopStageAvailability(origin, works, category) };
}
export async function resolveShopFlow(input, idAdmin) {
  const works = await loadShopFlowWorks(idAdmin), origin = works.find(work => same(work._id, input.shopOriginId) && isShopFlowOrigin(work));
  if (!origin || origin.deletedAt || origin.garmentType !== input.garmentType) throw fail('shopWorkNotFound', 404);
  const availability = shopStageAvailability(origin, works, input.category);
  const names = await shopFlowNames(works, idAdmin), option = publicShopOption(origin, works, names, input.category);
  const pieces = option.pieces ? option.pieces.filter(piece => (input.lineIds || option.pieces.filter(piece => piece.available).map(piece => piece.lineId)).includes(piece.lineId)) : null;
  if (input.lineIds && (!pieces || pieces.length !== input.lineIds.length)) throw Object.assign(fail('invalidWork', 400), { fields: { lineIds: 'chooseShopPieces' } });
  if (pieces?.some(piece => !piece.available)) throw fail(pieces.find(piece => !piece.available).reason);
  if (!availability.available) throw fail(availability.reason);
  const quantity = pieces ? pieces.length : origin.quantity;
  if (workerWageCents(input.unitWage, quantity, input.category) === null) throw Object.assign(fail('invalidWork', 400), { fields: { unitWage: 'invalidWage' } });
  const source = input.category === 'finishing' ? origin : works.find(work => !work.deletedAt && work.category === 'finishing' && same(work.shopFlow?.originId, origin._id));
  const sources = pieces?.map(piece => { const work = works.find(work => same(work._id, piece.sourceWorkId)); return { lineId: piece.lineId, workId: piece.sourceWorkId, workerName: names.get(String(work.workerId)) || '' }; });
  return { productName: origin.productName, category: input.category, workType: 'shop', garmentType: origin.garmentType, quantity, unitWage: input.unitWage,
    ...(pieces ? { shopFlowPieceSlots: pieces.map(piece => shopFlowPieceSlot(origin._id, input.category, piece.lineId)).sort() } : { shopFlowSlot: shopFlowSlot(origin._id, input.category) }),
    shopFlow: { originId: origin._id, sourceWorkId: sources?.[0].workId || source._id, sourceCategory: input.category === 'finishing' ? 'machine' : 'finishing', originWorkerName: option.workerName, sourceWorkerName: sources ? [...new Set(sources.map(row => row.workerName))].join('، ') : names.get(String(source.workerId)) || '',
      ...(pieces ? { lineIds: pieces.map(piece => piece.lineId), pieceNumbers: pieces.map(piece => piece.pieceNumber), sources } : {}), materials: pieces ? option.materials.filter(row => pieces.some(piece => piece.lineId === row.lineId)) : option.materials } };
}
export async function requireNoLaterShopStage(work, idAdmin) {
  const originId = shopFlowOriginId(work);
  if (!originId) return;
  const index = SHOP_FLOW_STAGES.indexOf(work.category);
  const next = await WorkerWork.find({ idAdmin, 'shopFlow.originId': originId, category: { $in: SHOP_FLOW_STAGES.slice(index + 1) }, deletedAt: { $exists: false } }).lean();
  if (next.some(other => !work.shopFlow?.lineIds || !other.shopFlow?.lineIds || other.shopFlow.lineIds.some(id => work.shopFlow.lineIds.includes(id)))) throw fail('shopHasLaterStage');
}
export async function attachShopFlowState(works, idAdmin) {
  if (!works.some(shopFlowOriginId)) return works;
  const all = await loadShopFlowWorks(idAdmin), names = await shopFlowNames(all, idAdmin);
  return works.map(work => {
    const originId = shopFlowOriginId(work), origin = all.find(row => same(row._id, originId) && isShopFlowOrigin(row));
    return origin ? { ...work, shopBarcode: shopWorkBarcode(work), flow: shopFlowState(origin, all, names) } : work;
  });
}
