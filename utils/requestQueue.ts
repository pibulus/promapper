/**
 * Minimal client-side queue so AI requests run one at a time.
 * Prevents users from spamming /api/process and /api/append in parallel.
 */

type QueuedTask<T> = (ctx: { signal: AbortSignal }) => Promise<T>;

class RequestQueue {
  #chain: Promise<unknown> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#chain.then(() => task());
    this.#chain = result.catch(() => {});
    return result;
  }
}

const queue = new RequestQueue();

export function enqueueApiRequest<T>(
  task: QueuedTask<T>,
  timeoutMs = 45_000,
): Promise<T> {
  return queue.enqueue(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    return task({ signal: controller.signal })
      .catch((err) => {
        // Translate our own timeout abort into something a human can act on
        // (callers surface err.message in a toast — "The operation was
        // aborted" reads like a crash).
        if (timedOut) {
          throw new Error("Request timed out — please try again.");
        }
        throw err;
      })
      .finally(() => clearTimeout(timeoutId));
  });
}
