import { tailoringMoneyCents, tailoringFabricMeters } from "./tailoring.js";

export const DJELLABA_RATE_FIELDS = ["thinSfifaPrice", "thickSfifaPrice", "laborPrice"];
export function validateDjellabaRates(input) {
  const fields = {}, rates = {};
  for (const key of DJELLABA_RATE_FIELDS) {
    const cents = tailoringMoneyCents(input?.[key]);
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
export function djellabaItemCosts(item, rates) {
  const fabric = tailoringFabricCost(item);
  const sfifa = tailoringMoneyCents(rates?.[item.sfifa?.width === "thin" ? "thinSfifaPrice" : item.sfifa?.width === "thick" ? "thickSfifaPrice" : ""]);
  const labor = tailoringMoneyCents(rates?.laborPrice);
  if (!fabric || sfifa === null || labor === null) return null;
  const fabricCents = BigInt(tailoringMoneyCents(fabric.fabricAmount));
  const total = fabricCents + BigInt(sfifa) + BigInt(labor);
  if (total > 99999999999n) return null;
  return { ...fabric, sfifaAmount: sfifa / 100, laborAmount: labor / 100, totalAmount: Number(total) / 100 };
}
export function djellabaCostsTotal(costs) {
  if (!Array.isArray(costs) || !costs.length) return null;
  const amounts = costs.map(cost => tailoringMoneyCents(cost?.totalAmount));
  if (amounts.some(amount => amount === null)) return null;
  const cents = amounts.reduce((sum, amount) => sum + amount, 0);
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents / 100 : null;
}
