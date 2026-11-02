import { creditCheckoutFixture } from './helpers/creditCheckoutFixture.js';
import { summarizeSales } from "../shared/salesRevenue.js";
import test from "node:test";
import assert from "node:assert/strict";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import ProductModel from "../BackEnd/models/productModel.js";
import { AddVente } from "../BackEnd/controlles/Ventes.js";
import { roundMoney } from "../shared/saleTotals.js";
import { resolveProductFees } from "../shared/productFees.js";
import { PAYMENT_METHODS } from "../shared/paymentMethods.js";

const adminId = "111111111111111111111111";
const employeeId = "222222222222222222222222";
const ids = ["333333333333333333333333", "444444444444444444444444"];

function checkout(t, role = "admin") {
  const Model = role === "admin" ? AdminModel : EmployeModel;
  const user = new Model({ _id: role === "admin" ? adminId : employeeId, name: "Cashier", ventes: [], Facture: [] });
  const products = [
    new ProductModel({ _id: ids[0], idAdmin: adminId, name: "A", categorie: "999999999999999999999999", prix_vente: 40, prix_achat: 25, quantite: 10 }),
    new ProductModel({ _id: ids[1], idAdmin: adminId, name: "B", categorie: "999999999999999999999999", prix_vente: 20, prix_achat: 10, quantite: 10 }),
  ];
  const memory = creditCheckoutFixture(t);
  memory.rows(AdminModel).splice(0); memory.rows(EmployeModel).splice(0); memory.rows(ProductModel).splice(0);
  user.idAdmin = adminId;
  memory.rows(Model).push(user); memory.rows(ProductModel).push(...products);
  const actorWrites = memory.mocks.get(Model).writes, stockWrites = memory.mocks.get(ProductModel).writes;
  const body = {
    cart: [{ id: ids[0], qty: 2, price: 0.01 }, { id: ids[1], qty: 1, price: 0.01 }],
    amountPaid: 100,
    // These client values must never override the server's calculation.
    totalOrder: 0.01, changeToReturn: 999,
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  return { Model, get user() { return memory.rows(Model)[0]; }, get products() { return memory.rows(ProductModel); }, actorWrites, stockWrites, body, res,
    run: (overrides = {}) => AddVente({ user: { id: user.id, idAdmin: adminId }, body: { ...body, ...overrides } }, res),
  };
}

for (const role of ["admin", "employee"]) {
  for (const discountType of ["percent", "amount"]) {
    test(`${role} checkout saves and reloads a ${discountType} discount with net profit`, async (t) => {
      const context = checkout(t, role);
      await context.run({ discountType, discountValue: 10 });
      assert.equal(context.res.statusCode, 201);
      const invoice = context.res.payload.facture;
      assert.equal(invoice.invoiceOrigin, "cashier");
      assert.equal(invoice.subtotal, 100);
      assert.equal(invoice.discountType, discountType);
      assert.equal(invoice.discountValue, 10);
      assert.equal(invoice.discountAmount, 10);
      assert.equal(invoice.TotalPrix, 90);
      assert.equal(summarizeSales(context.res.payload.lastVentes).revenue, 90);
      assert.ok(context.res.payload.lastVentes.every(sale => String(sale.invoiceId) === String(invoice._id)));
      assert.equal(invoice.amountPaid, 100);
      assert.equal(invoice.PrixReture, 10);
      assert.equal(invoice.TotalQauntite, 3);
      assert.ok(invoice._id);
      assert.ok(invoice.DateFacture);
      assert.equal(context.products[0].quantite, 8);
      assert.equal(context.products[1].quantite, 9);
      assert.equal(roundMoney(context.res.payload.lastVentes.reduce((sum, line) => sum + line.profite, 0)), 30);
      const reloaded = new context.Model(context.user.toObject());
      assert.equal(reloaded.Facture[0].discountAmount, 10);
      assert.equal(reloaded.Facture[0].TotalPrix, 90);
      assert.equal(reloaded.Facture[0].nameEmp, "Cashier");
      assert.equal(reloaded.Facture[0].invoiceOrigin, "cashier");
      assert.equal(context.actorWrites.mock.callCount(), 1);
    });
  }
}

for (const role of ["admin", "employee"]) {
  test(`${role} saves independent product VAT and barcode snapshots without taxing profit`, async (t) => {
    const context = checkout(t, role);
    context.products[0].barcode = "AR00549";
    await context.run({
      invoiceOrigin: "manual", discountType: "percent", discountValue: 10,
      cart: [
        { id: ids[0], qty: 2, discountType: "percent", discountValue: 10, vatRate: 20, vatAmount: 999, totalHT: 1, price: 1, code: "forged" },
        { id: ids[1], qty: 1, discountType: "amount", discountValue: 5, vatRate: 10 },
      ],
    });
    assert.equal(context.res.statusCode, 201);
    const saved = new context.Model(context.user.toObject()).Facture[0];
    assert.equal(saved.vatRate, undefined);
    assert.equal(saved.totalHT, 78.3);
    assert.equal(saved.vatAmount, 14.31);
    assert.equal(saved.TotalPrix, 92.61);
    assert.deepEqual(context.res.payload.lastVentes.map(sale => sale.saleAmount), [77.76, 14.85]);
    assert.equal(saved.PrixReture, 7.39);
    assert.deepEqual(Array.from(saved.Product, (line) => [line.vatRate, line.totalHT, line.vatAmount, line.totalTTC]), [[20, 64.8, 12.96, 77.76], [10, 13.5, 1.35, 14.85]]);
    assert.equal(saved.Product[0].code, "AR00549");
    assert.equal(roundMoney(context.res.payload.lastVentes.reduce((sum, sale) => sum + sale.profite, 0)), 18.3);
    assert.deepEqual(context.products.map((product) => product.quantite), [8, 9]);
    context.products[0].barcode = "CHANGED";
    assert.equal(saved.Product[0].code, "AR00549");
  });
}

for (const vatRate of [-1, 101, "bad", "", null, true, []]) {
  test(`invalid product VAT ${JSON.stringify(vatRate)} causes no stock or invoice writes`, async (t) => {
    const context = checkout(t);
    await context.run({ invoiceOrigin: "manual", cart: [{ id: ids[0], qty: 1, vatRate }], amountPaid: 1000 });
    assert.equal(context.res.statusCode, 400);
    assert.equal(context.res.payload.message, "invalidVatRate");
    assert.equal(context.actorWrites.mock.callCount(), 0);
    assert.equal(context.stockWrites.mock.callCount(), 0);
    assert.deepEqual(context.products.map((product) => product.quantite), [10, 10]);
  });
}

test("checkout without discount remains compatible", async (t) => {
  const context = checkout(t);
  await context.run({ amountPaid: 120 });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.TotalPrix, 100);
  assert.equal(context.res.payload.facture.discountAmount, 0);
  assert.equal(context.res.payload.facture.PrixReture, 20);
  assert.equal(context.res.payload.facture.paymentMethod, undefined);
  assert.equal(context.res.payload.facture.vatRate, undefined);
  assert.equal(context.res.payload.facture.vatAmount, undefined);
  assert.equal(context.res.payload.facture.Product[0].vatRate, undefined);
});

