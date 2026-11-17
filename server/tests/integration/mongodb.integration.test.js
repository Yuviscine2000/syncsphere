import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';
import { uniqueName } from './support/unique-values.js';

describe('real MongoDB integration', () => {
  let context;
  let mongodb;
  let database;
  const collectionNames = new Set();

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context);
    mongodb = context.databaseManager.getClient('mongodb');
    database = mongodb.getDatabase();
  });

  afterAll(async () => {
    if (database !== undefined) {
      for (const collectionName of collectionNames) {
        await database.collection(collectionName).drop().catch(() => {});
      }
    }

    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('pings the selected database and performs collection CRUD', async () => {
    const ping = await database.command({ ping: 1 });
    expect(ping.ok).toBe(1);

    const collectionName = uniqueName('mongodb_crud');
    collectionNames.add(collectionName);
    await database.createCollection(collectionName);
    const collection = database.collection(collectionName);

    const email = `${uniqueName('mongodb')}@example.test`;
    const insert = await collection.insertOne({ email, fullName: 'MongoDB User', active: true });
    expect(insert.insertedId).toBeDefined();

    const found = await collection.findOne({ _id: insert.insertedId });
    expect(found.email).toBe(email);

    const update = await collection.updateOne(
      { _id: insert.insertedId },
      { $set: { fullName: 'MongoDB Updated User' } },
    );
    expect(update.modifiedCount).toBe(1);

    const updated = await collection.findOne({ _id: insert.insertedId });
    expect(updated.fullName).toBe('MongoDB Updated User');

    const deleted = await collection.deleteOne({ _id: insert.insertedId });
    expect(deleted.deletedCount).toBe(1);
    await expect(collection.findOne({ _id: insert.insertedId })).resolves.toBeNull();
  });

  it('creates a unique index and rejects duplicate documents', async () => {
    const collectionName = uniqueName('mongodb_index');
    collectionNames.add(collectionName);
    const collection = database.collection(collectionName);
    const email = `${uniqueName('mongodb-index')}@example.test`;

    await collection.createIndex({ email: 1 }, { unique: true, name: 'uq_email' });
    const indexes = await collection.listIndexes().toArray();
    expect(indexes.some((index) => index.name === 'uq_email' && index.unique === true)).toBe(
      true,
    );

    await collection.insertOne({ email });

    let duplicateError;
    try {
      await collection.insertOne({ email });
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError?.code).toBe(11_000);
  });

  it('closes and reconnects a real MongoDB client', async () => {
    const reconnectContext = createIntegrationDatabase();
    await initializeIntegrationDatabase(reconnectContext);

    const firstClient = reconnectContext.databaseManager.getClient('mongodb');
    await expect(firstClient.getDatabase().command({ ping: 1 })).resolves.toMatchObject({
      ok: 1,
    });

    await closeIntegrationDatabase(reconnectContext);

    const secondContext = createIntegrationDatabase();
    await initializeIntegrationDatabase(secondContext);

    const secondClient = secondContext.databaseManager.getClient('mongodb');
    await expect(secondClient.getDatabase().command({ ping: 1 })).resolves.toMatchObject({
      ok: 1,
    });

    await closeIntegrationDatabase(secondContext);
  });

  it('rejects database access after the client is closed', async () => {
    const closedContext = createIntegrationDatabase();
    await initializeIntegrationDatabase(closedContext);
    const client = closedContext.databaseManager.getClient('mongodb');
    await closeIntegrationDatabase(closedContext);

    let accessError;
    try {
      client.getDatabase();
    } catch (error) {
      accessError = error;
    }

    expect(accessError).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
});
