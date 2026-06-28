import { LRUCache } from 'lru-cache';

import S3 from './s3/s3.js';
export { bigintReplacer } from './utils/bigint-replacer.js';
import { query as execQuery } from './duck-db/index.js';
import QueryParserPlugin from './plugins/query-parser/query-parser.js';
import QueryFinalizerPlugin from './plugins/query-finalizer/query-finalizer.js';
export { default as AvroPlugin } from './plugins/avro/avro-plugin.js';
export { default as FSPurgePlugin } from './plugins/fs-purge/fs-purge-plugin.js';
export { default as StatsPlugin } from './plugins/stats/stats-plugin.js';
import { processQuery, runFinalizers, runPreQuery, runPostQuery } from './plugins/lifecycle.js';

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
export default function s3quoia({
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
    const postQueryCallbacks = runPreQuery(systemPlugins, { sql: finalQuery, downloadedPaths, bucketsDir });

    return execQuery(finalQuery, { format }).then((result) => {
      runPostQuery(systemPlugins, { result, downloadedPaths, bucketsDir }, postQueryCallbacks);
      return result;
    });
  });
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
