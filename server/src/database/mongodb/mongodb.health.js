import { DATABASE_STATUS } from '../../constants/database.constants.js';

/**
 * @param {import('mongodb').MongoClient} client
 * @returns {Promise<string>}
 */
export async function checkMongodbHealth(client) {
  try {
    const result = await client.db('admin').command({ ping: 1 });
    return result?.ok === 1 ? DATABASE_STATUS.CONNECTED : DATABASE_STATUS.UNAVAILABLE;
  } catch {
    return DATABASE_STATUS.UNAVAILABLE;
  }
}
