import { ensureSfifaStyleBalances } from './sfifaStyleBalances.js';
import SfifaStock from '../models/SfifaStock.js';
import { resolveTailoringSfifaRows, tailoringSfifaGroups, changeTailoringSfifa, tailoringStockSnapshot, hasTailoringSfifa } from './tailoringSfifaStock.js';
import mongoose from 'mongoose';
import Fabric from '../models/Fabric.js';
import TailoringOrder from '../models/TailoringOrder.js';
import { FABRIC_LIMITS } from '../../shared/fabrics.js';
import { tailoringFabricMeters } from '../../shared/tailoring.js';
import { saveStandaloneTailoringStock } from './tailoringFabricStockStandalone.js';
export { resumeTailoringFabricStock } from './tailoringFabricStockStandalone.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a) === String(b);
const units = value => Math.round(value * 1000);

// Use a transaction when supported; standalone MongoDB uses a durable, replayable stock operation.
export async function saveTailoringFabricStock(document, { create = false, trackFabric = Boolean(document.fabricStock || document.deductFabricStock) } = {}) {
  let session;
  try {
    session = await mongoose.startSession();
    return await session.withTransaction(async () => {
      const previous = create ? null : await TailoringOrder.findOne({ _id: document._id, idAdmin: document.idAdmin }).session(session);
      if (!create && (!previous || previous.__v !== document.__v)) throw fail('conflict');
      const before = previous?.fabricStock?.returnedAt ? [] : previous?.fabricStock?.rows || [];
      const order = create ? new TailoringOrder(document) : previous;
      if (!create) order.set(document.toObject());
      const fabrics = new Map();
      const fabricFor = async id => {
        if (!fabrics.has(String(id))) fabrics.set(String(id), await Fabric.findOne({ _id: id, idAdmin: order.idAdmin }).session(session));
        const fabric = fabrics.get(String(id));
        if (!fabric) throw fail('fabricStockUnavailable');
        return fabric;
      };
      const after = [];
      if (trackFabric && !order.cancelledAt) for (const [index, item] of (order.items || []).entries()) {
        if (item.fabricSource !== 'shop') continue;
        if (tailoringFabricMeters(item.fabricMeters) === null || !mongoose.isObjectIdOrHexString(item.fabricPieceId)) throw Object.assign(fail('invalidOrder', 400), { fields: { ['items.' + index + '.fabricPieceId']: 'chooseFabricPiece' } });
        const fabric = await fabricFor(item.fabricId), color = fabric.colors.find(row => same(row._id, item.colorId));
        const piece = color?.pieces.find(row => same(row._id, item.fabricPieceId));
        if (!piece) throw fail('fabricStockUnavailable');
        item.fabricPieceBarcode = piece.barcode;
        after.push({ fabricId: fabric._id, colorId: color._id, pieceId: piece._id, barcode: piece.barcode, meters: item.fabricMeters });
      }
      if (order.cancelledAt && order.deliveredAt) after.push(...before);
      const beforeSfifa = previous?.sfifaStock?.returnedAt ? [] : previous?.sfifaStock?.rows || [];
      const resolved = order.cancelledAt ? { rows: order.deliveredAt ? beforeSfifa : [], stocks: new Map() } : await resolveTailoringSfifaRows(order, session);
      const sfifaGroups = tailoringSfifaGroups(beforeSfifa, resolved.rows);
      for (const group of sfifaGroups) {
        const stock = resolved.stocks.get(group.id) || await SfifaStock.findOne({ _id: group.id, idAdmin: order.idAdmin }).session(session);
        if (!stock) throw fail('sfifaStockUnavailable');
        await ensureSfifaStyleBalances(stock, session);
        changeTailoringSfifa(stock, group);
        const active = new Set((stock.tailoringOrderIds || []).map(String));
        if (resolved.rows.some(row => same(row.stockId, group.id))) active.add(String(order._id)); else active.delete(String(order._id));
        stock.tailoringOrderIds = [...active];
        await stock.save({ session });
      }
      if (hasTailoringSfifa(order)) order.sfifaStock = tailoringStockSnapshot(order, beforeSfifa, resolved.rows);
      const changes = new Map();
      for (const [rows, sign] of [[before, 1], [after, -1]]) for (const row of rows) {
        const key = [row.fabricId, row.colorId, row.pieceId].join(':');
        const change = changes.get(key) || { row, delta: 0 };
        change.delta += sign * units(row.meters); changes.set(key, change);
      }
      const dirty = new Set();
      for (const { row, delta } of changes.values()) {
        if (!delta) continue;
        const fabric = await fabricFor(row.fabricId), piece = fabric.colors.find(color => same(color._id, row.colorId))?.pieces.find(piece => same(piece._id, row.pieceId));
        if (!piece || piece.barcode !== row.barcode) throw fail('fabricStockUnavailable');
        const remaining = units(piece.meters) + delta;
        if (remaining < 0) throw fail('insufficientFabricStock');
        if (remaining > units(FABRIC_LIMITS.meters)) throw fail('fabricStockReturnLimit');
        piece.meters = remaining / 1000; dirty.add(String(fabric._id));
      }
      if (trackFabric) order.fabricStock = tailoringStockSnapshot(order, before, after);
      await order.validate();
      for (const id of [...dirty].sort()) {
        const fabric = fabrics.get(id);
        const active = new Set((fabric.tailoringOrderIds || []).map(String));
        if (after.some(row => same(row.fabricId, id))) active.add(String(order._id));
        else active.delete(String(order._id));
        fabric.tailoringOrderIds = [...active];
        await fabric.save({ session });
      }
      if (create) return (await TailoringOrder.create([order.toObject()], { session }))[0];
      return order.save({ session });
    });
  } catch (error) {
    if (error.code === 20 || /Transaction numbers are only allowed|does not support retryable writes/i.test(error.message)) return saveStandaloneTailoringStock(document, { create, trackFabric });
    if (error.status || error.name === 'VersionError' || error.code === 11000) throw error;
    // Other database failures leave the transaction rolled back.
    throw fail('fabricStockUnavailable', 503);
  } finally { if (session) await session.endSession(); }
}

export async function protectTailoringFabricDeletion(fabric, removedIds) {
  if (!fabric.tailoringOrderIds?.length) return;
  const orders = await TailoringOrder.find({ idAdmin: fabric.idAdmin, _id: { $in: fabric.tailoringOrderIds } }).lean();
  if (orders.some(order => !order.cancelledAt && [...(order.fabricStock?.returnedAt ? [] : order.fabricStock?.rows || []), ...(order.stockOperation?.rows || []), ...(order.stockOperation?.beforeRows || [])].some(row => same(row.fabricId, fabric._id) && (!removedIds || removedIds.has(String(row.pieceId)))))) throw fail('tailoringFabricInUse');
}
