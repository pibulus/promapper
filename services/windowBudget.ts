/**
 * Sliding-window budgets — the pure core under requestGuard's daily limits.
 *
 * Separate module on purpose: requestGuard reads env at import time, which
 * makes it awkward to unit-test; this has no env, no I/O, just a Map and
 * arithmetic. Works for counted budgets (1 per call) and metered ones
 * (bytes per day) alike.
 */

export interface BudgetEntry {
  used: number;
  windowStart: number;
}

/**
 * Add `amount` to `key`'s budget for the current window. Returns true while
 * the total stays within `limit`, false once it's blown. Stale entries (any
 * key past its window) are swept opportunistically so the map can't grow
 * without bound as clients rotate.
 */
export function consumeWindowBudget(
  map: Map<string, BudgetEntry>,
  key: string,
  amount: number,
  limit: number,
  windowMs: number,
  now: number,
): boolean {
  for (const [k, e] of map) {
    if (now - e.windowStart > windowMs) map.delete(k);
  }
  const entry = map.get(key) ?? { used: 0, windowStart: now };
  entry.used += amount;
  map.set(key, entry);
  return entry.used <= limit;
}
