import { randomUUID } from 'node:crypto';
import WorkerWork from '../../BackEnd/models/WorkerWork.js';
import { tailoringGarmentType } from '../../shared/tailoring.js';
import { tailoringOrderBarcode } from '../../shared/tailoringBarcode.js';
import { workerClientPreviousStage } from '../../shared/workerWork.js';

export async function seedCompletedClientStage(f, order, category, lineIds = order.items.map(item => item.lineId)) {
  const items = order.items.filter(item => lineIds.includes(item.lineId)).map(item => item.toObject ? item.toObject() : item);
  return WorkerWork.create({ idAdmin: order.idAdmin, createdBy: order.idAdmin, workerId: f.worker._id,
    category, workType: 'client', productName: order.clientName, quantity: lineIds.length, completedQuantity: lineIds.length,
    requestId: randomUUID(), requestFingerprint: 'completed-client-stage-fixture',
    tailoring: { orderId: order._id, garmentType: tailoringGarmentType(order), lineIds, items,
      clientName: order.clientName, phone: order.phone, barcode: tailoringOrderBarcode(order), orderDate: order.orderDate, readyDate: order.readyDate },
    completions: [{ quantity: lineIds.length, before: lineIds.length, after: 0, sequence: 1, requestId: randomUUID(), date: new Date(), createdBy: order.idAdmin }],
  });
}

export async function seedClientPrerequisites(f, order, category, lineIds) {
  const previous = workerClientPreviousStage(category, tailoringGarmentType(order));
  if (!previous) return;
  await seedClientPrerequisites(f, order, previous, lineIds);
  await seedCompletedClientStage(f, order, previous, lineIds);
}
