import { randomUUID, createHash } from "node:crypto";
import TailoringWorker from "../../BackEnd/models/TailoringWorker.js";
import { jabadorWorkerFixture } from "./jabadorFixture.js";
import { query, owner } from "./djellabaCostsFixture.js";
import { validateTailoringOrder } from "../../shared/tailoring.js";
import { validateWorkerWork } from "../../shared/workerWork.js";
export function garmentWorkerFixture(t) {
  const f = jabadorWorkerFixture(t);
  t.mock.method(TailoringWorker, "find", scope => query(() => f.workers.filter(row => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || scope._id.$in.includes(String(row._id)))).map(row => row.toObject())));
  t.mock.method(TailoringWorker, "findOne", async scope => {
    const row = f.workers.find(row => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id)) && (!scope.requestId || row.requestId === scope.requestId));
    return row ? new TailoringWorker(row.toObject()) : null;
  });
  t.mock.method(TailoringWorker, "create", async input => { const row = new TailoringWorker({ ...input, __v: 0 }); await row.validate(); f.workers.push(row); return row; });
  const seedGarmentOrder = (type = "djellaba", styles = ["regular", "regular"], idAdmin = owner, extra = {}) => {
    const items = styles.map((style, index) => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: 100, fabricSource: "client", fabricType: "قطن " + index, ...(type === "trousers" ? { trouserType: style } : type === "shirts" ? { shirtType: "قميص رجالي " + index } : { sfifa: { width: "thin", style: "fabric" } }) }));
    const input = validateTailoringOrder({ garmentType: type, clientName: "زبون " + type, phone: "0612345678", orderDate: "2026-10-28", readyDate: "2026-11-10", paidAmount: 0, expenseAmount: 25, items });
    return f.seedOrder(idAdmin, { ...input, ...extra });
  };
  const seedLegacyTrouser = async (worker, body) => {
    const input = validateWorkerWork({ ...body, category: "trousers", workType: "client" }, { allowLegacyTrouserClient: true });
    const requestId = body.requestId || randomUUID(), requestFingerprint = createHash("sha256").update(JSON.stringify({ ...input, workerId: String(worker._id) })).digest("hex");
    return f.create({ ...input, requestId, requestFingerprint, idAdmin: owner, createdBy: owner, workerId: worker._id });
  };
  return { ...f, seedGarmentOrder, seedLegacyTrouser };
}
