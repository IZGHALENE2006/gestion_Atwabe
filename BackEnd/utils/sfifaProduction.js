import { findSfifaIdentity } from "./sfifaIdentity.js";
import { productionWork, sfifaParentFor, resumeSfifaTransfer } from './sfifaWorkTransfers.js';
import { ensureSfifaStyleBalances } from "./sfifaStyleBalances.js";
import { sfifaVariantIdentity, sfifaVariantMatches } from "../../shared/sfifaStock.js";
import { workerSfifaCreditsStock } from '../../shared/workerSfifa.js';
import { workerCompletionEarning } from "../../shared/workerPayroll.js";
import SfifaStock from "../models/SfifaStock.js";
import WorkerWork from "../models/WorkerWork.js";
import { nextWorkSequence, remainingWorkQuantity, validateWorkerCompletion, workQuantityUnits } from "../../shared/workerWork.js";
import { SFIFA_STOCK_GROUP_LIMIT, SFIFA_STOCK_LIMIT, SFIFA_STOCK_SCALE, sfifaQuantityUnits } from "../../shared/sfifaStock.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const sameId = (a, b) => String(a) === String(b);
const findWork = productionWork;
const parentFor = sfifaParentFor;
const retryable = error => error.name === "VersionError" || error.code === 11000;

export async function listSfifaWork(idAdmin, workerId) {
  let stocks = await SfifaStock.find({ idAdmin, "production.workerId": workerId }).lean();
  for (const stock of stocks) for (const work of stock.production || []) if (work.relocatedAt && sameId(work.workerId, workerId)) await resumeSfifaTransfer(stock, work);
  stocks = await SfifaStock.find({ idAdmin, "production.workerId": workerId }).lean();
  return stocks.flatMap(stock => (stock.production || []).filter(work => !work.relocatedAt && !work.deletedAt && sameId(work.workerId, workerId)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)));
}

export async function findSfifaWork(scope) {
  return findWork(await parentFor(scope), scope);
}

export async function assignSfifaWork({ input, idAdmin, createdBy, workerId, requestId, fingerprint, canAssign, resolveInput }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const moving = await SfifaStock.findOne({ idAdmin, 'production.transfer.snapshot.requestId': requestId });
      const stub = moving?.production?.find(work => work.relocatedAt && work.transfer?.snapshot.requestId === requestId);
      if (stub) await resumeSfifaTransfer(moving, stub);
      const previous = await SfifaStock.findOne({ idAdmin, "production.requestId": requestId });
      if (previous) {
        const work = previous.production.find(work => work.requestId === requestId);
        if (work.deletedAt) throw fail("workDeleted", 409);
        if (work.requestFingerprint !== fingerprint) throw fail("workRequestConflict", 409);
        return { status: 200, work };
      }
      if (!canAssign) throw fail("workerSectionChanged", 409);
      const details = resolveInput ? await resolveInput() : input;
      const { width, family } = details.sfifa;
      const matched = workerSfifaCreditsStock(details) ? await findSfifaIdentity(idAdmin, details.sfifa) : null;
      let stock = await SfifaStock.findOne(matched ? { idAdmin, _id: matched.stock._id } : { idAdmin, width, family });
      if (matched) details.sfifa = { ...details.sfifa, variantId: matched.variant._id };
      if (!stock) stock = new SfifaStock({ idAdmin, createdBy, width, family, quantity: 0, unassignedQuantity: 0, variants: [] });
      if (!stock.production) stock.production = [];
      const now = new Date();
      const work = new WorkerWork({ ...details, idAdmin, createdBy, workerId, requestId, requestFingerprint: fingerprint, __v: 0, createdAt: now, updatedAt: now });
      stock.production.push(work.toObject());
      await stock.save();
      return { status: 201, work: stock.production.find(entry => sameId(entry._id, work._id)) };
    } catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === 3) throw fail("workConflict", 409);
    }
  }
}

export async function editSfifaWork({ scope, body, details, requestId, createdBy, mutate }) {
  const source = await parentFor(scope), original = findWork(source, scope);
  if (!original) throw fail('workNotFound', 404);
  if (Number(body.version) !== original.__v) throw fail('workConflict', 409);
  const matched = details.sfifa.code === undefined ? null : await findSfifaIdentity(scope.idAdmin, details.sfifa);
  const target = matched?.stock || await SfifaStock.findOne({ idAdmin: scope.idAdmin, width: details.sfifa.width, family: details.sfifa.family }) || new SfifaStock({ idAdmin: scope.idAdmin, createdBy, width: details.sfifa.width, family: details.sfifa.family, quantity: 0, unassignedQuantity: 0, variants: [] });
  if (matched) details.sfifa.variantId = matched.variant._id;
  const edited = new WorkerWork(original.toObject());
  await mutate(edited, details); edited.__v += 1; edited.updatedAt = new Date(); await edited.validate();
  const snapshot = edited.toObject();
  if (sameId(source._id, target._id)) {
    source.production[source.production.indexOf(original)] = snapshot;
    await source.save();
    return findWork(source, scope);
  }
  // Persist the entire destination before releasing the globally unique creation
  // request. A retry can finish relocation even after the process stops here.
  original.transfer = { stockId: String(target._id), width: details.sfifa.width, family: details.sfifa.family, createdBy: String(createdBy), snapshot };
  original.relocatedAt = new Date(); original.requestId = requestId;
  await source.save();
  return findWork(await resumeSfifaTransfer(source, original), scope);
}

