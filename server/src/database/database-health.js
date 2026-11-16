import { DATABASE_STATUS } from '../constants/database.constants.js';

/**
 * Resolves with the promise result or rejects after the timeout.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withTimeout(promise, timeoutMs, message) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Runs each configured dependency health check with a bounded timeout.
 * @param {Record<string, object>} clients
 * @param {string[]} names
 * @param {number} timeoutMs
 * @returns {Promise<Record<string, string>>}
 */
export async function collectDependencyHealth(clients, names, timeoutMs) {
  const entries = await Promise.all(
    names.map(async (name) => {
      const client = clients[name];

      if (client === null || client === undefined || client.isConfigured !== true) {
        return [name, DATABASE_STATUS.NOT_CONFIGURED];
      }

      try {
        const status = await withTimeout(
          Promise.resolve(client.checkHealth()),
          timeoutMs,
          `${name} health check timed out`,
        );
        return [name, status];
      } catch {
        return [name, DATABASE_STATUS.UNAVAILABLE];
      }
    }),
  );

  return Object.fromEntries(entries);
}

/**
 * Evaluates readiness from the current dependency statuses.
 * Optional dependencies are reported but never make the service unready.
 * @param {{
 *   dependencies: Record<string, string>,
 *   requiredDependencies: string[],
 *   optionalDependencies: string[],
 * }} options
 * @returns {{
 *   status: 'ready'|'not_ready',
 *   dependencies: Record<string, string>,
 *   requiredDependencies: string[],
 *   optionalDependencies: string[],
 * }}
 */
export function evaluateReadiness({
  dependencies,
  requiredDependencies,
  optionalDependencies,
}) {
  const requiredReady = requiredDependencies.every(
    (name) => dependencies[name] === DATABASE_STATUS.CONNECTED,
  );

  return {
    status: requiredReady ? 'ready' : 'not_ready',
    dependencies,
    requiredDependencies: [...requiredDependencies],
    optionalDependencies: [...optionalDependencies],
  };
}

/**
 * @param {{
 *   clients: Record<string, object>,
 *   names: string[],
 *   requiredDependencies: string[],
 *   optionalDependencies: string[],
 *   timeoutMs: number,
 * }} options
 * @returns {Promise<{
 *   status: 'ready'|'not_ready',
 *   dependencies: Record<string, string>,
 *   requiredDependencies: string[],
 *   optionalDependencies: string[],
 * }>}
 */
export async function checkDatabaseReadiness({
  clients,
  names,
  requiredDependencies,
  optionalDependencies,
  timeoutMs,
}) {
  const dependencies = await collectDependencyHealth(clients, names, timeoutMs);

  return evaluateReadiness({
    dependencies,
    requiredDependencies,
    optionalDependencies,
  });
}
