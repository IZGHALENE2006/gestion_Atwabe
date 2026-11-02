import { owner } from "./djellabaCostsFixture.js";
import { jabadorFixture } from "./jabadorFixture.js";
import MalakiyaCostSettings from "../../BackEnd/models/MalakiyaCostSettings.js";
export function malakiyaFixture(t) {
  const fixture = jabadorFixture(t), malakiyaSettings = new Map();
  t.mock.method(MalakiyaCostSettings, "findOne", async scope => malakiyaSettings.has(String(scope.idAdmin)) ? new MalakiyaCostSettings(malakiyaSettings.get(String(scope.idAdmin)).toObject()) : null);
  t.mock.method(MalakiyaCostSettings, "create", async value => {
    if (malakiyaSettings.has(String(value.idAdmin))) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const row = new MalakiyaCostSettings({ ...value, __v: 0 }); await row.validate(); malakiyaSettings.set(String(value.idAdmin), row); return row;
  });
  t.mock.method(MalakiyaCostSettings.prototype, "save", async function () {
    const old = malakiyaSettings.get(String(this.idAdmin)); await this.validate();
    if (!old || old.__v !== this.__v) throw Object.assign(new Error("Conflict"), { name: "VersionError" });
    this.__v += 1; malakiyaSettings.set(String(this.idAdmin), new MalakiyaCostSettings(this.toObject())); return this;
  });
  const seedMalakiyaSettings = (rates = { thinSfifaPrice: 15, thickSfifaPrice: 25, laborPrice: 40 }, idAdmin = owner) => {
    const row = new MalakiyaCostSettings({ ...rates, idAdmin, updatedBy: idAdmin, __v: 0 }); malakiyaSettings.set(String(idAdmin), row); return row;
  };
  return { ...fixture, malakiyaSettings, seedMalakiyaSettings };
}
