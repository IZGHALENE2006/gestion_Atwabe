// Allocate account payments once: a named invoice first, otherwise oldest debt first.
// Reading a balance never rewrites immutable invoice or receipt snapshots.
export function creditInvoiceBalances(user) {
  const cents = value => Math.round(Number(value || 0) * 100), groups = new Map();
  for (const line of user.produit || []) {
    const id = line.invoiceId || 'legacy:' + line.id;
    const group = groups.get(id) || { id, date: line.Date, remaining: 0, payments: [] };
    group.remaining += Math.max(0, cents(line.lineTotal ?? line.prix * line.Quantite) - cents(line.Paiement)); groups.set(id, group);
  }
  const ordered = [...groups.values()].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0) || a.id.localeCompare(b.id));
  const payments = [...(user.paymentHistory || [])].filter(payment => payment.source !== 'initial').sort((a, b) => new Date(a.Date) - new Date(b.Date));
  const initial = (user.produit || []).reduce((sum, line) => sum + cents(line.Paiement), 0);
  let budget = Math.max(0, cents(user.Paye) - initial);
  const allocate = (amount, payment) => {
    amount = Math.min(amount, budget);
    const targets = payment?.invoiceId ? ordered.filter(group => group.id === payment.invoiceId) : ordered.filter(group => !payment || new Date(group.date || 0) <= new Date(payment.Date));
    for (const group of targets) { const used = Math.min(amount, group.remaining); group.remaining -= used; amount -= used; budget -= used; if (used && payment) group.payments.push({ ...(typeof payment.toObject === "function" ? payment.toObject() : payment), allocatedAmount: used / 100 }); if (!amount) break; }
  };
  // Honor named invoice payments before allocating the account's general payments.
  for (const payment of payments.filter(payment => payment.invoiceId)) allocate(cents(payment.amount), payment);
  const general = payments.filter(payment => !payment.invoiceId);
  allocate(Math.max(0, budget - general.reduce((sum, payment) => sum + cents(payment.amount), 0)));
  for (const payment of general) allocate(cents(payment.amount), payment);
  return new Map(ordered.map(group => [group.id, { remaining: group.remaining / 100, payments: group.payments.sort((a, b) => new Date(a.Date) - new Date(b.Date)) }]));
}
