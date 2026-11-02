export const creditRound = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};
export const creditCustomer = user => ({ name: user.name || "", phone: user.phone || "", cin: user.cin || "" });
export const creditPaymentReference = (userId, payment, index) => payment.reference || (payment.id ? `RC-${payment.id.toUpperCase()}` : `RC-${String(userId).toUpperCase()}-${String(index + 1).padStart(4, "0")}`);
export const creditInvoiceReference = invoice => `CI-${invoice.id.toUpperCase()}`;

export function creditDocument(user, selection = {}) {
  const customer = creditCustomer(user);
  if (selection.kind === "payment") {
    const payment = selection.payment;
    const snapshot = payment.balanceSnapshot;
    const historical = snapshot && ["total", "paidBefore", "paidAfter", "remainingBefore", "remainingAfter"].every(key => Number.isFinite(snapshot[key]));
    return { kind: "payment", actor: payment.actor, reference: payment.reference || creditPaymentReference(user._id, payment, Math.max(0, selection.index ?? user.paymentHistory?.indexOf(payment) ?? 0)), date: payment.Date, customer: historical ? snapshot.customer : customer, amount: creditRound(payment.amount), note: payment.note || "", historical: Boolean(historical), ...(historical ? { total: snapshot.total, paidBefore: snapshot.paidBefore, paid: snapshot.paidAfter, remainingBefore: snapshot.remainingBefore, remaining: snapshot.remainingAfter } : { total: user.summary?.total ?? creditRound(user.Total), paid: user.summary?.paid ?? creditRound(user.Paye), remaining: user.summary?.remaining ?? creditRound(Math.max(user.Total - user.Paye, 0)) }) };
  }
  if (selection.kind === "invoice") {
    const invoice = user.creditInvoices?.find(entry => (selection.reference && entry.reference === selection.reference) || (selection.line?.invoiceId && entry.id === selection.line.invoiceId));
    if (invoice) return { kind: "invoice", actor: invoice.actor, reference: invoice.reference || creditInvoiceReference(invoice), date: invoice.Date, customer: invoice.customer, lines: invoice.lines || [invoice.line], total: invoice.total, paid: invoice.paid, remaining: invoice.remaining };
    if (selection.line) {
      const line = selection.line, total = creditRound(line.lineTotal ?? line.prix * line.Quantite), paid = creditRound(line.Paiement);
      return { kind: "invoice", actor: line.actor, reference: `CI-${String(user._id).toUpperCase()}-${line.id}`, date: line.Date, customer, lines: [line], total, paid, remaining: creditRound(Math.max(total - paid, 0)) };
    }
  }
  return { kind: "statement", reference: `CR-${String(user._id).toUpperCase()}`, date: selection.issuedAt || new Date().toISOString(), customer, lines: user.produit || [], total: user.summary?.total ?? creditRound(user.Total), paid: user.summary?.paid ?? creditRound(user.Paye), remaining: user.summary?.remaining ?? creditRound(Math.max(user.Total - user.Paye, 0)) };
}

// Derive the journal from immutable invoices and receipts. Reprinting or reading
// an account never changes or invents the actor on its historical records.
export function creditActivity(user) {
  const events = [{ id: "customer:" + user._id, kind: "customer", date: user.createdAt || user.Date, actor: user.createdBy }];
  for (const invoice of user.creditInvoices || []) events.push({ id: "invoice:" + invoice.id, kind: invoice.origin === "cashier" ? "sale" : "credit", date: invoice.Date, actor: invoice.actor, total: invoice.total, paid: invoice.paid, remaining: invoice.remaining, reference: invoice.reference || creditInvoiceReference(invoice) });
  for (const [index, payment] of (user.paymentHistory || []).entries()) events.push({ id: "payment:" + (payment.id || index), kind: payment.source === "initial" ? "initial" : "payment", date: payment.Date, actor: payment.actor, amount: payment.amount, note: payment.note, remaining: payment.balanceSnapshot?.remainingAfter, reference: creditPaymentReference(user._id, payment, index) });
  return events.sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
}
