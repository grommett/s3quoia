import { regexFromPattern } from '../../utils/date-regex/date-regex.js';
import {
  removeFileSettingTokens,
  removeDoubleFwdSlash,
  removeCacheSettings,
} from '../../utils/file-settings/file-settings.js';

export default class QueryFinalizerPlugin {
  name = 'CorePlugin';

  processQuery(context) {
    return context;
  }

  /**
   * Replaces each SQL file reference with the exact local paths downloaded from S3.
   * Called after all downloads complete so that DuckDB receives precise file paths
   * rather than glob patterns that would scan the entire local cache.
   *
   * @param {string} rawQuery - SQL with original file references and date/location tokens
   * @param {object[]} fileSettings - Pre-merge per-file settings from processQuery
   * @param {string[]} downloadedPaths - Absolute local paths of all downloaded files
   * @param {string} bucketsDir - Root directory where files are cached locally
   * @returns {string} Finalized SQL ready for DuckDB execution
   */
  finalizeQuery(rawQuery, fileSettings, downloadedPaths, bucketsDir) {
    let prepared = fileSettings.reduce(
      (query, setting) => applyFileSetting(query, setting, downloadedPaths, bucketsDir),
      rawQuery,
    );
    prepared = removeFileSettingTokens(prepared);
    prepared = removeCacheSettings(prepared);
    prepared = removeDoubleFwdSlash(prepared);
    return prepared;
  }
}

/** Helpers */

function applyFileSetting(query, { sqlFileReference, file, bucket }, downloadedPaths, bucketsDir) {
  const localDir = `${bucketsDir}/${bucket}/`;
  const filePattern = regexFromPattern(file);
  const matchingPaths = downloadedPaths.filter((localPath) => matchesPattern(localPath, localDir, filePattern));
  const searchStr = sqlFileReference.replace(/\?cache=(true|false)/i, '');

  if (matchingPaths.length === 0) throw new Error(`No files found for: ${file}`);
  if (matchingPaths.length > 1) return replaceWithArray(query, searchStr, matchingPaths);

  return query.replace(new RegExp(escapeForRegex(searchStr), 'gi'), matchingPaths[0]);
}

function matchesPattern(localPath, localDir, filePattern) {
  return localPath.startsWith(localDir) && filePattern.test(localPath.slice(localDir.length));
}

function replaceWithArray(query, searchStr, paths) {
  const arrayLiteral = `[${paths.map((path) => `'${path}'`).join(', ')}]`;
  return query.replace(new RegExp(`['"]${escapeForRegex(searchStr)}['"]`, 'gi'), arrayLiteral);
}

function escapeForRegex(str) {
  return str
    .replace(/\*/g, '\\*')
    .replace(/\./g, '\\.')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\+/g, '\\+');
}
