import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTailoringWorkFilter, tailoringRequiredWorkStages } from '../shared/tailoringWorkFilters.js';

const order = (patch = {}) => ({ _id: 'order-1', garmentType: 'djellaba', items: [{ lineId: 'piece-1' }, { lineId: 'piece-2' }], ...patch });
const work = (category, lineIds = ['piece-1', 'piece-2'], patch = {}) => ({ category, items: lineIds.map(lineId => ({ lineId })), quantity: lineIds.length, completedQuantity: lineIds.length, remainingQuantity: 0, ...patch });
const tracking = (assignments = []) => ({ loading: false, error: '', byOrder: { 'order-1': assignments } });
const matches = (filter, works = [], value = order()) => matchesTailoringWorkFilter(value, filter, tracking(works));
const complete = () => ['machine', 'finishing', 'mesbanto'].map(category => work(category));

test('a new unassigned order is distinct from assigned work, even if that work is completed or the worker was removed', () => {
  assert.equal(matches('unassigned'), true);
  for (const patch of [{ completedQuantity: 0, remainingQuantity: 2 }, {}, { workerAvailable: false }]) {
    assert.equal(matches('unassigned', [work('machine', ['piece-1', 'piece-2'], patch)]), false);
  }
  assert.equal(matches('unassigned', [work('brim', ['piece-1'])]), false);
  assert.equal(matches('unassigned', [work('sfifa', ['piece-2'], { quantity: 3, completedQuantity: 0, remainingQuantity: 3 })]), false);
});

test('deleted, relocated and obsolete garment assignments do not count as active assignments', () => {
  assert.equal(matches('unassigned', [work('machine', ['piece-1'], { deletedAt: '2026-11-24' })]), true);
  assert.equal(matches('unassigned', [work('sfifa', ['piece-2'], { relocatedAt: '2026-11-24' })]), true);
  assert.equal(matches('unassigned', [work('machine', ['old-piece'])]), true);
  assert.equal(matches('completedUndelivered', complete().map(row => ({ ...row, deletedAt: '2026-11-24' }))), false);
});

test('unknown, loading, failed and missing tracking never classifies an order', () => {
  for (const filter of ['unassigned', 'completedUndelivered']) for (const value of [undefined, {}, { loading: true, byOrder: { 'order-1': [] } }, { ...tracking(), error: 'loadTrackingFailed' }, { loading: false, byOrder: {} }, { ...tracking(), byOrder: { 'order-1': null } }]) {
    assert.equal(matchesTailoringWorkFilter(order(), filter, value), false);
  }
});

test('every current garment must complete machine, finishing and laundry for all three garment sections', () => {
  for (const garmentType of ['djellaba', 'jabador', 'malakiya']) {
    const value = order({ garmentType });
    assert.deepEqual(tailoringRequiredWorkStages(value), ['machine', 'finishing', 'mesbanto']);
    assert.equal(matches('completedUndelivered', [], value), false);
    assert.equal(matches('completedUndelivered', complete(), value), true);
    for (const missing of ['machine', 'finishing', 'mesbanto']) {
      assert.equal(matches('completedUndelivered', complete().filter(row => row.category !== missing), value), false);
      assert.equal(matches('completedUndelivered', complete().map(row => row.category === missing ? work(missing, ['piece-1']) : row), value), false);
    }
  }
});

test('split completed jobs cover the order without requiring a single worker to do all its pieces', () => {
  const works = ['machine', 'finishing', 'mesbanto'].flatMap(category => ['piece-1', 'piece-2'].map(lineId => work(category, [lineId])));
  assert.equal(matches('completedUndelivered', works), true);
  assert.equal(matches('completedUndelivered', works.filter(row => row.category !== 'mesbanto' || row.items[0].lineId !== 'piece-2')), false);
  assert.equal(matches('completedUndelivered', [...works, work('machine', ['old-piece'], { completedQuantity: 0, remainingQuantity: 1 })]), true);
});

test('partial, pending, contradictory or missing completion data cannot mark a stage as completed', () => {
  for (const patch of [{ completedQuantity: 1, remainingQuantity: 1 }, { completedQuantity: 0, remainingQuantity: 2 }, { completedQuantity: undefined }, { quantity: 0 }, { remainingQuantity: 1 }]) {
    assert.equal(matches('completedUndelivered', complete().map(row => row.category === 'mesbanto' ? { ...row, ...patch } : row)), false);
  }
  assert.equal(matches('completedUndelivered', [...complete(), work('mesbanto', ['piece-1'], { completedQuantity: 0, remainingQuantity: 1 })]), false);
});

test('shirts complete their dedicated sewing section and laundry; trousers complete only their own section', () => {
  const shirts = order({ garmentType: 'shirts' }), trousers = order({ garmentType: 'trousers' });
  assert.deepEqual(tailoringRequiredWorkStages(shirts), ['shirts', 'mesbanto']);
  assert.deepEqual(tailoringRequiredWorkStages(trousers), ['trousers']);
  assert.equal(matches('completedUndelivered', [work('shirts'), work('mesbanto')], shirts), true);
  assert.equal(matches('completedUndelivered', [work('shirts')], shirts), false);
  assert.equal(matches('completedUndelivered', complete(), shirts), false);
  assert.equal(matches('completedUndelivered', [work('trousers')], trousers), true);
  assert.equal(matches('completedUndelivered', complete(), trousers), false);
});

test('delivered and cancelled orders stay out of both work filters, including credit deliveries', () => {
  for (const patch of [{ deliveredAt: '2026-11-24' }, { cancelledAt: '2026-11-24' }, { deliveredAt: '2026-11-24', creditDelivery: { remainingAmount: 100 } }]) {
    assert.equal(matches('completedUndelivered', complete(), order(patch)), false);
    assert.equal(matches('unassigned', [], order(patch)), false);
  }
});

test('legacy single-garment orders use the order ID and the original djellaba workflow', () => {
  const legacy = order({ garmentType: undefined, items: undefined });
  assert.equal(matches('completedUndelivered', ['machine', 'finishing', 'mesbanto'].map(category => work(category, ['order-1'])), legacy), true);
  assert.equal(matches('completedUndelivered', complete(), legacy), false);
  assert.equal(matches('unassigned', [], legacy), true);
  assert.equal(matches('all'), false);
});
