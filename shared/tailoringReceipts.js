import { tailoringGarmentType, tailoringOrderItems, tailoringMoneyCents, tailoringRemainingAmount } from './tailoring.js';
import { tailoringOrderBarcode } from './tailoringBarcode.js';

// Customer receipts use a strict allowlist. Never copy photos, costs, profits,
// stock identifiers or the complete order into a printable document.
export function publicTailoringReceipt(receipt) {
  return {
    kind: receipt.kind, reference: receipt.reference, orderBarcode: receipt.orderBarcode,
    issuedAt: receipt.issuedAt, historical: receipt.historical === true,
    garmentType: receipt.garmentType, clientName: receipt.clientName, phone: receipt.phone,
    orderDate: receipt.orderDate, readyDate: receipt.readyDate,
    totalPrice: receipt.totalPrice, paidAmount: receipt.paidAmount, remainingAmount: receipt.remainingAmount,
    ...(receipt.kind === 'payment' ? { paymentAmount: receipt.paymentAmount } : {}),
    items: receipt.items.map((item, index) => ({
      number: index + 1, price: item.price, fabricSource: item.fabricSource,
      fabricType: item.fabricType, fabricReference: item.fabricReference || '', fabricColor: item.fabricColor || '',
      ...(item.fabricMeters !== undefined ? { fabricMeters: item.fabricMeters } : {}),
      ...(item.trouserType ? { trouserType: item.trouserType } : {}),
      ...(item.shirtType ? { shirtType: item.shirtType } : {}),
      ...(item.sfifa ? { sfifa: { width: item.sfifa.width, style: item.sfifa.style, color1: item.sfifa.color1 || '', color2: item.sfifa.color2 || '' } } : {}),
    })),
  };
}

export function createTailoringReceipt(order, { kind = 'order', reference, issuedAt = order.createdAt || order.orderDate, paymentAmount, historical = true } = {}) {
  const barcode = tailoringOrderBarcode(order);
  const totalPrice = (tailoringMoneyCents(order.totalPrice ?? 0) ?? 0) / 100;
  const paidAmount = (tailoringMoneyCents(order.paidAmount ?? 0) ?? 0) / 100;
  return publicTailoringReceipt({
    kind, reference: reference || barcode + '-O', orderBarcode: barcode, issuedAt, historical,
    garmentType: tailoringGarmentType(order), clientName: order.clientName, phone: order.phone,
    orderDate: order.orderDate, readyDate: order.readyDate,
    totalPrice, paidAmount, remainingAmount: tailoringRemainingAmount(totalPrice, paidAmount), paymentAmount,
    items: tailoringOrderItems(order),
  });
}

export const tailoringPaymentReference = (order, index) => tailoringOrderBarcode(order) + '-P' + String(index + 1).padStart(3, '0');
export const tailoringOrderReceipt = order => order.customerReceipt
  ? publicTailoringReceipt(order.customerReceipt)
  : createTailoringReceipt(order, { historical: false });
export const tailoringPaymentReceipt = (order, payment) => payment.document
  ? publicTailoringReceipt(payment.document)
  : createTailoringReceipt(order, { kind: 'payment', reference: payment.reference, issuedAt: payment.paidAt, paymentAmount: payment.amount, historical: false });
