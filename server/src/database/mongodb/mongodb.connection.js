import { MongoClient } from 'mongodb';

/**
 * Creates the official MongoDB client. The URI is never logged.
 * @param {object} config
 * @param {{ MongoClientClass?: typeof MongoClient }} [dependencies]
 * @returns {import('mongodb').MongoClient}
 */
export function createMongodbClientInstance(
  config,
  { MongoClientClass = MongoClient } = {},
) {
  return new MongoClientClass(config.uri, {
    appName: 'SyncSphere API',
    maxPoolSize: config.maxPoolSize,
    serverSelectionTimeoutMS: config.serverSelectionTimeout,
  });
}

/**
 * @param {import('mongodb').MongoClient} client
 * @param {string} databaseName
 * @returns {import('mongodb').Db}
 */
export function getMongodbDatabase(client, databaseName) {
  return client.db(databaseName);
}

/**
 * @param {import('mongodb').MongoClient} client
 */
export async function closeMongodbClient(client) {
  if (client === null || client === undefined) {
    return;
  }

  await client.close();
}
