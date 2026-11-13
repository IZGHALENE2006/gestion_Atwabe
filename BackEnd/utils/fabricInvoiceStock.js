import Fabric from '../models/Fabric.js';
import { fabricInvoiceFailure as fail } from '../../shared/fabricInvoices.js';
const same = (a, b) => String(a) === String(b);
const units = value => Math.round(value * 1000);
export async function changeInvoiceFabric(operation, fabricId, mode) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const fabric = await Fabric.findOne({ _id: fabricId, idAdmin: operation.idAdmin });
    if (!fabric) throw fail('notFound', 409);
    let debit = fabric.invoiceDebits?.find(row => same(row.invoiceId, operation._id));
    if (mode === 'reserve' && debit && !debit.returnedAt || mode === 'return' && (!debit || debit.returnedAt) || mode === 'record' && debit?.recordedAt) return;
    const lines = operation.plan.lines.filter(line => same(line.fabricId, fabricId));
    if (mode === 'reserve') {
      if (debit?.returnedAt) throw fail('invoiceCancelled', 409);
      const rows = lines.map(line => {
        const piece = fabric.colors.id(line.colorId)?.pieces.id(line.pieceId);
        if (!piece || piece.barcode !== line.barcode) throw fail('notFound', 409);
        if (units(piece.meters) < units(line.meters)) throw fail('insufficientMeters', 409);
        const beforeMeters = piece.meters; piece.meters = (units(piece.meters) - units(line.meters)) / 1000;
        return { pieceId: piece._id, colorId: line.colorId, barcode: line.barcode, meters: line.meters, beforeMeters, remainingMeters: piece.meters };
      });
      fabric.invoiceDebits ??= []; fabric.invoiceDebits.push({ invoiceId: operation._id, rows });
    } else if (mode === 'return') {
      if (debit.recordedAt) throw fail('invoicePending', 503);
      for (const row of debit.rows) {
        const piece = fabric.colors.id(row.colorId)?.pieces.id(row.pieceId);
        if (!piece || piece.barcode !== row.barcode || units(piece.meters) + units(row.meters) > 1000000000) throw fail('invoicePending', 503);
        piece.meters = (units(piece.meters) + units(row.meters)) / 1000;
      }
      debit.returnedAt = new Date();
    } else {
      if (!debit || debit.returnedAt) throw fail('invoicePending', 503);
      for (const line of lines) {
        const row = debit.rows.find(row => same(row.pieceId, line.pieceId));
        fabric.movements.push({ _id: line.movementId, idAdmin: operation.idAdmin, createdBy: operation.plan.actor.id, fabricId, colorId: line.colorId, pieceId: line.pieceId,
          requestId: String(operation._id) + ':' + line.pieceId, type: line.type, reference: line.reference, color: line.color, colorNumber: line.colorNumber, barcode: line.barcode,
          beforeMeters: row.beforeMeters, meters: line.meters, remainingMeters: row.remainingMeters, occurredAt: operation.plan.date,
          sale: { ...line.sale, invoiceId: operation._id, requestFingerprint: operation.fingerprint, clientName: operation.plan.customer.name, createdByName: operation.plan.actor.name, createdByRole: operation.plan.actor.role } });
      }
      debit.recordedAt = new Date();
    }
    try { await fabric.save(); return; } catch (error) { if (error.name !== 'VersionError' || attempt === 4) throw error; }
  }
}
export function protectPendingFabricInvoice(fabric) {
  if (fabric.invoiceDebits?.some(row => !row.recordedAt && !row.returnedAt)) throw fail('invoicePending', 409);
}
