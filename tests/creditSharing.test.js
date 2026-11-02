import test from "node:test";
import assert from "node:assert/strict";
import { creditDocument } from "../shared/creditDocuments.js";
import { creditWhatsAppNumber, creditWhatsAppUrl, creditEmailAddress, creditEmailUrl, creditStatementFilename, canShareCreditFile } from "../shared/creditSharing.js";

test("saved Moroccan and international contact numbers open the intended WhatsApp chat", () => {
  for (const phone of ["0612345678", "06 12 34 56 78", "+212 612-345-678", "00212 (612) 345678", "٠٦١٢٣٤٥٦٧٨", "۰۶۱۲۳۴۵۶۷۸"]) assert.equal(creditWhatsAppNumber(phone), "212612345678");
  assert.equal(creditWhatsAppNumber("+33 6 12 34 56 78"), "33612345678");
  const message = "مرحبًا فاطمة & أحمد\nالمتبقي: 250.00 درهم #1";
  const url = new URL(creditWhatsAppUrl("0612345678", message));
  assert.equal(url.origin, "https://wa.me"); assert.equal(url.pathname, "/212612345678"); assert.equal(url.searchParams.get("text"), message);
  assert.equal([...url.searchParams].length, 1);
});

test("missing, malformed or injected phone numbers cannot become share destinations", () => {
  for (const phone of ["", null, "123", "06123", "phone 0612345678", "0612345678?text=other", "javascript:alert(1)", "0612345678+", "1234567890123456", "0000000000"]) { assert.equal(creditWhatsAppNumber(phone), "", String(phone)); assert.equal(creditWhatsAppUrl(phone, "test"), ""); }
});

test("email drafts preserve one saved recipient and encode subjects and message content", () => {
  const email = "client+facture@example.ma", subject = "كشف الدَّين & numéro #2", body = "Bonjour & مرحبًا\nTotal: 300\nPayé: 50";
  assert.equal(creditEmailAddress("  " + email + " "), email);
  const url = new URL(creditEmailUrl(email, subject, body));
  assert.equal(url.protocol, "mailto:"); assert.equal(decodeURIComponent(url.pathname), email);
  assert.equal(url.searchParams.get("subject"), subject); assert.equal(url.searchParams.get("body"), body.replace(/\n/g, "\r\n"));
  assert.equal([...url.searchParams].length, 2); assert.equal(url.searchParams.has("attachment"), false);
});

test("email sharing rejects header injection, multiple recipients and invalid saved addresses", () => {
  for (const email of ["", undefined, "client", "a@b", "a@example.ma,b@example.ma", "a@example.ma;evil@example.ma", "a@example.ma\r\nBcc:evil@example.ma", "a@example.ma?bcc=evil@example.ma", "mailto:a@example.ma", "a@ example.ma"]) { assert.equal(creditEmailAddress(email), "", String(email)); assert.equal(creditEmailUrl(email, "s", "b"), ""); }
});

test("statement uses current debt totals and excludes unrelated account fields", () => {
  const user = { _id: "customer1", name: "زبون", phone: "0612345678", email: "c@example.ma", Total: 500, Paye: 150, summary: { total: 480, paid: 175, remaining: 305 }, produit: [{ nom: "قميص", prix: 240, Quantite: 2, lineTotal: 480 }], password: "secret", owner: "private", creditInvoices: [{ total: 999 }] };
  const data = creditDocument(user, { kind: "statement", issuedAt: "2026-11-02T10:00:00Z" });
  assert.deepEqual([data.total, data.paid, data.remaining], [480, 175, 305]); assert.equal(data.lines[0].nom, "قميص");
  assert.equal(data.password, undefined); assert.equal(data.owner, undefined); assert.equal(data.creditInvoices, undefined);
  assert.equal(creditStatementFilename(data.reference), "credit_CR-CUSTOMER1.pdf");
  assert.doesNotMatch(creditStatementFilename("../../bad/path?doc\n"), /\.\.\/|\n|\?/);
});

test("native file sharing is offered only when the device accepts the prepared PDF", () => {
  const file = { name: "statement.pdf", type: "application/pdf" };
  assert.equal(canShareCreditFile({}, file), false);
  assert.equal(canShareCreditFile({ share() {} }, file), false);
  assert.equal(canShareCreditFile({ share() {}, canShare: () => false }, file), false);
  assert.equal(canShareCreditFile({ share() {}, canShare() { throw new Error("Policy denied"); } }, file), false);
  assert.equal(canShareCreditFile({ share() {}, canShare: data => data.files[0] === file }, file), true);
  assert.equal(canShareCreditFile({ share() {}, canShare: () => true }, null), false);
});
