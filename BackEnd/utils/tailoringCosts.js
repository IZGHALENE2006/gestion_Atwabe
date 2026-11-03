import Fabric from "../models/Fabric.js";
import { tailoringCostSettingsModel } from "./tailoringCostSettings.js";
import { tailoringMoneyCents, tailoringOrderItems } from "../../shared/tailoring.js";
import { DJELLABA_RATE_FIELDS, djellabaItemCosts, djellabaCostsTotal, tailoringFabricCost } from "../../shared/tailoringCosts.js";
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function priceDjellabaOrder(value, idAdmin, current) {
  if (value.garmentType === "trousers") return priceTrouserOrder(value, idAdmin, current);
  if (!value.automaticCosting) {
    if (current?.costing) throw Object.assign(fail("invalidOrder", 400), { fields: { automaticCosting: "costsRequired" } });
    return value;
  }
  let rates, settingsVersion;
  if (current?.costing) {
    rates = current.costing.rates;
    settingsVersion = current.costing.settingsVersion;
  } else {
    const settings = await tailoringCostSettingsModel(value.garmentType).findOne({ idAdmin });
    if (!settings) throw fail("costSettingsRequired");
    rates = Object.fromEntries(DJELLABA_RATE_FIELDS.map(key => [key, settings[key]]));
    settingsVersion = settings.__v;
  }
  if (settingsVersion !== value.costSettingsVersion) throw fail("costSettingsChanged");
  const previous = tailoringOrderItems(current), fabrics = new Map(), items = [];
  for (const item of value.items) {
    const old = previous.find(entry => entry.lineId === item.lineId);
    let fabricUnitPrice = 0;
    if (item.fabricSource === "shop") {
      if (old?.costs && old.fabricSource === "shop" && String(old.fabricId) === String(item.fabricId)) fabricUnitPrice = old.costs.fabricUnitPrice;
      else {
        if (!fabrics.has(String(item.fabricId))) fabrics.set(String(item.fabricId), await Fabric.findOne({ _id: item.fabricId, idAdmin }));
        const fabric = fabrics.get(String(item.fabricId));
        if (!fabric) throw fail("fabricNotFound", 404);
        fabricUnitPrice = fabric.salePricePerMeter;
        if (tailoringMoneyCents(fabricUnitPrice) === null || fabricUnitPrice <= 0) throw fail("fabricPriceMissing");
      }
      if (tailoringMoneyCents(item.fabricUnitPrice) !== tailoringMoneyCents(fabricUnitPrice)) throw fail("fabricPriceChanged");
    }
    const costs = djellabaItemCosts({ ...item, fabricUnitPrice }, rates);
    if (!costs) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
    const { fabricUnitPrice: _quote, ...stored } = item;
    items.push({ ...stored, costs });
  }
  const expenseAmount = djellabaCostsTotal(items.map(item => item.costs));
  if (expenseAmount === null) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
  const { automaticCosting: _mode, costSettingsVersion: _version, ...stored } = value;
  return { ...stored, items, expenseAmount, costing: { rates, settingsVersion, calculatedAt: new Date() } };
}

// Trousers retain an editable expense total and snapshot cloth prices and labor rates.
async function priceTrouserOrder(value, idAdmin, current) {
  const previous = tailoringOrderItems(current), fabrics = new Map(), items = [];
  for (const [index, item] of (value.items || []).entries()) {
    const old = previous.find(entry => entry.lineId === item.lineId);
    const sameFabric = old?.fabricSource === item.fabricSource && String(old.fabricId || "") === String(item.fabricId || "");
    if (!value.fabricCosting) {
      items.push(sameFabric && old.fabricCost ? { ...item, fabricMeters: old.fabricMeters, fabricCost: old.fabricCost } : item);
      continue;
    }
    let fabricUnitPrice = 0;
    if (item.fabricSource === "shop") {
      if (sameFabric && old.fabricCost) fabricUnitPrice = old.fabricCost.fabricUnitPrice;
      else {
        if (!fabrics.has(String(item.fabricId))) fabrics.set(String(item.fabricId), await Fabric.findOne({ _id: item.fabricId, idAdmin }));
        const fabric = fabrics.get(String(item.fabricId));
        if (!fabric) throw fail("fabricNotFound", 404);
        fabricUnitPrice = fabric.salePricePerMeter;
        if (tailoringMoneyCents(fabricUnitPrice) === null || fabricUnitPrice <= 0) throw fail("fabricPriceMissing");
      }
      if (tailoringMoneyCents(item.fabricUnitPrice) !== tailoringMoneyCents(fabricUnitPrice)) throw fail("fabricPriceChanged");
    }
    const fabricCost = tailoringFabricCost({ ...item, fabricUnitPrice });
    if (!fabricCost) throw Object.assign(fail("invalidOrder", 400), { fields: { ["items." + index + ".fabricMeters"]: "costsTooLarge" } });
    const { fabricUnitPrice: _quote, ...stored } = item;
    items.push({ ...stored, fabricCost });
  }
  let trouserCosting = current?.trouserCosting;
  if (value.laborCosting) {
    let laborPrice = trouserCosting?.laborPrice ?? 0, settingsVersion = trouserCosting?.settingsVersion ?? null;
    // Existing orders retain their original rates, including older orders with no labor setting.
    if (!current) {
      const settings = await tailoringCostSettingsModel("trousers").findOne({ idAdmin });
      laborPrice = settings?.laborPrice ?? 0; settingsVersion = settings?.__v ?? null;
    }
    if (settingsVersion !== value.costSettingsVersion) throw fail("costSettingsChanged");
    trouserCosting = { laborPrice, settingsVersion, calculatedAt: trouserCosting?.calculatedAt || new Date() };
  }
  const { fabricCosting: _mode, laborCosting: _laborMode, costSettingsVersion: _version, ...stored } = value;
  return { ...stored, ...(trouserCosting ? { trouserCosting } : {}), ...(value.items ? { items } : {}) };
}
