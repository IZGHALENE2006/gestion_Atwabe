import Fabric from "../models/Fabric.js";
import { createFabricSaleFinancials } from "../../shared/fabricProfits.js";
import { tailoringCostSettingsModel } from "./tailoringCostSettings.js";
import { tailoringMoneyCents, tailoringOrderItems, tailoringItemsTotal } from "../../shared/tailoring.js";
import { tailoringRateFields, djellabaItemCosts, djellabaItemSalePrice, djellabaCostsTotal, tailoringFabricCost, trouserLaborRates } from "../../shared/tailoringCosts.js";
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function priceDjellabaOrder(value, idAdmin, current, actor) {
  if (value.garmentType === "trousers") return priceTrouserOrder(value, idAdmin, current, actor);
  if (!value.automaticCosting) {
    if (current?.costing) throw Object.assign(fail("invalidOrder", 400), { fields: { automaticCosting: "costsRequired" } });
    return value;
  }
  const pricingVersion = current?.costing?.pricingVersion || value.salePricingVersion || 1;
  let rates, settingsVersion;
  if (current?.costing) {
    rates = current.costing.rates;
    settingsVersion = current.costing.settingsVersion;
  } else {
    const settings = await tailoringCostSettingsModel(value.garmentType).findOne({ idAdmin });
    if (!settings) throw fail("costSettingsRequired");
    rates = Object.fromEntries(tailoringRateFields(value.garmentType, pricingVersion).map(key => [key, settings[key]]));
    settingsVersion = settings.__v;
  }
  if (pricingVersion === 3 && tailoringRateFields(value.garmentType, pricingVersion).some(key => tailoringMoneyCents(rates[key]) === null)) throw fail("costSettingsRequired");
  if (pricingVersion >= 2) rates = { ...Object.fromEntries(tailoringRateFields(value.garmentType, pricingVersion).map(key => [key, rates[key]])), laborPrice: 0 };
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
    const costs = djellabaItemCosts({ ...item, fabricUnitPrice }, rates, pricingVersion);
    if (!costs) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
    const { fabricUnitPrice: _quote, ...stored } = item;
    let fabricSale;
    if (pricingVersion >= 2 && item.fabricSource === "shop") {
      fabricSale = await createOrderFabricSale(item, old, actor, idAdmin, fabrics, costs.fabricAmount);
    }
    const price = pricingVersion >= 2 ? djellabaItemSalePrice(costs) : item.price;
    if (price === null) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
    items.push({ ...stored, price, costs, ...(fabricSale ? { fabricSale } : {}) });
  }
  const expenseAmount = djellabaCostsTotal(items.map(item => item.costs));
  if (expenseAmount === null) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
  const totalPrice = tailoringItemsTotal(items);
  if (totalPrice === null) throw Object.assign(fail("invalidOrder", 400), { fields: { totalPrice: "costsTooLarge" } });
  if (!value.adjustments && tailoringMoneyCents(value.paidAmount) > tailoringMoneyCents(totalPrice)) throw Object.assign(fail("invalidOrder", 400), { fields: { paidAmount: "paidExceedsPrice" } });
  const { automaticCosting: _mode, costSettingsVersion: _version, salePricingVersion: _pricingVersion, ...stored } = value;
  return { ...stored, totalPrice, items, expenseAmount, costing: { rates, settingsVersion, calculatedAt: new Date(), ...(pricingVersion >= 2 ? { pricingVersion } : {}) } };
}

// Trousers retain an editable expense total and snapshot cloth prices and labor rates.
async function priceTrouserOrder(value, idAdmin, current, actor) {
  const recordFabricSales = value.recordFabricSales || current?.fabricSalesVersion === 1;
  if (recordFabricSales && !value.fabricCosting) throw Object.assign(fail("invalidOrder", 400), { fields: { fabricCosting: "costsRequired" } });
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
    const fabricSale = recordFabricSales && item.fabricSource === "shop" ? await createOrderFabricSale(item, old, actor, idAdmin, fabrics, fabricCost.fabricAmount) : null;
    items.push({ ...stored, fabricCost, ...(fabricSale ? { fabricSale } : {}) });
  }
  let trouserCosting = current?.trouserCosting;
  if (value.laborCosting) {
    let rates = trouserCosting?.laborPrice != null && trouserCosting.regularLaborPrice == null ? { laborPrice: trouserCosting.laborPrice } : trouserLaborRates(trouserCosting);
    let settingsVersion = trouserCosting?.settingsVersion ?? null;
    // Existing orders retain their original rates, including older orders with no labor setting.
    if (!current) {
      const settings = await tailoringCostSettingsModel("trousers").findOne({ idAdmin });
      rates = trouserLaborRates(settings); settingsVersion = settings?.__v ?? null;
    }
    if (settingsVersion !== value.costSettingsVersion) throw fail("costSettingsChanged");
    trouserCosting = { ...rates, settingsVersion, calculatedAt: trouserCosting?.calculatedAt || new Date() };
  }
  const { fabricCosting: _mode, laborCosting: _laborMode, recordFabricSales: _recordMode, costSettingsVersion: _version, ...stored } = value;
  return { ...stored, ...(recordFabricSales ? { fabricSalesVersion: 1 } : {}), ...(trouserCosting ? { trouserCosting } : {}), ...(value.items ? { items } : {}) };
}

async function createOrderFabricSale(item, old, actor, idAdmin, fabrics, fabricAmount) {
      const retained = old?.fabricSale && old.fabricSource === "shop" && String(old.fabricId) === String(item.fabricId);
      let purchaseUnitPrice;
      if (retained) purchaseUnitPrice = old.fabricSale.purchaseUnitPrice;
      else {
        if (!fabrics.has(String(item.fabricId))) fabrics.set(String(item.fabricId), await Fabric.findOne({ _id: item.fabricId, idAdmin }));
        const fabric = fabrics.get(String(item.fabricId));
        if (!fabric) throw fail("fabricNotFound", 404);
        purchaseUnitPrice = fabric.purchasePricePerMeter;
      }
      const creator = retained ? { id: old.fabricSale.createdBy, name: old.fabricSale.createdByName, role: old.fabricSale.createdByRole } : actor;
      return { occurredAt: retained ? old.fabricSale.occurredAt : new Date(), createdBy: creator.id, createdByName: String(creator.name || "").slice(0, 120), createdByRole: creator.role,
        ...createFabricSaleFinancials(item.fabricMeters, purchaseUnitPrice, fabricAmount) };
}
