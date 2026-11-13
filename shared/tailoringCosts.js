import { tailoringMoneyCents, tailoringFabricMeters } from "./tailoring.js";

export const DJELLABA_RATE_FIELDS = ["thinSfifaPrice", "thickSfifaPrice", "laborPrice"];
export const DJELLABA_SALE_RATE_FIELDS = ["thinSfifaPrice", "thickSfifaPrice"];
export const DJELLABA_SFIFA_COST_FIELDS = ["thinSfifaCostPrice", "thickSfifaCostPrice"];
export const DJELLABA_COST_SALE_RATE_FIELDS = ["thinSfifaCostPrice", "thinSfifaPrice", "thickSfifaCostPrice", "thickSfifaPrice"];
export const TROUSER_LABOR_RATE_FIELDS = ["regularLaborPrice", "qandrissiLaborPrice"];
export const tailoringRateFields = (garmentType, pricingVersion = 1) => garmentType === "shirts" ? [] : garmentType === "trousers" ? TROUSER_LABOR_RATE_FIELDS : pricingVersion === 3 ? DJELLABA_COST_SALE_RATE_FIELDS : pricingVersion === 2 ? DJELLABA_SALE_RATE_FIELDS : DJELLABA_RATE_FIELDS;
// Older settings and saved orders used the same rate for both trouser types.
export function trouserLaborRates(source) {
  const rates = source ?? { laborPrice: 0 };
  return Object.fromEntries(TROUSER_LABOR_RATE_FIELDS.map(key => [key, rates[key] ?? rates.laborPrice]));
}
export function validateDjellabaRates(input, garmentType = "djellaba", pricingVersion = 1) {
  const fields = {}, rates = {};
  const values = garmentType === "trousers" && !TROUSER_LABOR_RATE_FIELDS.some(key => Object.hasOwn(input ?? {}, key)) && Object.hasOwn(input ?? {}, "laborPrice") ? trouserLaborRates(input) : input;
  for (const key of tailoringRateFields(garmentType, pricingVersion)) {
    const cents = tailoringMoneyCents(values?.[key]);
    if (cents === null) fields[key] = "invalidMoney";
    else rates[key] = cents / 100;
  }
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidCostSettings"), { fields });
  return rates;
}

// Multiply millimetres of fabric by centimes, rounding once to the nearest centime.
export function tailoringFabricCost(item) {
  const meters = tailoringFabricMeters(item.fabricMeters);
  const unitPrice = tailoringMoneyCents(item.fabricUnitPrice);
  if (meters === null || unitPrice === null) return null;
  const cents = (BigInt(Math.round(meters * 1000)) * BigInt(unitPrice) + 500n) / 1000n;
  return cents > 99999999999n ? null : { fabricUnitPrice: unitPrice / 100, fabricAmount: Number(cents) / 100 };
}
export function tailoringFabricCostsTotal(costs) {
  return Array.isArray(costs) ? djellabaCostsTotal(costs.map(cost => cost && ({ totalAmount: cost.fabricAmount }))) : null;
}
export function trouserCostsTotal(costs, laborPrice = 0) {
  const fabric = tailoringMoneyCents(tailoringFabricCostsTotal(costs)), labor = tailoringMoneyCents(laborPrice);
  if (fabric === null || labor === null) return null;
  const total = BigInt(fabric) + BigInt(labor) * BigInt(costs.length);
  return total <= 99999999999n ? Number(total) / 100 : null;
}
export function trouserLaborCostsTotal(items, source) {
  if (!Array.isArray(items)) return null;
  const rates = trouserLaborRates(source);
  return djellabaCostsTotal(items.map(item => ({ totalAmount: item?.trouserType === "regular" ? rates.regularLaborPrice : item?.trouserType === "qandrissi" ? rates.qandrissiLaborPrice : null })));
}
export function trouserOrderCostsTotal(items, rates) {
  if (!Array.isArray(items)) return null;
  return djellabaCostsTotal([
    { totalAmount: tailoringFabricCostsTotal(items.map(item => item?.fabricCost)) },
    { totalAmount: trouserLaborCostsTotal(items, rates) },
  ]);
}
export function djellabaItemCosts(item, rates, pricingVersion = 1) {
  const fabric = tailoringFabricCost(item);
  const sfifa = tailoringMoneyCents(rates?.[item.sfifa?.width === "thin" ? "thinSfifaPrice" : item.sfifa?.width === "thick" ? "thickSfifaPrice" : ""]);
  const labor = pricingVersion >= 2 ? 0 : tailoringMoneyCents(rates?.laborPrice);
  const sfifaCost = pricingVersion === 3 ? tailoringMoneyCents(rates?.[item.sfifa?.width === "thin" ? "thinSfifaCostPrice" : "thickSfifaCostPrice"]) : 0;
  if (!fabric || sfifa === null || sfifaCost === null || labor === null) return null;
  const fabricCents = BigInt(tailoringMoneyCents(fabric.fabricAmount));
  const total = pricingVersion >= 2 ? fabricCents + BigInt(sfifaCost) : fabricCents + BigInt(sfifa) + BigInt(labor);
  if (total > 99999999999n) return null;
  return { ...fabric, sfifaAmount: sfifa / 100, ...(pricingVersion === 3 ? { sfifaCostAmount: sfifaCost / 100 } : {}), laborAmount: labor / 100, totalAmount: Number(total) / 100 };
}
export function djellabaItemSalePrice(costs) {
  const fabric = tailoringMoneyCents(costs?.fabricAmount), sfifa = tailoringMoneyCents(costs?.sfifaAmount);
  if (fabric === null || sfifa === null || fabric + sfifa > 99999999999) return null;
  return (fabric + sfifa) / 100;
}
export function djellabaCostsTotal(costs) {
  if (!Array.isArray(costs) || !costs.length) return null;
  const amounts = costs.map(cost => tailoringMoneyCents(cost?.totalAmount));
  if (amounts.some(amount => amount === null)) return null;
  const cents = amounts.reduce((sum, amount) => sum + amount, 0);
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents / 100 : null;
}