for (const role of ["admin", "employee"]) {
  test(`${role} client invoice saves authoritative TVA after discounts and excludes it from profit`, async (t) => {
    const context = checkout(t, role);
    await context.run({
      invoiceOrigin: "manual", paymentMethod: "bank_transfer", vatRate: "20",
      cart: [
        { id: ids[0], qty: 2, discountType: "percent", discountValue: 10 },
        { id: ids[1], qty: 1, discountType: "amount", discountValue: 5 },
      ],
      discountType: "percent", discountValue: 10,
      // Derived money fields sent by a client are ignored.
      totalHT: 1, vatAmount: 1, TotalPrix: 1,
    });
    assert.equal(context.res.statusCode, 201);
    const invoice = context.res.payload.facture;
    assert.equal(invoice.totalHT, 78.3);
    assert.equal(invoice.vatRate, 20);
    assert.equal(invoice.vatAmount, 15.66);
    assert.equal(invoice.TotalPrix, 93.96);
    assert.equal(invoice.totalOrder, 93.96);
    assert.equal(invoice.PrixReture, 6.04);
    assert.equal(invoice.paymentMethod, "bank_transfer");
    assert.equal(roundMoney(context.res.payload.lastVentes.reduce((sum, line) => sum + line.profite, 0)), 18.3);
    assert.deepEqual(Array.from(invoice.Product, (line) => line.TotalPrix), [72, 15]);
    assert.deepEqual(context.products.map((product) => product.quantite), [8, 9]);
    const reloaded = new context.Model(context.user.toObject());
    assert.equal(reloaded.Facture[0].vatRate, 20);
    assert.equal(reloaded.Facture[0].vatAmount, 15.66);
    assert.equal(reloaded.Facture[0].totalHT, 78.3);
    assert.equal(reloaded.Facture[0].TotalPrix, 93.96);
  });
}

