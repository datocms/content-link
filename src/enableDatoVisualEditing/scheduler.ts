/**
 * Debounce repeated stamp requests within a microtask to avoid thrashing.
 */
export function createScheduler(fn: () => void): () => void {
  let pending = false;

  const enqueue =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (cb: () => void) => Promise.resolve().then(cb);

  return () => {
    if (pending) {
      return;
    }
    pending = true;
    enqueue(() => {
      pending = false;
      fn();
    });
  };
}
