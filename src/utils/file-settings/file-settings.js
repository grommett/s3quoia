const endPointRegexStr = '\\{endpoint:(?<endpoint>[a-z0-9-:/.]+)\\}';
const bucketRegexStr = '\\{bucket:(?<bucket>[a-z0-9-:/._]+)\\}';

/**
 * Merges endpoints and bucket file values
 *
 * @param {DownloadSetting[]} settings File settings (endpoint/bucket) parsed from the query
 * @returns {object[]} Settings merged on endpoint/buckets
 */
export function mergeSettings(settings = []) {
  const settingsMerged = settings.reduce((acc, setting) => {
    const { file, cache, endpoint, bucket } = setting;
    const key = `${endpoint}/${bucket}`;
    const tokenRegex = /\{|\*/;

    if (acc[key]) {
      if (tokenRegex.test(file)) acc[key].filePatterns.push({ file, cache });
      if (!tokenRegex.test(file)) acc[key].staticFiles.push({ file, cache });
      return acc;
    }

    acc[key] = {};
    acc[key].filePatterns = tokenRegex.test(file) ? [{ file, cache }] : [];
    acc[key].staticFiles = !tokenRegex.test(file) ? [{ file, cache }] : [];
    acc[key].endpoint = endpoint;
    acc[key].bucket = bucket;
    return acc;
  }, {});

  return Object.values(settingsMerged);
}

/**
 * Removes file setting tokens
 *
 * @param {string} query The query
 * @returns {string} The query with file setting tokens removed
 */
export function removeFileSettingTokens(query = '') {
  const endPointRegex = new RegExp(endPointRegexStr, 'gi');
  const bucketPointRegex = new RegExp(bucketRegexStr, 'gi');
  query = query.replace(endPointRegex, '');
  query = query.replace(bucketPointRegex, '');
  return query;
}

/**
 * Removes double / in file paths. Edge case where bucket paths start with /
 *
 * @param {string} query The query
 * @returns {string} The query with file setting tokens removed
 */
export function removeDoubleFwdSlash(query = '') {
  return query.replace(/\/\/+/g, '/');
}

/**
 * Removes ?cache=(true|false) from the file paths in the query
 *
 * @param {string} query The query
 * @returns {string} The query with file setting tokens removed
 */
export function removeCacheSettings(query = '') {
  return query.replace(/\?cache=(true|false)/gi, '');
}