for (const vatRate of [-1, 100.01, "bad", "", null, true, []]) {
  test(`invalid TVA ${JSON.stringify(vatRate)} is rejected before stock or sales change`, async (t) => {
    const context = checkout(t);
    await context.run({ invoiceOrigin: "manual", vatRate, amountPaid: 1000 });
    assert.equal(context.res.statusCode, 400);
    assert.equal(context.res.payload.message, "invalidVatRate");
    assert.deepEqual(context.products.map((product) => product.quantite), [10, 10]);
    assert.equal(context.user.Facture.length, 0);
    assert.equal(context.user.ventes.length, 0);
    assert.equal(context.actorWrites.mock.callCount(), 0);
    assert.equal(context.stockWrites.mock.callCount(), 0);
  });
}

test("a payment covering HT but not TTC cannot save the invoice", async (t) => {
  const context = checkout(t);
  await context.run({ invoiceOrigin: "manual", vatRate: 20, amountPaid: 100 });
  assert.equal(context.res.statusCode, 400);
  assert.equal(context.res.payload.message, "Invalid or insufficient payment");
  assert.equal(context.actorWrites.mock.callCount(), 0);
  assert.equal(context.stockWrites.mock.callCount(), 0);
});

test("manual invoices default to zero TVA and fully discounted invoices have no tax due", async (t) => {
  const context = checkout(t);
  await context.run({ invoiceOrigin: "manual", discountValue: 100, vatRate: 20, amountPaid: 0 });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.vatAmount, 0);
  assert.equal(context.res.payload.facture.totalHT, 0);
  assert.equal(context.res.payload.facture.TotalPrix, 0);
  assert.equal(context.res.payload.lastVentes[0].saleAmount, 0);
  await context.run({ invoiceOrigin: "manual" });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.vatRate, 0);
  assert.equal(context.res.payload.facture.vatAmount, 0);
  assert.equal(context.res.payload.facture.totalHT, 100);
  assert.equal(context.res.payload.facture.TotalPrix, 100);
});

for (const role of ["admin", "employee"]) {
  for (const method of PAYMENT_METHODS) {
    test(`${role} client invoice retains payment method ${method.label} after reload`, async (t) => {
      const context = checkout(t, role);
      await context.run({ invoiceOrigin: "manual", paymentMethod: method.value });
      assert.equal(context.res.statusCode, 201);
      assert.equal(context.res.payload.facture.paymentMethod, method.value);
      const reloaded = new context.Model(context.user.toObject());
      assert.equal(reloaded.Facture[0].paymentMethod, method.value);
      assert.equal(reloaded.Facture[0].TotalPrix, 100);
      assert.equal(reloaded.Facture[0].amountPaid, 100);
    });
  }
}

