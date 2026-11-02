import CashCheckout from '../../BackEnd/models/CashCheckout.js';
import { matches, update, memoryQuery } from './modelMemory.js';
import Admin from "../../BackEnd/models/AdminModel.js";
import Employee from "../../BackEnd/models/EmployeModele.js";
import Product from "../../BackEnd/models/productModel.js";
import UserCredit from "../../BackEnd/models/userCidit.js";
import Checkout from "../../BackEnd/models/CreditCheckout.js";

export const owner = "111111111111111111111111", otherOwner = "222222222222222222222222";
export const employeeId = "555555555555555555555555", colleagueId = "666666666666666666666666", inactiveId = "777777777777777777777777", foreignEmployeeId = "888888888888888888888888";
export const productIds = ["333333333333333333333333", "444444444444444444444444"];
export function creditCheckoutFixture(t) {
  const maps = new Map(), controls = {}, mocks = new Map();
  const clone = (Model, row) => row ? new Model(row.toObject()) : null;
  const rows = Model => maps.get(Model);
  const once = key => { if (controls[key]) { controls[key] = false; throw new Error(`Simulated ${key}`); } };
  for (const Model of [Admin, Employee, Product, UserCredit, Checkout, CashCheckout]) {
    const records = []; maps.set(Model, records);
    const find = scope => records.find(row => matches(row, scope));
    t.mock.method(Model, "findOne", scope => memoryQuery(() => clone(Model, find(scope))));
    t.mock.method(Model, "findById", id => memoryQuery(() => clone(Model, find({ _id: id }))));
    t.mock.method(Model, "find", scope => memoryQuery(() => records.filter(row => matches(row, scope)).map(row => clone(Model, row))));
    t.mock.method(Model, "create", async value => {
      if (records.some(row => String(row._id) === String(value._id)) || ([Checkout, CashCheckout].includes(Model) && records.some(row => row.requestId === value.requestId && String(row.idAdmin) === String(value.idAdmin)))) throw Object.assign(new Error("Duplicate"), { code: 11000 });
      const row = new Model({ ...value, __v: 0 }); await row.validate(); records.push(row);
      if ([Checkout, CashCheckout].includes(Model) && controls.stockRace) { controls.stockRace = false; rows(Product)[1].quantite = 0; }
      if (Model === UserCredit) once("newCustomerAfterCreate");
      return clone(Model, row);
    });
    t.mock.method(Model.prototype, "save", async function () {
      await this.validate();
      if (Model === UserCredit) once("creditBeforeSave");
      const index = records.findIndex(row => String(row._id) === String(this._id));
      if (index < 0 || (Model === UserCredit && records[index].__v !== this.__v)) throw Object.assign(new Error("stale"), { name: "VersionError" });
      this.__v += 1; records[index] = clone(Model, this);
      if (Model === UserCredit) once("creditAfterSave");
      return this;
    });
    const mutate = async (scope, change) => {
      const index = records.findIndex(row => matches(row, scope)); if (index < 0) return null;
      if (Model === Product) once("productBeforeCommit");
      const row = clone(Model, records[index]); update(row, change); await row.validate(); records[index] = clone(Model, row);
      if (Model === Product && change.$set?.stockBatches && !change.$addToSet) once("restockAfterCommit");
      if (Model === Product && change.$pull) once("stockReleaseAfterCommit");
      if (Model === Product && change.$addToSet) once("stockAfterCommit");
      if ([Admin, Employee].includes(Model) && change.$push) once("actorAfterCommit");
      if ([Checkout, CashCheckout].includes(Model) && change.$set?.status === "complete") once("journalAfterCommit");
      return row;
    };
    const writes = t.mock.method(Model, "findOneAndUpdate", mutate); mocks.set(Model, { writes });
    t.mock.method(Model, "updateOne", async (...args) => ({ matchedCount: (await mutate(...args)) ? 1 : 0 }));
  }
  const seed = (Model, value) => { const row = new Model({ ...value, __v: 0 }); rows(Model).push(row); return row; };
  seed(Admin, { _id: owner, name: "صاحب المحل" }); seed(Admin, { _id: otherOwner, name: "محل آخر" });
  seed(Employee, { _id: employeeId, idAdmin: owner, name: "خديجة", isActive: true });
  seed(Employee, { _id: colleagueId, idAdmin: owner, name: "أمين", isActive: true });
  seed(Employee, { _id: inactiveId, idAdmin: owner, name: "موظف موقوف", isActive: false });
  seed(Employee, { _id: foreignEmployeeId, idAdmin: otherOwner, name: "موظف محل آخر", isActive: true });
  for (const [index, id] of productIds.entries()) seed(Product, { _id: id, idAdmin: owner, name: ["جلابة", "قميص"][index], prix_vente: [400, 200][index], prix_gros: [300, 150][index], prix_achat: [200, 100][index], quantite: 10, categorie: "999999999999999999999999", barcode: `123456${index}` });
  const customer = seed(UserCredit, { idUser: owner, name: "فاطمة", phone: "0612345678", Total: 300, Paye: 100, Qauntite: 1, produit: [{ id: "OLD", nom: "منتج قديم", prix: 300, Quantite: 1, Paiement: 100 }] });
  const foreignCustomer = seed(UserCredit, { idUser: otherOwner, name: "زبون محل آخر" });
  return { controls, customer, foreignCustomer, products: () => rows(Product), accounts: () => rows(UserCredit), operations: () => rows(Checkout), actor: () => rows(Admin)[0], account: () => rows(UserCredit).find(row => String(row._id) === String(customer._id)), rows, seed, mocks };
}
