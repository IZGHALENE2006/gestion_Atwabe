import Fabric from '../models/Fabric.js';
import { FABRIC_LIMITS } from '../../shared/fabrics.js';
import { trouserMeterUnits, trouserStockRows, activeTrouserStockOperations } from '../../shared/workerShopTrousers.js';

const same = (a, b) => String(a) === String(b);
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function resolveTrouserStock(shopTrouser, colorIds, idAdmin, creditRows = []) {
  const fabric = await Fabric.findOne({ _id: shopTrouser.fabricId, idAdmin });
  if (!fabric) throw fail('materialStockUnavailable');
  const rows = [], required = trouserMeterUnits(shopTrouser.metersPerPiece);
  for (const colorId of colorIds) {
    const color = fabric.colors.find(color => same(color._id, colorId));
    if (!color) throw fail('materialStockUnavailable');
    let remaining = required;
    // Consume the color's existing rolls in their stored order; a color may span rolls.
    for (const piece of color.pieces) {
      const credit = creditRows.filter(row => same(row.fabricId, fabric._id) && same(row.colorId, colorId) && same(row.pieceId, piece._id) && row.barcode === piece.barcode).reduce((sum, row) => sum + trouserMeterUnits(row.meters), 0);
      const take = Math.min(remaining, trouserMeterUnits(piece.meters) + credit);
      if (take > 0) rows.push({ colorId, pieceId: piece._id, barcode: piece.barcode, meters: take / 1000 });
      remaining -= take;
      if (!remaining) break;
    }
    if (remaining) throw Object.assign(fail('insufficientFabric'), { colorId });
  }
  return rows;
}
export const makeTrouserStockOperation = (kind, requestId, rows, createdBy) => ({ kind, requestId, rows, createdBy, date: new Date(), state: 'reserving' });
async function changeStock(work, operation, release) {
  const operationId = `${work._id}:${operation.requestId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const fabric = await Fabric.findOne({ _id: operation.fabricId || work.shopTrouser.fabricId, idAdmin: work.idAdmin });
      if (!fabric) { if (release) return; throw fail('materialStockUnavailable'); }
      const debit = fabric.workerMaterialDebits?.find(row => row.operationId === operationId);
      if (release && (!debit || debit.returnedAt)) return;
      if (!release && debit) { if (debit.returnedAt) throw fail('workRequestConflict'); return; }
      for (const row of operation.rows) {
        const piece = fabric.colors.find(color => same(color._id, row.colorId))?.pieces.find(piece => same(piece._id, row.pieceId));
        if (!piece || piece.barcode !== row.barcode) throw fail('materialStockUnavailable');
        const meters = trouserMeterUnits(piece.meters) + (release ? 1 : -1) * trouserMeterUnits(row.meters);
        if (meters < 0) throw fail('insufficientFabric');
        if (meters > FABRIC_LIMITS.meters * 1000) throw fail('materialsReturnLimit');
        piece.meters = meters / 1000;
      }
      if (release) debit.returnedAt = new Date();
      else { fabric.workerMaterialDebits ||= []; fabric.workerMaterialDebits.push({ operationId, workId: work._id, date: new Date() }); }
      await fabric.save(); return;
    } catch (error) {
      if (error.name !== 'VersionError') throw error;
      if (attempt === 4) throw fail('materialsPending', 503);
    }
  }
}
export async function prepareTrouserStockEdit(work, details, requestId, createdBy) {
  const previousRows = trouserStockRows(work), previousFabricId = work.shopTrouser?.fabricId;
  const rows = await resolveTrouserStock(details.shopTrouser, details.shopTrouser.colors.map(color => String(color.colorId)), work.idAdmin, previousRows);
  const previousRequests = activeTrouserStockOperations(work).map(operation => operation.requestId);
  // Older operations predate per-operation fabric IDs; retain their original owner.
  for (const operation of work.trouserStockOperations || []) operation.fabricId ||= previousFabricId;
  return { ...makeTrouserStockOperation('edit', requestId, rows, createdBy), fabricId: details.shopTrouser.fabricId, previousFabricId, previousRows, previousRequests };
}
async function changeEditedTrouserStock(work, operation) {
  const ids = [...new Set([operation.previousRows.length ? String(operation.previousFabricId) : '', String(operation.fabricId)].filter(Boolean))].sort();
  const operationId = work._id + ':' + operation.requestId;
  for (const id of ids) for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fabric = await Fabric.findOne({ _id: id, idAdmin: work.idAdmin });
      if (!fabric) throw fail('materialStockUnavailable');
      if (fabric.workerMaterialDebits?.some(debit => debit.operationId === operationId)) break;
      const change = (rows, direction) => { for (const row of rows) {
        const piece = fabric.colors.find(color => same(color._id, row.colorId))?.pieces.find(piece => same(piece._id, row.pieceId));
        if (!piece || piece.barcode !== row.barcode) throw fail('materialStockUnavailable');
        const units = trouserMeterUnits(piece.meters) + direction * trouserMeterUnits(row.meters);
        if (units < 0) throw fail('insufficientFabric');
        if (units > FABRIC_LIMITS.meters * 1000) throw fail('materialsReturnLimit');
        piece.meters = units / 1000;
      } };
      if (same(id, operation.previousFabricId)) change(operation.previousRows, 1);
      if (same(id, operation.fabricId)) change(operation.rows, -1);
      for (const debit of fabric.workerMaterialDebits || []) if (!debit.returnedAt && operation.previousRequests.some(request => debit.operationId === work._id + ':' + request)) debit.returnedAt = new Date();
      fabric.workerMaterialDebits ||= [];
      fabric.workerMaterialDebits.push({ operationId, workId: work._id, date: new Date() });
      await fabric.save(); break;
    } catch (error) { if (error.name !== 'VersionError' || attempt === 4) throw error; }
  }
}
export async function resumeTrouserStock(work, archive) {
  try {
    if (work.materialStatus === 'returning') {
      for (const operation of work.trouserStockOperations) if (operation.state !== 'failed') await changeStock(work, operation, true);
      work.cancelledAt = new Date(); archive(work, work.materialCancellation.createdBy); await work.save(); return work;
    }
    const operation = work.trouserStockOperations.find(operation => ['reserving', 'rollingBack'].includes(operation.state));
    if (!operation) return work;
    if (operation.kind === 'edit') {
      await changeEditedTrouserStock(work, operation);
      operation.state = 'committed'; work.materialStatus = 'ready'; await work.save(); return work;
    }
    if (operation.state === 'reserving') {
      try { await changeStock(work, operation, false); }
      catch (error) {
        if (!['insufficientFabric', 'materialStockUnavailable'].includes(error.message)) throw error;
        operation.state = 'rollingBack'; operation.failureCode = error.message; await work.save();
      }
      if (operation.state === 'reserving') { operation.state = 'committed'; work.materialStatus = 'ready'; await work.save(); return work; }
    }
    await changeStock(work, operation, true);
    if (operation.kind === 'assign') archive(work, operation.createdBy);
    else {
      const event = work.additions.find(event => event.requestId === operation.requestId);
      if (!event) throw new Error('Missing trouser addition');
      const ids = new Set(event.shopTrouserColorIds);
      work.shopTrouser.colors = work.shopTrouser.colors.filter(color => !ids.has(String(color.colorId)));
      work.quantity -= event.quantity; work.additions = work.additions.filter(event => event.requestId !== operation.requestId);
    }
    operation.state = 'failed'; work.materialStatus = 'ready'; await work.save(); throw fail(operation.failureCode);
  } catch (error) { if (error.status && !work.trouserStockOperations?.some(operation => operation.kind === 'edit' && operation.state === 'reserving')) throw error; throw fail('materialsPending', 503); }
}