export async function completeSfifaWork({ scope, body, requestId, quantity, createdBy, workerName }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const stock = await parentFor(scope), work = findWork(stock, scope);
      if (!work) throw fail("workNotFound", 404);
      if (work.deletedAt) throw fail("workDeleted", 409);
      if (work.additions?.some(event => event.requestId === requestId)) throw fail("workRequestConflict", 409);
      const previous = work.completions.find(event => event.requestId === requestId);
      if (previous) {
        if (previous.quantity !== quantity) throw fail("workRequestConflict", 409);
        return { status: 200, work };
      }
      const raw = body?.version, version = typeof raw === "number" ? raw : /^\d+$/.test(raw || "") ? Number(raw) : NaN;
      if (!Number.isSafeInteger(version) || version !== work.__v) throw fail("workConflict", 409);
      const remaining = remainingWorkQuantity(work);
      validateWorkerCompletion({ quantity }, remaining, "sfifa");
      if (await SfifaStock.findOne({ idAdmin: scope.idAdmin, "receipts.requestId": requestId })) throw fail("workRequestConflict", 409);
      const stockCredited = workerSfifaCreditsStock(work), { code } = work.sfifa;
      if (stockCredited) {
        if (stock.unassignedQuantity === undefined) stock.unassignedQuantity = stock.quantity;
        if (stock.variants === undefined) stock.variants = [];
        await ensureSfifaStyleBalances(stock);
        const variant = stock.variants.find(entry => work.sfifa.variantId ? sameId(entry._id, work.sfifa.variantId) : sfifaVariantMatches(stock, entry, work.sfifa));
        const units = sfifaQuantityUnits(variant?.quantity ?? 0) + sfifaQuantityUnits(quantity);
        if (units > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) throw fail("sfifaStockLimit", 409);
        if (variant) variant.quantity = units / SFIFA_STOCK_SCALE;
        else stock.variants.push({ width: work.sfifa.width, family: work.sfifa.family, code, quantity, styleMeters: { single: 0, double: 0, gradient: 0 } });
        work.sfifa.variantId = (variant || stock.variants.find(entry => sfifaVariantMatches(stock, entry, work.sfifa)))._id;
        stock.quantity = (sfifaQuantityUnits(stock.quantity, { max: SFIFA_STOCK_GROUP_LIMIT }) + sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE;
      }
      const date = new Date(), earning = workerCompletionEarning(work, quantity, date);
      work.completedQuantity = (workQuantityUnits(work.completedQuantity, "sfifa") + sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE;
      work.completions.push({ requestId, quantity, before: remaining, after: (sfifaQuantityUnits(remaining) - sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE, stockCredited, ...earning, date, createdBy, sequence: nextWorkSequence(work) });
      work.__v += 1; work.updatedAt = date;
      if (stockCredited) stock.receipts.push({ requestId, variantId: work.sfifa.variantId, ...sfifaVariantIdentity(stock, stock.variants.find(entry => sameId(entry._id, work.sfifa.variantId))), quantity, createdBy, date, workId: work._id, workerId: work.workerId, workerName });
      // One optimistic write persists completion and wages, plus stock for shop work.
      await stock.save();
      return { status: 201, work };
    } catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === 3) throw fail("workConflict", 409);
    }
  }
}

// Work changes stay in the same optimistic stock write as the embedded work.
export async function changeSfifaWork({ scope, body, replay, mutate }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const stock = await parentFor(scope), work = findWork(stock, scope);
      if (!work) throw fail("workNotFound", 404);
      if (replay(work)) return { status: 200, work };
      const raw = body?.version, version = typeof raw === "number" ? raw : /^\d+$/.test(raw || "") ? Number(raw) : NaN;
      if (!Number.isSafeInteger(version) || version !== work.__v) throw fail("workConflict", 409);
      await mutate(work);
      work.__v += 1; work.updatedAt = new Date();
      await stock.save();
      return { status: 201, work };
    } catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === 3) throw fail("workConflict", 409);
    }
  }
}
