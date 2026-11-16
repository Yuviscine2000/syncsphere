import { DATABASE_STATUS } from '../../constants/database.constants.js';

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
