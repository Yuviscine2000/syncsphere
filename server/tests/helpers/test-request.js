import http from 'node:http';
import supertest from 'supertest';
import { afterAll } from 'vitest';

const TEST_APP_HEADER = 'X-Test-App-Id';
const TEST_PORT_START = 20_000;
const TEST_PORT_COUNT = 10_000;
const apps = new Map();
let nextAppId = 0;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 1,
});

const server = http.createServer((req, res) => {
  const app = apps.get(req.headers[TEST_APP_HEADER.toLowerCase()]);

  if (!app) {
    res.statusCode = 500;
    res.end('Test application was not registered.');
    return;
  }

  app(req, res);
});

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function listenOnAvailablePort() {
  const firstOffset = process.pid % TEST_PORT_COUNT;

  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const port = TEST_PORT_START + ((firstOffset + attempt) % TEST_PORT_COUNT);

    try {
      await listen(port);
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error('Unable to find an available test server port.');
}

await listenOnAvailablePort();

const client = supertest(server);

export function request(app) {
  nextAppId += 1;
  const appId = String(nextAppId);
  apps.set(appId, app);

  return new Proxy(client, {
    get(target, property) {
      const value = target[property];

      if (typeof value !== 'function') {
        return value;
      }

      return (...args) =>
        value
          .apply(target, args)
          .set(TEST_APP_HEADER, appId)
          .agent(agent);
    },
  });
}

afterAll(async () => {
  agent.destroy();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});
