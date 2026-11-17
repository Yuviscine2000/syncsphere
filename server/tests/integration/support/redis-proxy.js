import net from 'node:net';

/**
 * Creates a local TCP proxy in front of Redis so integration tests can
 * interrupt the network path without stopping the real Redis service.
 * @param {{
 *   targetHost?: string,
 *   targetPort?: number,
 *   port?: number,
 * }} options
 */
export async function createRedisProxy({
  targetHost = '127.0.0.1',
  targetPort = 6379,
  port = 0,
} = {}) {
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);

    sockets.add(client);
    sockets.add(upstream);

    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => {
      sockets.delete(client);
    });
    upstream.on('close', () => {
      sockets.delete(upstream);
    });
    client.pipe(upstream);
    upstream.pipe(client);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (typeof address !== 'object' || address === null) {
    throw new Error('Redis proxy did not expose a TCP address.');
  }

  return {
    port: address.port,
    url: `redis://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }

      sockets.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
