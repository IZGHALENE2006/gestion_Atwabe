import { ensureSfifaStyleBalances } from './sfifaStyleBalances.js';
import SfifaStock from '../models/SfifaStock.js';
import { resolveTailoringSfifaRows, tailoringSfifaGroups, changeTailoringSfifa, applyStandaloneSfifaGroup, tailoringStockSnapshot, hasTailoringSfifa } from './tailoringSfifaStock.js';
import mongoose from 'mongoose';
import Fabric from '../models/Fabric.js';
import TailoringOrder from '../models/TailoringOrder.js';
import { FABRIC_LIMITS } from '../../shared/fabrics.js';
import { tailoringFabricMeters } from '../../shared/tailoring.js';
import { deleteTailoringPhoto } from './tailoringPhotos.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a) === String(b);
const units = value => Math.round(value * 1000);
const plain = value => value.toObject ? value.toObject() : value;
const photos = order => new Set([order?.photo, ...(order?.items || []).map(row => row.photo)].filter(Boolean));
const cleanup = async (from, retained) => { const keep = photos(retained); await Promise.all([...photos(from)].filter(name => !keep.has(name)).map(deleteTailoringPhoto)); };

function groupsFor(before, after) {
  const groups = new Map();
  for (const [rows, sign] of [[before, 1], [after, -1]]) for (const row of rows) {
    const id = String(row.fabricId);
    if (!groups.has(id)) groups.set(id, new Map());
    const key = String(row.colorId) + ':' + row.pieceId;
    const entry = groups.get(id).get(key) || { ...plain(row), delta: 0 };
    entry.delta += sign * units(row.meters); groups.get(id).set(key, entry);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, entries]) => ({ id, rows: [...entries.values()].filter(row => row.delta) })).filter(group => group.rows.length);
}
function change(fabric, group, reverse = false) {
  for (const row of group.rows) {
    const piece = fabric.colors.find(color => same(color._id, row.colorId))?.pieces.find(piece => same(piece._id, row.pieceId));
    if (!piece || piece.barcode !== row.barcode) throw fail('fabricStockUnavailable');
    const remaining = units(piece.meters) + row.delta * (reverse ? -1 : 1);
    if (remaining < 0) throw fail('insufficientFabricStock');
    if (remaining > units(FABRIC_LIMITS.meters)) throw fail('fabricStockReturnLimit');
    piece.meters = remaining / 1000;
  }
}
async function applyGroup(order, operation, group, reverse = false) {
  if (group.kind === "sfifa") return applyStandaloneSfifaGroup(order, operation, group, reverse);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fabric = await Fabric.findOne({ _id: group.id, idAdmin: order.idAdmin });
      if (!fabric) { if (reverse) return; throw fail('fabricStockUnavailable'); }
      const marker = fabric.tailoringStockOperations?.find(row => row.operationId === operation.id);
      if (reverse && (!marker || marker.returnedAt)) return;
      if (!reverse && marker) { if (marker.returnedAt) throw fail('conflict'); return; }
      change(fabric, group, reverse);
      if (reverse) marker.returnedAt = new Date();
      else { fabric.tailoringStockOperations ||= []; fabric.tailoringStockOperations.push({ operationId: operation.id, orderId: order._id, date: new Date() }); }
      if (!(fabric.tailoringOrderIds || []).some(id => same(id, order._id))) { fabric.tailoringOrderIds ||= []; fabric.tailoringOrderIds.push(order._id); }
      // The roll amount and replay marker share the same optimistic document write.
      await fabric.save(); return;
    } catch (error) { if (error.name !== 'VersionError') throw error; }
  }
  throw fail('fabricStockUnavailable', 503);
}

export async function resumeTailoringFabricStock(order) {
  if (!order?.stockOperation) return order;
  let persisted = true;
  try {
    const operation = order.stockOperation, groups = [...groupsFor(operation.beforeRows, operation.rows), ...tailoringSfifaGroups(operation.beforeSfifaRows, operation.sfifaRows)];
    if (operation.phase === 'applying') {
      try { for (const group of groups) await applyGroup(order, operation, group); }
      catch (error) {
        if (!['insufficientFabricStock', 'fabricStockReturnLimit', 'fabricStockUnavailable', 'insufficientSfifaStock', 'sfifaStockReturnLimit', 'sfifaStockUnavailable'].includes(error.message) || error.status === 503) throw error;
        operation.phase = 'rollingBack'; operation.failureCode = error.message;
        order.markModified('stockOperation'); await order.save();
      }
      if (operation.phase === 'applying') {
        if (operation.kind === 'update') order.set(operation.next);
        if (operation.trackFabric !== false) order.fabricStock = tailoringStockSnapshot(order, operation.beforeRows, operation.rows);
        if (operation.trackSfifa) order.sfifaStock = tailoringStockSnapshot(order, operation.beforeSfifaRows, operation.sfifaRows);
        order.stockOperation = undefined;
        await order.save();
        if (operation.kind === 'update') await cleanup(operation.previousPhotos, order);
        return order;
      }
    }
    for (const group of groups) await applyGroup(order, operation, group, true);
    if (operation.kind === 'create') {
      const result = await TailoringOrder.deleteOne({ _id: order._id, idAdmin: order.idAdmin, __v: order.__v });
      if (result.deletedCount !== 1) throw fail('conflict');
      await cleanup(order, null);
    } else {
      order.stockOperation = undefined; await order.save(); await cleanup(operation.next, order);
    }
    persisted = false;
    throw fail(operation.failureCode);
  } catch (error) {
    if (!persisted) throw error;
    throw Object.assign(fail('fabricStockUnavailable', 503), { tailoringStockPersisted: true });
  }
}

