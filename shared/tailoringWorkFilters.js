import { tailoringGarmentType, tailoringOrderItems } from './tailoring.js';
import { workerClientPreviousStage, workerWorkCompleted } from './workerWork.js';

export const TAILORING_WORK_FILTERS = ['unassigned', 'completedUndelivered'];

export function tailoringRequiredWorkStages(order) {
  const garmentType = tailoringGarmentType(order);
  const stages = [garmentType === 'trousers' ? 'trousers' : 'mesbanto'];
  for (let previous; (previous = workerClientPreviousStage(stages[0], garmentType));) stages.unshift(previous);
  return stages;
}

export function matchesTailoringWorkFilter(order, filter, tracking) {
  if (!TAILORING_WORK_FILTERS.includes(filter)) return false;
  // Missing or failed tracking is unknown, never evidence of an unassigned order.
  const assignments = tracking?.byOrder?.[String(order._id)];
  if (tracking?.loading || tracking?.error || !Array.isArray(assignments) || order.cancelledAt || order.deliveredAt) return false;
  const lineIds = tailoringOrderItems(order).map(item => String(item.lineId));
  if (!lineIds.length) return false;
  const current = new Set(lineIds);
  const works = assignments.filter(work => !work.deletedAt && !work.relocatedAt && work.items?.some(item => current.has(String(item.lineId))));
  if (filter === 'unassigned') return works.length === 0;
  return tailoringRequiredWorkStages(order).every(category => {
    const stageWorks = works.filter(work => work.category === category);
    // Numeric partial completions do not identify individual garments. The job
    // must be complete before any of its linked garments can count as finished.
    if (stageWorks.some(work => !workerWorkCompleted(work) || work.remainingQuantity !== 0)) return false;
    const completed = new Set(stageWorks.flatMap(work => work.items.map(item => String(item.lineId))));
    return lineIds.every(id => completed.has(id));
  });
}
