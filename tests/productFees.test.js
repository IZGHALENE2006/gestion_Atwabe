import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProductFees, getProductBasePrices, resolveProductFees } from '../shared/productFees.js';
import { productFormData } from '../src/composent/ProductPg/productImageUtils.js';

test('60 DH over 10 units adds 6 DH to retail and configured wholesale prices', () => {
  assert.deepEqual(calculateProductFees({ retailPrice: 100, wholesalePrice: 80, totalFees: 60, quantity: 10 }), {
    prix_vente: 106, prix_gros: 86, frais_total: 60, frais_quantite: 10, frais_unitaire: 6,
  });
});

test('fees round to cents, remain optional and do not enable an unset wholesale price', () => {
  assert.equal(calculateProductFees({ retailPrice: 100, totalFees: 60, quantity: 7 }).prix_vente, 108.57);
  assert.equal(calculateProductFees({ retailPrice: 100, totalFees: 60, quantity: 7 }).prix_gros, null);
  assert.equal(calculateProductFees({ retailPrice: 100, wholesalePrice: 0, totalFees: 60, quantity: 10 }).prix_gros, 6);
  assert.equal(calculateProductFees({ retailPrice: 100, totalFees: '', quantity: 0 }).prix_vente, 100);
});

test('editing after a sale, saving repeatedly and removing fees never compound the surcharge', () => {
  const current = { ...resolveProductFees({ prix_vente: 100, prix_gros: 80, frais_total: 60, quantite: 10 }), quantite: 3 };
  const bases = getProductBasePrices(current);
  assert.deepEqual(bases, { prix_vente: 100, prix_gros: 80 });
  const input = { prix_vente_base: 100, prix_gros_base: 80, frais_total: 60, quantite: 3 };
  const saved = resolveProductFees(input, current);
  assert.equal(saved.frais_quantite, 10);
  assert.equal(saved.prix_vente, 106);
  assert.deepEqual(resolveProductFees(input, saved), saved);
  assert.equal(resolveProductFees({ ...input, frais_total: 0 }, saved).prix_vente, 100);
  assert.equal(resolveProductFees({ ...input, frais_quantite: 20 }, saved).prix_vente, 103);
  assert.equal(resolveProductFees({ prix_vente: 106, prix_gros: 86, quantite: 0 }, current).prix_vente, 106);
});

test('product forms explicitly submit base prices without including computed surcharges', () => {
  const data = productFormData({ prix_vente: 100, prix_gros: 80, frais_total: 60, frais_quantite: 10 });
  assert.equal(data.get('prix_vente_base'), '100');
  assert.equal(data.get('prix_gros_base'), '80');
  assert.equal(data.get('prix_vente'), null);
  assert.equal(data.get('frais_total'), '60');
});

test('negative, nonnumeric expenses and nonpositive or fractional allocation quantities are rejected', () => {
  for (const totalFees of [-1, 'bad', Infinity, true, {}]) {
    assert.throws(() => calculateProductFees({ retailPrice: 100, totalFees, quantity: 10 }), /invalidFees/);
  }
  for (const quantity of [0, '', -1, 2.5, 'bad', Infinity, null, true]) {
    assert.throws(() => calculateProductFees({ retailPrice: 100, totalFees: 60, quantity }), /invalidFeeQuantity/);
  }
});
