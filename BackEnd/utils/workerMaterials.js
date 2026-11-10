import Fabric from '../models/Fabric.js';
import SfifaStock from '../models/SfifaStock.js';
import WorkerWork from '../models/WorkerWork.js';
import { FABRIC_LIMITS } from '../../shared/fabrics.js';
import { SFIFA_STOCK_GROUP_LIMIT, SFIFA_STOCK_LIMIT, sfifaQuantityUnits, sfifaStockStyles } from '../../shared/sfifaStock.js';
import { usesWorkerMaterials, workerMaterialPending, workerMaterialRows, WORKER_SFIFA_METERS } from '../../shared/workerMaterials.js';
import { tailoringGarmentType } from '../../shared/tailoring.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a) === String(b);
const units = value => Math.round(value * 1000);
const retryable = error => error.name === 'VersionError';
export function requireWorkerMaterialsReady(work) {
  if (workerMaterialPending(work)) throw fail('materialsPending', 503);
}
export function archiveWorkerAssignment(work, actor) {
  work.deletedAt = new Date(); work.deletedBy = actor;
  if (work.shopFlow) work.shopFlowSlot = undefined;
  if (work.tailoring) {
    work.archivedTailoring = work.tailoring.toObject ? work.tailoring.toObject() : work.tailoring;
    work.tailoring = undefined;
  }
}
function groupsFor(rows) {
  const groups = new Map();
  for (const row of rows) for (const kind of ['fabric', 'sfifa']) {
    const id = row[kind === 'fabric' ? 'fabricId' : 'sfifaId'], key = `${kind}:${id}`;
    if (!groups.has(key)) groups.set(key, { kind, id, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

export async function resolveWorkerMaterials(input, details, idAdmin) {
  if (!details || !usesWorkerMaterials(details.category, details.workType, details.tailoring ? tailoringGarmentType(details.tailoring) : details.garmentType)) throw fail('invalidMaterialSection', 400);
  const fabrics = new Map(), sfifas = new Map();
  await Promise.all([...new Set(input.map(row => row.fabricId))].map(async id => fabrics.set(id, await Fabric.findOne({ _id: id, idAdmin }))));
  await Promise.all([...new Set(input.map(row => row.sfifaId))].map(async id => sfifas.set(id, await SfifaStock.findOne({ _id: id, idAdmin }))));
  const result = input.map((row, index) => {
    const fabric = fabrics.get(row.fabricId), color = fabric?.colors.find(color => same(color._id, row.colorId)), piece = color?.pieces.find(piece => same(piece._id, row.pieceId));
    const sfifa = sfifas.get(row.sfifaId), variant = sfifa?.variants?.find(variant => same(variant._id, row.variantId));
    if (!piece || (!variant && !same(sfifa?._id, row.variantId))) throw fail('materialStockUnavailable');
    const styles = sfifaStockStyles(sfifa, variant?.code);
    if (styles.length ? !styles.includes(row.sfifaStyle) : row.sfifaStyle !== undefined) throw Object.assign(fail('invalidWork', 400), { fields: { [`materials.${index}.sfifaStyle`]: 'chooseSfifaStyle' } });
    return { ...row, sfifaMeters: WORKER_SFIFA_METERS, fabricType: fabric.type, fabricColor: color.name, fabricReference: fabric.reference || '', pieceBarcode: piece.barcode, sfifaWidth: sfifa.width, sfifaFamily: sfifa.family, ...(variant ? { sfifaCode: variant.code } : {}) };
  });
  for (const group of groupsFor(result)) checkAndChange(group, group.kind === 'fabric' ? fabrics.get(String(group.id)) : sfifas.get(String(group.id)), false);
  return result;
}
function checkAndChange(group, document, release) {
  const changes = new Map();
  for (const row of group.rows) {
    const key = String(row[group.kind === 'fabric' ? 'pieceId' : 'variantId']);
    if (!changes.has(key)) changes.set(key, { row, quantity: 0 });
    changes.get(key).quantity += units(group.kind === 'fabric' ? row.meters : row.sfifaMeters);
  }
  let total = 0;
  for (const { row, quantity } of changes.values()) {
    const unassigned = group.kind === 'sfifa' && same(row.variantId, document._id);
    const target = group.kind === 'fabric'
      ? document.colors.find(color => same(color._id, row.colorId))?.pieces.find(piece => same(piece._id, row.pieceId))
      : unassigned ? document : document.variants?.find(variant => same(variant._id, row.variantId));
    if (!target || (group.kind === 'fabric' && target.barcode !== row.pieceBarcode)) throw fail('materialStockUnavailable');
    const key = group.kind === 'fabric' ? 'meters' : unassigned ? 'unassignedQuantity' : 'quantity';
    const after = units(target[key] ?? (unassigned ? document.quantity : 0)) + (release ? quantity : -quantity);
    if (after < 0) throw fail(group.kind === 'fabric' ? 'insufficientFabric' : 'insufficientSfifa');
    if (after > units(group.kind === 'fabric' ? FABRIC_LIMITS.meters : SFIFA_STOCK_LIMIT)) throw fail('materialsReturnLimit');
    target[key] = after / 1000; total += quantity;
  }
  if (group.kind === 'sfifa') {
    const after = units(document.quantity) + (release ? total : -total);
    if (sfifaQuantityUnits(after / 1000, { max: SFIFA_STOCK_GROUP_LIMIT }) === null) throw fail('materialsReturnLimit');
    document.quantity = after / 1000;
  }
}
async function changeGroup(group, work, operation, release) {
  const Model = group.kind === 'fabric' ? Fabric : SfifaStock, operationId = `${work._id}:${operation.requestId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const document = await Model.findOne({ _id: group.id, idAdmin: work.idAdmin });
      if (!document) { if (release) return; throw fail('materialStockUnavailable'); }
      const debit = document.workerMaterialDebits?.find(entry => entry.operationId === operationId);
      if (release && (!debit || debit.returnedAt)) return;
      if (!release && debit) { if (debit.returnedAt) throw fail('workRequestConflict'); return; }
      checkAndChange(group, document, release);
      if (release) debit.returnedAt = new Date();
      else { document.workerMaterialDebits ||= []; document.workerMaterialDebits.push({ operationId, workId: work._id, date: new Date() }); }
      // Quantity and its durable operation marker always share one optimistic write.
      await document.save(); return;
    } catch (error) { if (!retryable(error)) throw error; if (attempt === 4) throw fail('materialsPending', 503); }
  }
}
export function makeWorkerMaterialOperation(kind, requestId, rows, createdBy) {
  return { kind, requestId, rows, createdBy, date: new Date(), state: 'reserving' };
}
function undoMaterialAddition(work, operation) {
  const lineIds = new Set(operation.rows.map(row => row.lineId));
  const event = work.additions.find(event => event.requestId === operation.requestId);
  if (!event) throw new Error('Missing material addition');
  work.quantity -= event.quantity;
  work.additions = work.additions.filter(event => event.requestId !== operation.requestId);
  if (work.tailoring) {
    work.tailoring.lineIds = work.tailoring.lineIds.filter(id => !lineIds.has(id));
    work.tailoring.items = work.tailoring.items.filter(item => !lineIds.has(item.lineId));
  }
}
export async function resumeWorkerMaterials(work) {
  try {
    if (work.materialStatus === 'returning') {
      for (const operation of work.materialOperations || []) if (operation.state !== 'failed') {
        for (const group of groupsFor(operation.rows)) await changeGroup(group, work, operation, true);
      }
      work.cancelledAt = new Date();
      archiveWorkerAssignment(work, work.materialCancellation.createdBy);
      await work.save(); return work;
    }
    const operation = work.materialOperations?.find(operation => ['reserving', 'rollingBack'].includes(operation.state));
    if (!operation) return work;
    if (operation.state === 'reserving') {
      try { for (const group of groupsFor(operation.rows)) await changeGroup(group, work, operation, false); }
      catch (error) {
        if (!['materialStockUnavailable', 'insufficientFabric', 'insufficientSfifa'].includes(error.message)) throw error;
        operation.state = 'rollingBack'; operation.failureCode = error.message;
        // Save rollback intent before returning any debit; retries cannot reserve it again.
        await work.save();
      }
      if (operation.state === 'reserving') { operation.state = 'committed'; work.materialStatus = 'ready'; await work.save(); return work; }
    }
    for (const group of groupsFor(operation.rows)) await changeGroup(group, work, operation, true);
    if (operation.kind === 'assign') archiveWorkerAssignment(work, operation.createdBy);
    else undoMaterialAddition(work, operation);
    operation.state = 'failed'; work.materialStatus = 'ready';
    await work.save(); throw fail(operation.failureCode);
  } catch (error) {
    if (error.status) throw error;
    throw fail('materialsPending', 503);
  }
}

export async function protectWorkerMaterialDeletion(document, removedIds, kind) {
  const debits = (document.workerMaterialDebits || []).filter(entry => !entry.returnedAt);
  if (!debits.length) return;
  const works = await WorkerWork.find({ idAdmin: document.idAdmin, _id: { $in: debits.map(entry => entry.workId) } }).lean();
  const protectedWork = works.some(work => !work.deletedAt && workerMaterialRows(work).some(row => same(row[kind === 'fabric' ? 'fabricId' : 'sfifaId'], document._id) && (!removedIds || removedIds.has(String(row[kind === 'fabric' ? 'pieceId' : 'variantId'])))));
  if (protectedWork) throw fail('workerMaterialsInUse');
}
