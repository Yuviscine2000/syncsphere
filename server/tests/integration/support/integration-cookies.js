function readSetCookieHeaders(response) {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
}

/**
 * Extracts a cookie value from a response Set-Cookie header.
 * @param {{ headers: Record<string, unknown> }} response
 * @param {string} name
 * @returns {string|undefined}
 */
export function readCookie(response, name) {
  for (const header of readSetCookieHeaders(response)) {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');

    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1));
    }
  }

  return undefined;
}

/**
 * @param {Record<string, string|undefined>} cookies
 * @returns {string}
 */
export function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}
