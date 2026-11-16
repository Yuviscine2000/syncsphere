/**
 * Detects ASCII control characters without embedding a control-character regex.
 * @param {string} value
 * @returns {boolean}
 */
export function containsControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }

  return false;
}
