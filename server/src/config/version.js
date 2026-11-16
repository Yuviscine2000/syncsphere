import { readFileSync } from 'node:fs';

/**
 * Reads the real application version from package metadata.
 * @returns {string}
 */
export function readPackageVersion() {
  const packageJsonUrl = new URL('../../package.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));

  if (parsed !== null && typeof parsed === 'object' && typeof parsed.version === 'string') {
    return parsed.version;
  }

  throw new Error('Unable to read the application version from package.json');
}
