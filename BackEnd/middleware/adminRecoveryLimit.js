import { createHash } from 'node:crypto';

// Bounded, expiring buckets: protect the public recovery endpoints without
// retaining email addresses or recovery credentials in process memory.
export function createRecoveryLimit({ limit = 10, windowMs = 15 * 60_000, capacity = 2000, now = Date.now, key = req => req.ip } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
    const id = createHash('sha256').update(String(key(req))).digest('hex');
    let bucket = buckets.get(id);
    if (!bucket) {
      if (buckets.size >= capacity) return res.set('Retry-After', String(Math.ceil(windowMs / 1000))).status(429).json({ message: 'recoveryRateLimited' });
      bucket = { count: 0, until: time + windowMs }; buckets.set(id, bucket);
    }
    if (++bucket.count > limit) return res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - time) / 1000)))).status(429).json({ message: 'recoveryRateLimited' });
    next();
  };
}
