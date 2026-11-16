import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Creates the Argon2id password service. Hashing parameters are explicit and
 * configurable so deployments can tune memory/time cost deliberately.
 * @param {{ auth: { password: { argon2: { memoryCost: number, timeCost: number, parallelism: number } } } }} config
 * @param {{
 *   hash?: (password: string, options: object) => Promise<string>,
 *   verify?: (hash: string, password: string) => Promise<boolean>,
 * }} [dependencies]
 * @returns {object}
 */
export function createPasswordService(
  config,
  {
    hash = (password, options) => argon2.hash(password, options),
    verify = (hashValue, password) => argon2.verify(hashValue, password),
  } = {},
) {
  const options = {
    type: argon2.argon2id,
    memoryCost: config.auth.password.argon2.memoryCost,
    timeCost: config.auth.password.argon2.timeCost,
    parallelism: config.auth.password.argon2.parallelism,
    hashLength: 32,
  };

  let dummyHashPromise = null;

  function getDummyHash() {
    if (dummyHashPromise === null) {
      dummyHashPromise = hash(randomBytes(32).toString('base64url'), options);
    }

    return dummyHashPromise;
  }

  async function hashPassword(password) {
    return hash(password, options);
  }

  async function verifyPassword(passwordHash, password) {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Performs a verification even when no account exists so unknown-email and
   * wrong-password requests have comparable password-check work.
   * @param {string} password
   * @returns {Promise<false>}
   */
  async function verifyDummy(password) {
    const dummyHash = await getDummyHash();
    await verifyPassword(dummyHash, password);
    return false;
  }

  return {
    hashPassword,
    verifyPassword,
    verifyDummy,
  };
}
