import SfifaStock from '../models/SfifaStock.js';
const same = (a, b) => String(a) === String(b);
export const productionWork = (stock, scope) => {
  const rows = stock?.production?.filter(work => same(work._id, scope._id) && same(work.workerId, scope.workerId)) || [];
  return rows.find(work => !work.relocatedAt) || rows.at(-1);
};
export async function resumeSfifaTransfer(source, stub, visited = new Set()) {
  const transfer = stub.transfer, key = `${source._id}:${transfer.stockId}:${transfer.snapshot.__v}`;
  if (visited.has(key)) throw Object.assign(new Error('workEditPending'), { status: 503 });
  visited.add(key);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      let target = await SfifaStock.findOne({ idAdmin: source.idAdmin, _id: transfer.stockId });
      if (!target) target = new SfifaStock({ _id: transfer.stockId, idAdmin: source.idAdmin, createdBy: transfer.createdBy, width: transfer.width, family: transfer.family, quantity: 0, unassignedQuantity: 0, variants: [] });
      const existing = productionWork(target, transfer.snapshot);
      if (existing && !existing.relocatedAt) return target;
      if (existing?.relocatedAt && existing.transfer.snapshot.__v >= transfer.snapshot.__v) return resumeSfifaTransfer(target, existing, visited);
      target.production ||= [];
      target.production.push(transfer.snapshot);
      await target.save();
      return target;
    } catch (error) {
      if ((error.name !== 'VersionError' && error.code !== 11000) || attempt === 4) throw Object.assign(new Error('workEditPending'), { status: 503 });
      // If another request created the destination group, redirect the durable intent.
      const group = await SfifaStock.findOne({ idAdmin: source.idAdmin, width: transfer.width, family: transfer.family });
      if (group && !same(group._id, transfer.stockId)) {
        const fresh = await SfifaStock.findOne({ _id: source._id, idAdmin: source.idAdmin });
        const current = productionWork(fresh, { _id: stub._id, workerId: stub.workerId });
        current.transfer.stockId = String(group._id); current.markModified('transfer'); await fresh.save();
        return resumeSfifaTransfer(fresh, current);
      }
    }
  }
}
export async function sfifaParentFor(scope) {
  let stock = await SfifaStock.findOne({ idAdmin: scope.idAdmin, 'production._id': scope._id });
  const work = productionWork(stock, scope);
  if (work?.relocatedAt && work.transfer) stock = await resumeSfifaTransfer(stock, work);
  return stock;
}