for (const role of ["admin", "employee"]) {
  test(`${role} saves stock invoice with independent product discounts and client`, async (t) => {
    const context = checkout(t, role);
    await context.run({
      invoiceOrigin: "manual",
      clientName: "  Client A  ",
      cart: [
        { id: ids[0], qty: 2, discountType: "percent", discountValue: 10 },
        { id: ids[1], qty: 1, discountType: "amount", discountValue: 5 },
      ],
    });
    assert.equal(context.res.statusCode, 201);
    const invoice = context.res.payload.facture;
    assert.equal(invoice.clientName, "Client A");
    assert.equal(invoice.invoiceOrigin, "manual");
    assert.equal(invoice.subtotal, 100);
    assert.equal(invoice.discountAmount, 13);
    assert.equal(invoice.lineDiscountAmount, 13);
    assert.equal(invoice.orderDiscountAmount, 0);
    assert.equal(invoice.TotalPrix, 87);
    assert.equal(invoice.PrixReture, 13);
    assert.deepEqual(Array.from(invoice.Product, (line) => line.TotalPrix), [72, 15]);
    assert.deepEqual(Array.from(context.res.payload.lastVentes, (line) => line.profite), [22, 5]);
    assert.equal(context.products[0].quantite, 8);
    assert.equal(context.products[1].quantite, 9);
    const reloaded = new context.Model(context.user.toObject());
    assert.equal(reloaded.Facture[0].clientName, "Client A");
    assert.equal(reloaded.Facture[0].invoiceOrigin, "manual");
    assert.deepEqual(Array.from(reloaded.Facture[0].Product, (line) => [line.discountType, line.discountValue, line.discountAmount]), [
      ["percent", 10, 8], ["amount", 5, 5],
    ]);
    assert.equal(String(reloaded.Facture[0].Product[0].idProduct), ids[0]);
  });
}

test("100% discount on one product leaves the other product at full price", async (t) => {
  const context = checkout(t);
  await context.run({
    cart: [{ id: ids[0], qty: 2, discountType: "percent", discountValue: 100 }, { id: ids[1], qty: 1 }],
    amountPaid: 20,
  });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.TotalPrix, 20);
  assert.deepEqual(Array.from(context.res.payload.facture.Product, (line) => line.TotalPrix), [0, 20]);
});

test("100% discount accepts an explicit zero payment and deducts discount from profit", async (t) => {
  const context = checkout(t);
  await context.run({ discountType: "percent", discountValue: 100, amountPaid: 0 });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.TotalPrix, 0);
  assert.equal(context.res.payload.facture.PrixReture, 0);
  assert.equal(context.res.payload.lastVentes.reduce((sum, line) => sum + line.profite, 0), -60);
});

for (const overrides of [
  { cart: [{ id: ids[0], qty: 1, priceType: 'wholesale' }] },
  { cart: [{ id: ids[0], qty: 1, priceType: 'invalid' }] },
  { cart: [{ id: ids[0], qty: 1, priceType: null }] },
  { invoiceOrigin: "invalid" },
  { invoiceOrigin: null },
  { invoiceOrigin: {} },
  { discountType: "percent", discountValue: 101 },
  { discountType: "amount", discountValue: 101 },
  { discountType: "amount", discountValue: -1 },
  { discountType: "percent", discountValue: "invalid" },
  { amountPaid: 50 },
  { amountPaid: undefined },
  { amountPaid: "" },
  { amountPaid: -1 },
  { cart: [{ id: ids[0], qty: 20 }] },
  { cart: [{ id: ids[0], qty: 1, discountType: "percent", discountValue: 101 }] },
  { cart: [{ id: ids[0], qty: 1, discountType: "amount", discountValue: -1 }] },
  { cart: [{ id: ids[0], qty: 1 }, { id: ids[1], qty: 1, discountType: "amount", discountValue: 21 }] },
  { cart: [{ id: ids[0], qty: 1 }, { id: ids[0], qty: 1 }] },
  { clientName: {} },
  { paymentMethod: "unknown" },
  { paymentMethod: "" },
  { paymentMethod: null },
  { paymentMethod: ["cash"] },
  { paymentMethod: { value: "cash" } },
]) {
  test(`invalid checkout is rejected before stock or invoice writes: ${JSON.stringify(overrides)}`, async (t) => {
    const context = checkout(t);
    await context.run(overrides);
    assert.equal(context.res.statusCode, 400);
    assert.equal(context.actorWrites.mock.callCount(), 0);
    assert.equal(context.stockWrites.mock.callCount(), 0);
    assert.equal(context.user.Facture.length, 0);
    assert.equal(context.products[0].quantite, 10);
  });
}

