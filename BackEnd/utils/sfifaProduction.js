import SfifaStock from "../models/SfifaStock.js";
import WorkerWork from "../models/WorkerWork.js";
import { nextWorkSequence, remainingWorkQuantity, validateWorkerCompletion, workQuantityUnits } from "../../shared/workerWork.js";
import { SFIFA_STOCK_GROUP_LIMIT, SFIFA_STOCK_LIMIT, SFIFA_STOCK_SCALE, sfifaQuantityUnits } from "../../shared/sfifaStock.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const sameId = (a, b) => String(a) === String(b);
const findWork = (stock, scope) => stock?.production?.find(work => sameId(work._id, scope._id) && sameId(work.workerId, scope.workerId));
const parentFor = scope => SfifaStock.findOne({ idAdmin: scope.idAdmin, "production._id": scope._id });
const retryable = error => error.name === "VersionError" || error.code === 11000;

export async function listSfifaWork(idAdmin, workerId) {
  const stocks = await SfifaStock.find({ idAdmin, "production.workerId": workerId }).lean();
  return stocks.flatMap(stock => (stock.production || []).filter(work => !work.deletedAt && sameId(work.workerId, workerId)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)));
}

export async function findSfifaWork(scope) {
  return findWork(await parentFor(scope), scope);
}

export async function assignSfifaWork({ input, idAdmin, createdBy, workerId, requestId, fingerprint, canAssign, resolveInput }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
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
      let stock = await SfifaStock.findOne({ idAdmin, width, family });
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
      if (stock.unassignedQuantity === undefined) stock.unassignedQuantity = stock.quantity;
      if (stock.variants === undefined) stock.variants = [];
      const { code } = work.sfifa, variant = stock.variants.find(entry => entry.code === code);
      const units = sfifaQuantityUnits(variant?.quantity ?? 0) + sfifaQuantityUnits(quantity);
      if (units > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) throw fail("sfifaStockLimit", 409);
      if (variant) variant.quantity = units / SFIFA_STOCK_SCALE;
      else stock.variants.push({ code, quantity });
      stock.quantity = (sfifaQuantityUnits(stock.quantity, { max: SFIFA_STOCK_GROUP_LIMIT }) + sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE;
      const date = new Date();
      work.completedQuantity = (workQuantityUnits(work.completedQuantity, "sfifa") + sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE;
      work.completions.push({ requestId, quantity, before: remaining, after: (sfifaQuantityUnits(remaining) - sfifaQuantityUnits(quantity)) / SFIFA_STOCK_SCALE, date, createdBy, sequence: nextWorkSequence(work) });
      work.__v += 1; work.updatedAt = date;
      stock.receipts.push({ requestId, code, quantity, createdBy, date, workId: work._id, workerId: work.workerId, workerName });
      // One optimistic write persists the work, history, receipt and stock together.
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
