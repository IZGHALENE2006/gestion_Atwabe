export function readFabricSaleRecovery(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    return value?.snapshot?.match?.fabric?._id && value.snapshot.input && value.pending?.requestId && ['cash', 'credit'].includes(value.pending.mode) ? value : null;
  } catch { return null; }
}