for (const role of ['admin', 'employee']) {
  test(`${role} checkout uses stored wholesale prices per product, discounts and net profits`, async (t) => {
    const context = checkout(t, role);
    context.products[0].prix_gros = 30.5;
    await context.run({
      cart: [
        { id: ids[0], qty: 2, priceType: 'wholesale', price: 0.01 },
        { id: ids[1], qty: 1, priceType: 'retail', price: 999 },
      ],
      discountType: 'percent', discountValue: 10,
    });
    assert.equal(context.res.statusCode, 201);
    const invoice = context.res.payload.facture;
    assert.equal(invoice.subtotal, 81);
    assert.equal(invoice.TotalPrix, 72.9);
    assert.equal(invoice.PrixReture, 27.1);
    assert.deepEqual(Array.from(invoice.Product, line => [line.price, line.priceType]), [[30.5, 'wholesale'], [20, 'retail']]);
    assert.equal(roundMoney(context.res.payload.lastVentes.reduce((sum, line) => sum + line.profite, 0)), 12.9);
    assert.equal(context.products[0].quantite, 8);
    assert.equal(context.products[1].quantite, 9);
    const reloaded = new context.Model(context.user.toObject());
    assert.equal(reloaded.Facture[0].Product[0].priceType, 'wholesale');
    assert.equal(reloaded.ventes[0].priceType, 'wholesale');
  });
}

test('an explicit zero wholesale price is valid and is not replaced by retail price', async (t) => {
  const context = checkout(t);
  context.products[0].prix_gros = 0;
  await context.run({ cart: [{ id: ids[0], qty: 1, priceType: 'wholesale' }], amountPaid: 0 });
  assert.equal(context.res.statusCode, 201);
  assert.equal(context.res.payload.facture.TotalPrix, 0);
  assert.equal(context.res.payload.lastVentes[0].profite, -25);
});

for (const role of ['admin', 'employee']) {
  for (const priceType of ['retail', 'wholesale']) {
    test(`${role} ${priceType} checkout includes fees in the price, deducts their cost from profit and keeps the unit price stable`, async (t) => {
      const context = checkout(t, role);
      Object.assign(context.products[0], resolveProductFees({ prix_vente: 40, prix_gros: 30, frais_total: 60, quantite: 10 }));
      await context.run({ cart: [{ id: ids[0], qty: 2, priceType }], discountType: 'percent', discountValue: 10 });
      assert.equal(context.res.statusCode, 201);
      const expectedPrice = priceType === 'retail' ? 46 : 36;
      const total = roundMoney(expectedPrice * 2 * 0.9);
      assert.equal(context.res.payload.facture.Product[0].price, expectedPrice);
      assert.equal(context.res.payload.facture.TotalPrix, total);
      assert.equal(context.res.payload.lastVentes[0].profite, roundMoney(total - 62));
      assert.equal(context.products[0].quantite, 8);
      assert.equal(context.products[0].frais_quantite, 10);
      assert.equal(context.products[0].frais_unitaire, 6);
      assert.equal(context.products[0].prix_vente, 46);
    });
  }
}
