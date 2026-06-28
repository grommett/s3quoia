import { LRUCache } from 'lru-cache';

import S3 from './s3/s3.js';
export { bigintReplacer } from './utils/bigint-replacer.js';
import { logger } from './utils/logger.js';
import { mergeSettings } from './utils/file-settings/file-settings.js';
import { query as execQuery } from './duck-db/index.js';
import QueryParserPlugin from './plugins/query-parser/query-parser.js';
import QueryFinalizerPlugin from './plugins/query-finalizer/query-finalizer.js';
export { default as FSPurgePlugin } from './plugins/fs-purge/fs-purge-plugin.js';

const listingCache = new LRUCache({ max: 1000 });

/**
 * Downloads files from S3-compatible storage and executes a DuckDB SQL query against them.
 *
 * @param {object} options
 * @param {string} [options.apiKey] - IBM Cloud API key. When provided, IBM IAM token auth is used instead of HMAC.
 * @param {string} [options.accessKeyId] - HMAC access key ID. Required when not using `apiKey`.
 * @param {string} [options.secretAccessKey] - HMAC secret access key. Required when not using `apiKey`.
 * @param {string} options.defaultEndpoint - S3 endpoint URL used when no {endpoint:} token is present in the query.
 * @param {string} options.defaultBucket - Bucket used when no {bucket:} token is present in the query.
 * @param {string} options.bucketsDir - Local directory for caching downloaded files.
 * @param {string} options.query - DuckDB SQL query. Supports date tokens, location tokens, and glob patterns.
 * @param {number} [options.from] - Start of date range as a Unix timestamp in milliseconds. Required when using date tokens.
 * @param {number} [options.to] - End of date range as a Unix timestamp in milliseconds. Required when using date tokens.
 * @param {string} [options.format] - Output format. `'jsonRecords'` returns `[{ col: val }]`. Default is columnar `[{ name, fields: [val, ...] }]`.
 * @param {object[]} [options.plugins] - Additional plugins for query parsing or file processing.
 * @returns {Promise<Array>} Query results in the requested format.
 */
export default function s3Querier({
  to,
  from,
  bucketsDir,
  defaultEndpoint,
  defaultBucket,
  query,
  plugins = [],
  apiKey,
  accessKeyId,
  secretAccessKey,
  format,
}) {
  const systemPlugins = [new QueryParserPlugin(), ...plugins, new QueryFinalizerPlugin()];
  const {
    query: rawQuery,
    fileSettings,
    settings: downloadSettings,
  } = processQuery(systemPlugins, {
    query,
    endpoint: defaultEndpoint,
    defaultBucket,
    bucketsDir,
  });

  const downloadPromises = startDownloads({
    apiKey,
    accessKeyId,
    secretAccessKey,
    bucketsDir,
    to,
    from,
    downloadSettings,
    plugins: systemPlugins,
  });

  return Promise.allSettled(downloadPromises).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') throw result.reason;
    });
    const downloadedPaths = results.flatMap((result) => result.value);
    const finalQuery = runFinalizers({ plugins: systemPlugins, rawQuery, fileSettings, downloadedPaths, bucketsDir });
    const queryCallbacks = runPreQuery(systemPlugins, { sql: finalQuery, downloadedPaths, bucketsDir });
    return execQuery(finalQuery, { format }).then((result) => {
      runPostQuery(systemPlugins, { result, downloadedPaths, bucketsDir }, queryCallbacks);
      return result;
    });
  });
}

/**
 * Orchestrates:
 *  - Passing the query through to each plugin
 *  - Merging file download settings
 *
 * @param {Array} plugins
 * @param {object} context
 * @returns
 */
function processQuery(plugins = [], { query = '', endpoint, defaultBucket, bucketsDir }) {
  const processedQuery = plugins.reduce((result, plugin) => plugin.processQuery(result), {
    endpoint,
    defaultBucket,
    bucketsDir,
    query,
    settings: [],
  });
  const fileSettings = processedQuery.settings;
  processedQuery.settings = mergeSettings(processedQuery.settings);
  return { ...processedQuery, fileSettings };
}

/**
 * Passes the raw query through each plugin's `finalizeQuery` lifecycle method,
 * substituting exact downloaded paths in place of glob patterns.
 *
 * @param {object} params
 * @param {object[]} params.plugins - Plugin instances to run finalizers on.
 * @param {string} params.rawQuery - SQL with original file references and date/location tokens.
 * @param {object[]} params.fileSettings - Pre-merge per-file settings from processQuery.
 * @param {string[]} params.downloadedPaths - Absolute local paths of all downloaded files.
 * @param {string} params.bucketsDir - Root directory where files are cached locally.
 * @returns {string} Finalized SQL ready for DuckDB execution.
 */
function runFinalizers({ plugins, rawQuery, fileSettings, downloadedPaths, bucketsDir }) {
  return plugins.reduce((query, plugin) => {
    if (!plugin.finalizeQuery) return query;
    return plugin.finalizeQuery(query, fileSettings, downloadedPaths, bucketsDir);
  }, rawQuery);
}

/**
 * Starts the download process
 *
 * @param {object} params Request query params
 * @param {object[]} settings Settings derived from query and merged
 * @returns {Promise[]} An array of promises for file downloads in each bucket
 */
function startDownloads({ to, from, downloadSettings, bucketsDir, apiKey, accessKeyId, secretAccessKey, plugins }) {
  return downloadSettings.map((setting) => {
    const { endpoint, bucket, filePatterns, staticFiles } = setting;
    const s3 = new S3({
      apiKey,
      accessKeyId,
      secretAccessKey,
      endpoint,
      bucket,
      mount: `${bucketsDir}/${bucket}`,
      listingCache,
      plugins,
    });
    return s3.downloadFiles({ to: Number(to), from: Number(from), filePatterns, staticFiles });
  });
}

function runPreQuery(plugins, context) {
  return plugins.map((plugin) => plugin.preQuery?.(context) ?? null);
}

function runPostQuery(plugins, context, callbacks = []) {
  plugins.forEach((plugin, index) => {
    const cb = callbacks[index];
    if (cb) Promise.resolve(cb(context)).catch((error) => logger.error(error));
    if (plugin.postQuery) Promise.resolve(plugin.postQuery(context)).catch((error) => logger.error(error));
  });
}
