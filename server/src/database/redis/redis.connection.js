import { createClient } from 'redis';
import { DATABASE_STATUS } from '../../constants/database.constants.js';

const BASE_RECONNECT_DELAY_MS = 100;
const MAX_RECONNECT_DELAY_MS = 3_000;
const QUIT_TIMEOUT_MS = 2_000;

/**
 * Creates a bounded exponential backoff strategy. Returning an Error tells
 * node-redis to stop reconnecting.
 * @param {number} maxRetries
 * @returns {(retries: number) => number|Error}
 */
export function createRedisReconnectStrategy(maxRetries) {
  return (retries) => {
    if (retries > maxRetries) {
      return new Error('Redis reconnect retry limit exceeded');
    }

    const exponent = Math.max(0, retries - 1);
    return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** exponent, MAX_RECONNECT_DELAY_MS);
  };
}

/**
 * Creates the official Redis client without exposing the URL in logs.
 * @param {object} config
 * @param {{ createClient?: typeof createClient }} [dependencies]
 * @returns {import('redis').RedisClientType}
 */
export function createRedisClientInstance(
  config,
  { createClient: createClientFactory = createClient } = {},
) {
  return createClientFactory({
    url: config.url,
    socket: {
      connectTimeout: config.connectTimeout,
      reconnectStrategy: createRedisReconnectStrategy(config.maxRetries),
    },
  });
}

/**
 * Returns non-sensitive connection identifiers for logs.
 * @param {string} url
 * @returns {{ host: string, port: number, database: string, tls: boolean }}
 */
export function describeRedisTarget(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port.length > 0 ? Number(parsed.port) : 6379,
      database: parsed.pathname.replace(/^\//, '') || '0',
      tls: parsed.protocol === 'rediss:',
    };
  } catch {
    return { host: 'unknown', port: 6379, database: '0', tls: false };
  }
}

/**
 * @param {import('redis').RedisClientType} client
 * @returns {Promise<string>}
 */
export async function checkRedisHealth(client) {
  try {
    return (await client.ping()) === 'PONG'
      ? DATABASE_STATUS.CONNECTED
      : DATABASE_STATUS.UNAVAILABLE;
  } catch {
    return DATABASE_STATUS.UNAVAILABLE;
  }
}

/**
 * @param {import('redis').RedisClientType} client
 */
export async function closeRedisClient(client) {
  if (client === null || client === undefined) {
    return;
  }

  if (client.isOpen !== true || client.isReady === false) {
    client.destroy?.();
    return;
  }

  let timeout;

  try {
    await Promise.race([
      client.quit(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Redis quit timed out')),
          QUIT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    client.destroy?.();
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
