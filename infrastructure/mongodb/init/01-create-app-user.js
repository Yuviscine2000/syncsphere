const databaseName =
  process.env.MONGODB_DATABASE || process.env.MONGO_INITDB_DATABASE || 'syncsphere';
const username = process.env.MONGODB_APP_USERNAME;
const password = process.env.MONGODB_APP_PASSWORD;

if (!username || !password) {
  throw new Error('MONGODB_APP_USERNAME and MONGODB_APP_PASSWORD are required');
}

const applicationDatabase = db.getSiblingDB(databaseName);
const existingUser = applicationDatabase.getUser(username);

if (existingUser === null) {
  applicationDatabase.createUser({
    user: username,
    pwd: password,
    roles: [{ role: 'readWrite', db: databaseName }],
  });
}
