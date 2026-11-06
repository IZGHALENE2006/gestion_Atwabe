import { SFIFA_STOCK_FAMILIES, formatSfifaCode } from '../../../shared/sfifaStock.js';
import { SFIFA_CUSTOMER_FAMILY } from '../../../shared/workerSfifa.js';

export function workerSfifaFamilyLabel(family, t) {
  return family === SFIFA_CUSTOMER_FAMILY ? t('workers.work.sfifa.customerSupplied') : SFIFA_STOCK_FAMILIES.find(item => item.value === family)?.label || family;
}
export function workerSfifaNumberLabel(sfifa, t) {
  return sfifa.family === SFIFA_CUSTOMER_FAMILY ? workerSfifaFamilyLabel(sfifa.family, t) : formatSfifaCode(sfifa.code, sfifa.family);
}
