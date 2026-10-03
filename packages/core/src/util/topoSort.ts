export interface TopoResult<T> {
  /** Items in a valid evaluation order: every item appears after everything it depends on. */
  order: T[];
  /** Items that could not be ordered because they sit on (or depend on) a dependency cycle. */
  cyclic: T[];
}

/**
 * Stable topological sort (Kahn's algorithm, O(items + edges)).
 *
 * Ready items are processed first-in-first-out in input order, so the result is
 * deterministic and independent items keep their relative input order.
 * Dependencies naming a key that isn't in `items` are ignored -- callers report
 * those separately as "undefined reference" errors.
 */
export function topoSort<T>(items: readonly T[], keyOf: (item: T) => string, depsOf: (item: T) => Iterable<string>): TopoResult<T> {
  const indexByKey = new Map<string, number>();
  items.forEach((item, i) => {
    const key = keyOf(item);
    if (!indexByKey.has(key)) indexByKey.set(key, i);
  });

  const pending = new Array<number>(items.length).fill(0);
  const dependents: number[][] = items.map(() => []);
  items.forEach((item, i) => {
    for (const depKey of new Set(depsOf(item))) {
      const depIndex = indexByKey.get(depKey);
      if (depIndex === undefined) continue;
      pending[i]++;
      dependents[depIndex].push(i);
    }
  });

  const queue: number[] = [];
  pending.forEach((count, i) => {
    if (count === 0) queue.push(i);
  });

  const order: T[] = [];
  const done = new Set<number>();
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    done.add(i);
    order.push(items[i]);
    for (const dependent of dependents[i]) {
      if (--pending[dependent] === 0) queue.push(dependent);
    }
  }

  const cyclic = items.filter((_, i) => !done.has(i));
  return { order, cyclic };
}
