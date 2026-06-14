/**
 * JSON.stringify replacer that converts BigInt values to Number.
 * Use this when serializing jsonRecords results that may contain BigInt columns
 * (e.g. COUNT(*), SUM of integer columns). Note: values above Number.MAX_SAFE_INTEGER
 * will lose precision — cast to INTEGER in SQL if exact large values matter.
 *
 * @param {string} _ - The key (unused)
 * @param {*} val - The value to serialize
 * @returns {*}
 */
export function bigintReplacer(_, val) {
  return typeof val === 'bigint' ? Number(val) : val;
}
