import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, SFIFA_STOCK_SCALE, sfifaQuantityUnits, validateSfifaStock } from './sfifaStock.js';

// Customer-owned sfifa is an assignment classification, never a shop stock variant.
export const SFIFA_CUSTOMER_FAMILY = 'customer';
export const WORKER_SFIFA_FAMILIES = [...SFIFA_STOCK_FAMILIES, { value: SFIFA_CUSTOMER_FAMILY }];
export const workerSfifaCreditsStock = work => work.workType !== 'client' && work.sfifa?.family !== SFIFA_CUSTOMER_FAMILY;
export function validateWorkerSfifa(input) {
  if (input?.family !== SFIFA_CUSTOMER_FAMILY) return validateSfifaStock(input);
  const fields = {}, units = sfifaQuantityUnits(input.quantity);
  if (!SFIFA_STOCK_WIDTHS.includes(input.width)) fields.width = 'invalidWidth';
  if (units === null || units === 0) fields.quantity = 'invalidQuantity';
  if (input.code !== undefined && input.code !== null && input.code !== '') fields.code = 'invalidCode';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidStock'), { fields });
  return { width: input.width, family: SFIFA_CUSTOMER_FAMILY, quantity: units / SFIFA_STOCK_SCALE };
}
