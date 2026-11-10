import { tailoringOrderBarcode } from './tailoringBarcode.js';

// These sales live in the order itself, so a failed order save or a replay can
// never create an orphan profit entry. Client-supplied cloth creates no sale.
export function tailoringFabricProfitMovements(orders) {
  return orders.filter(order => !order.stockOperation).flatMap(order => (order.deliveredAt && order.deliveryFabricItems ? order.deliveryFabricItems : order.items || []).flatMap((item, index) => {
    const snapshot = item.fabricSale, costs = item.costs || item.fabricCost;
    if (!snapshot || item.fabricSource !== 'shop' || !costs) return [];
    return [{
      _id: 'TF-' + String(order._id) + '-' + item.lineId,
      source: 'tailoring', sourceOrderId: String(order._id), sourceOrderBarcode: tailoringOrderBarcode(order), sourceLineId: item.lineId, sourceLineNumber: index + 1,
      sourceGarmentType: order.garmentType || 'djellaba', ...(order.cancelledAt ? { cancelledAt: order.cancelledAt } : {}),
      createdBy: snapshot.createdBy, type: item.fabricType, reference: item.fabricReference || '', color: item.fabricColor || '', colorNumber: '',
      barcode: '', meters: item.fabricMeters, beforeMeters: null, remainingMeters: null, occurredAt: snapshot.occurredAt,
      sale: { pricingMode: 'retail', unitPrice: costs.fabricUnitPrice, subtotal: costs.fabricAmount,
        discountType: 'percent', discountValue: 0, discountAmount: 0, total: costs.fabricAmount, clientName: order.clientName,
        createdByName: snapshot.createdByName, createdByRole: snapshot.createdByRole,
        ...(snapshot.purchaseUnitPrice === undefined ? {} : { purchaseUnitPrice: snapshot.purchaseUnitPrice, costAmount: snapshot.costAmount, profitAmount: snapshot.profitAmount }) },
    }];
  }));
}
