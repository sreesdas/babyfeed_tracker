/**
 * Generates a browser-compatible UUID (v4).
 * Uses crypto.randomUUID() if available, with a robust fallback.
 * @returns {string} A UUID v4 string.
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Robust fallback using crypto.getRandomValues
  // Reference: https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => {
    const b = parseInt(c, 16);
    return (b ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (b / 4)))).toString(16);
  });
}
