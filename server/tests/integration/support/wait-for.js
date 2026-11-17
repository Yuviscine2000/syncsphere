/**
 * Polls a predicate until it returns true or the timeout expires.
 * @param {() => boolean|Promise<boolean>} predicate
 * @param {{ timeoutMs?: number, intervalMs?: number, description?: string }} [options]
 */
export async function waitFor(
  predicate,
  { timeoutMs = 10_000, intervalMs = 50, description = 'condition' } = {},
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms.`);
}
