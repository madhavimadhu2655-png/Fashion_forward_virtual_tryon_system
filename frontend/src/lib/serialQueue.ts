/**
 * Runs async jobs strictly one after another. Compare Looks uses it so
 * several try-ons never run at once — the browser fit and the local GPU
 * model both use a lot of memory per job. Each job gets an AbortSignal;
 * cancelling a queued job removes it before it starts.
 */
export interface QueuedJob<T> {
  id: string;
  promise: Promise<T>;
  cancel: () => void;
}

export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;

  function enqueue<T>(id: string, run: (signal: AbortSignal) => Promise<T>): QueuedJob<T> {
    const controller = new AbortController();
    pending++;
    const promise = tail
      .catch(() => undefined)
      .then(() => {
        if (controller.signal.aborted) throw new DOMException("Cancelled before it started", "AbortError");
        return run(controller.signal);
      })
      .finally(() => {
        pending--;
      });
    tail = promise.catch(() => undefined);
    return { id, promise, cancel: () => controller.abort() };
  }

  return { enqueue, size: () => pending };
}