export async function saveStandaloneTailoringStock(document, { create = false, trackFabric = Boolean(document.fabricStock || document.deductFabricStock) } = {}) {
  let order = create ? new TailoringOrder(document) : await TailoringOrder.findOne({ _id: document._id, idAdmin: document.idAdmin });
  if (!create && (!order || order.__v !== document.__v || order.stockOperation)) throw fail('conflict');
  const beforeRows = order.fabricStock?.returnedAt ? [] : order.fabricStock?.rows?.map(plain) || [];
  const candidate = create ? order : new TailoringOrder(document.toObject());
  const rows = [], fabrics = new Map();
  if (trackFabric && !candidate.cancelledAt) for (const [index, item] of (candidate.items || []).entries()) {
    if (item.fabricSource !== 'shop') continue;
    if (tailoringFabricMeters(item.fabricMeters) === null || !mongoose.isObjectIdOrHexString(item.fabricPieceId)) throw Object.assign(fail('invalidOrder', 400), { fields: { ['items.' + index + '.fabricPieceId']: 'chooseFabricPiece' } });
    const id = String(item.fabricId);
    if (!fabrics.has(id)) fabrics.set(id, await Fabric.findOne({ _id: item.fabricId, idAdmin: order.idAdmin }));
    const fabric = fabrics.get(id), color = fabric?.colors.find(row => same(row._id, item.colorId));
    const piece = color?.pieces.find(row => same(row._id, item.fabricPieceId));
    if (!piece) throw fail('fabricStockUnavailable');
    item.fabricPieceBarcode = piece.barcode;
    rows.push({ fabricId: fabric._id, colorId: color._id, pieceId: piece._id, barcode: piece.barcode, meters: item.fabricMeters });
  }
  if (candidate.cancelledAt && candidate.deliveredAt) rows.push(...beforeRows);
  const beforeSfifaRows = order.sfifaStock?.returnedAt ? [] : order.sfifaStock?.rows?.map(plain) || [];
  const sfifa = candidate.cancelledAt ? { rows: candidate.deliveredAt ? beforeSfifaRows : [], stocks: new Map() } : await resolveTailoringSfifaRows(candidate);
  for (const group of tailoringSfifaGroups(beforeSfifaRows, sfifa.rows)) {
    const stock = sfifa.stocks.get(group.id) || await SfifaStock.findOne({ _id: group.id, idAdmin: order.idAdmin });
    if (!stock) throw fail('sfifaStockUnavailable');
    await ensureSfifaStyleBalances(stock);
    changeTailoringSfifa(stock, group);
  }
  // Preflight before persisting intent; the actual write repeats the availability check.
  for (const group of groupsFor(beforeRows, rows)) {
    const fabric = fabrics.get(group.id) || await Fabric.findOne({ _id: group.id, idAdmin: order.idAdmin });
    if (!fabric) throw fail('fabricStockUnavailable');
    change(fabric, group);
  }
  const next = candidate.toObject();
  for (const key of ['_id', '__v', 'idAdmin', 'createdAt', 'updatedAt', 'stockOperation']) delete next[key];
  const previousPhotos = { photo: order.photo, items: order.items?.map(item => ({ photo: item.photo })) };
  const operation = { id: new mongoose.Types.ObjectId().toString(), kind: create ? 'create' : 'update', phase: 'applying', beforeRows, rows, trackFabric, trackSfifa: hasTailoringSfifa(candidate), beforeSfifaRows, sfifaRows: sfifa.rows, ...(create ? {} : { next, previousPhotos }) };
  try {
    if (create) { if (trackFabric) order.fabricStock = { version: 1, rows: [] }; if (operation.trackSfifa) order.sfifaStock = { version: 1, rows: [] }; order.stockOperation = operation; order = await TailoringOrder.create(order.toObject()); }
    else { order.stockOperation = operation; await order.save(); }
  } catch (error) {
    if (error.code === 11000 || error.name === 'VersionError') throw error;
    throw Object.assign(fail('fabricStockUnavailable', 503), { tailoringStockPersisted: true });
  }
  return resumeTailoringFabricStock(order);
}
