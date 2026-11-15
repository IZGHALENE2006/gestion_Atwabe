import Fabric from '../models/Fabric.js';
import { FABRIC_LIMITS } from '../../shared/fabrics.js';
import { trouserMeterUnits } from '../../shared/workerShopTrousers.js';

const same = (a, b) => String(a) === String(b);
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function resolveTrouserStock(shopTrouser, colorIds, idAdmin) {
  const fabric = await Fabric.findOne({ _id: shopTrouser.fabricId, idAdmin });
  if (!fabric) throw fail('materialStockUnavailable');
  const rows = [], required = trouserMeterUnits(shopTrouser.metersPerPiece);
  for (const colorId of colorIds) {
    const color = fabric.colors.find(color => same(color._id, colorId));
    if (!color) throw fail('materialStockUnavailable');
    let remaining = required;
    // Consume the color's existing rolls in their stored order; a color may span rolls.
    for (const piece of color.pieces) {
      const take = Math.min(remaining, trouserMeterUnits(piece.meters));
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
      const fabric = await Fabric.findOne({ _id: work.shopTrouser.fabricId, idAdmin: work.idAdmin });
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
export async function resumeTrouserStock(work, archive) {
  try {
    if (work.materialStatus === 'returning') {
      for (const operation of work.trouserStockOperations) if (operation.state !== 'failed') await changeStock(work, operation, true);
      work.cancelledAt = new Date(); archive(work, work.materialCancellation.createdBy); await work.save(); return work;
    }
    const operation = work.trouserStockOperations.find(operation => ['reserving', 'rollingBack'].includes(operation.state));
    if (!operation) return work;
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
  } catch (error) { if (error.status) throw error; throw fail('materialsPending', 503); }
}
