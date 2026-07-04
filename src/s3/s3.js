import fsPromise from 'node:fs/promises';
import { dirname } from 'node:path';
import { S3Client, paginateListObjectsV2, GetObjectCommand } from '@aws-sdk/client-s3';

import { logger } from '../utils/logger.js';
import { runPreListFiles, runPostListFiles, runPreDownloadFiles, runPostDownloadFiles } from '../plugins/lifecycle.js';
import { datesInRange, hoursInRange, monthsInRange, buildPath } from '../utils/file-path-builder/file-path-builder.js';
import { regexFromPattern } from '../utils/date-regex/date-regex.js';
import { buildIbmIamClient } from './auth/ibm-iam-client.js';

export default class S3 {
  constructor({
    apiKey,
    accessKeyId,
    secretAccessKey,
    endpoint,
    region = 'us-east-1',
    bucket,
    mount = '.',
    listingCache,
    plugins,
  }) {
    this.bucket = bucket;
    this.s3 = buildS3Client({ apiKey, accessKeyId, secretAccessKey, endpoint, region });
    this.mount = mount;
    this.downloadFile = this.downloadFile.bind(this);
    this.resetEnqueued = this.resetEnqueued.bind(this);
    this.listFiles = this.listFiles.bind(this);
    this.enqueuedFiles = new Map();
    this.listingCache = listingCache || new Map();
    this.plugins = plugins;
  }

  /**
   * 1. List files in date range matching file patterns
   * 2. Begin downloads of an array of files from S3
   *
   * @typedef {object} DownloadSettings
   * @property {Date} from Start time
   * @property {Date} to End time
   * @property {string[]} filePatterns An array of file patterns
   * @property {string[]} staticFiles An array of static files
   *
   * @param {DownloadSettings} downloadSettings Settings for downloading
   * @returns {PromiseSettledResult<string[]>} Promise result for each file downloaded
   */
  async downloadFiles({ from, to, filePatterns = [], staticFiles = [] }) {
    const listPromises = filePatterns.map((pattern) => this.getFilePathsFromPrefixes(from, to, pattern));
    const filePaths = await Promise.allSettled(listPromises).then((fileList) =>
      fileList.map((list) => list.value).flat(),
    );
    const stats = { start: new Date(), cacheHits: 0, cacheMisses: 0, enqueuedHits: 0, bytesDownloaded: 0 };
    const downloadCallbacks = runPreDownloadFiles(this.plugins, { bucket: this.bucket, from, to });
    const downloadedPaths = await this.downloadFileList([...filePaths, ...staticFiles], stats);
    const durationMs = new Date() - stats.start;

    runPostDownloadFiles(downloadCallbacks, {
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      enqueuedHits: stats.enqueuedHits,
      bytesDownloaded: stats.bytesDownloaded,
      durationMs,
      bucket: this.bucket,
    });

    return downloadedPaths;
  }

  /**
   * Downloads an array of files from S3
   *
   * @param {string[]} filePaths A list of files to download
   * @returns {PromiseSettledResult} A Promise that resolves to an array of file paths
   */
  downloadFileList(filePaths = [], stats = { cacheHits: 0, cacheMisses: 0, enqueuedHits: 0, bytesDownloaded: 0 }) {
    this.preFlightCheck(filePaths);

    const filesPromises = this.startDownloads(stats, filePaths);

    return Promise.allSettled(filesPromises)
      .then((results) => results.filter((result) => result.value).map((result) => result.value))
      .then(this.resetEnqueued);
  }

  /**
   * Returns a list of file paths from S3 listing for each date
   *
   * @param {Date|string} from From date
   * @param {Date|string} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} List of files for the given prefixes & file pattern
   */
  getFilePathsFromPrefixes(from, to, filePattern) {
    const { file, cache } = filePattern;
    const prefixes = this.createPrefixes(from, to, file);
    const listPromises = prefixes.map(this.listFiles);

    return Promise.allSettled(listPromises).then((results) => {
      const regex = regexFromPattern(file);
      this.evictTodayFromListingCache(file);

      return results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
        .flat()
        .filter((fileObject) => {
          return regex.test(fileObject.file);
        })
        .map((fileObject) => ({ file: fileObject.file, cache, size: fileObject.size }));
    });
  }

  /**
   * Returns a list of prefixes to use for S3 listing for files within a given date range
   *
   * @param {Date} from From date
   * @param {Date} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} The list of prefixes for filtering
   */
  createPrefixes(from, to, filePattern) {
    const prefixStrategy = this.prefixStrategy(from, to, filePattern);
    return prefixStrategy(from, to, filePattern);
  }

  /**
   * Determines which strategy to use to create S3 prefix queries
   *
   * @param {Date} from From date
   * @param {Date} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {(from:Date, to:Date, filePattern:string) => string[]} A function that creates a list of prefixes
   */
  prefixStrategy(from, to, filePattern) {
    const hasDayToken = /\{(dd|hh|mm)\}/.test(filePattern);
    const hasMonthToken = /\{(yyyy|MM)\}/.test(filePattern);
    const hasGlob = filePattern.includes('*');
    const hourDiff = (new Date(to) - new Date(from)) / 1000 / 60 / 60;

    if (hasDayToken && hourDiff < 24) return this.prefixHours;
    if (hasDayToken) return this.prefixDays;
    if (hasMonthToken) return this.prefixMonths;
    if (hasGlob) return this.prefixGlob;
    return (_from, _to, pattern) => [pattern];
  }

  /**
   * Returns a list of prefixes based on a range of hours
   *
   * @param {Date} from From date
   * @param {Date} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} The list of prefixes for filtering
   */
  prefixHours(from, to, filePattern) {
    const hourRange = hoursInRange(new Date(from), new Date(to));
    const [trimmed] = filePattern.split('{hh}');
    return hourRange.map((date) => {
      return buildPath(`${trimmed}{hh}`, date);
    });
  }

  /**
   * Returns a list of prefixes based on a range of days
   *
   * @param {Date} from From date
   * @param {Date} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} The list of prefixes for filtering
   */
  prefixDays(from, to, filePattern) {
    const dateRange = datesInRange(new Date(from), new Date(to));
    const [trimmed] = filePattern.split('{dd}');

    return dateRange.map((date) => {
      return buildPath(`${trimmed}{dd}`, date);
    });
  }

  /**
   * Returns a list of prefixes based on a range of months, one per calendar month.
   * Used for Hive-style paths with {yyyy}/{MM} tokens but no {dd}.
   *
   * @param {Date} from From date
   * @param {Date} to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} The list of prefixes for filtering
   */
  prefixMonths(from, to, filePattern) {
    const monthRange = monthsInRange(new Date(from), new Date(to));
    const splitToken = filePattern.includes('{MM}') ? '{MM}' : '{yyyy}';
    const [trimmed] = filePattern.split(splitToken);
    return monthRange.map((date) => buildPath(`${trimmed}${splitToken}`, date));
  }

  /**
   * Returns a single entry array with a file pattern trimmed to the first glob
   *
   * @param {Date} _from From date
   * @param {Date} _to To date
   * @param {string} filePattern The file pattern to use
   * @returns {string[]} The single entry array with a file pattern trimmed to the first glob
   */
  prefixGlob(_from, _to, filePattern) {
    const [trimmed] = filePattern.split('*');
    return [trimmed];
  }

  /**
   * Returns the file pattern for current time
   * We need this so we can remove this from cache keys if it exists
   *
   * @param {string} filePattern File pattern
   * @returns {string}
   */
  getTodayPrefix(filePattern) {
    const [trimmed] = filePattern.split('{dd}');
    return buildPath(`${trimmed}{dd}`, new Date());
  }

  /**
   * Removes all listing cache entries whose key falls under today's day prefix.
   * Covers day-level, hour-level, and minute-level cache keys in one pass.
   *
   * @param {string} filePattern File pattern
   */
  evictTodayFromListingCache(filePattern) {
    const todayPrefix = `${this.bucket}/${this.getTodayPrefix(filePattern)}`;
    [...this.listingCache.keys()]
      .filter((key) => key.startsWith(todayPrefix))
      .forEach((key) => this.listingCache.delete(key));
  }

  /**
   * Returns a list of files from S3 under the given prefix
   *
   * @param {string} prefix The prefix to use when querying S3
   * @returns {Promise<string[]>} A Promise that resolves to an Array of S3 file paths found under the `prefix`
   */
  async listFiles(prefix) {
    const cacheKey = `${this.bucket}/${prefix}`;
    const start = new Date();
    const listCallbacks = runPreListFiles(this.plugins, { prefix, bucket: this.bucket });

    if (this.listingCache.has(cacheKey)) {
      const files = this.listingCache.get(cacheKey);
      runPostListFiles(listCallbacks, {
        prefix,
        bucket: this.bucket,
        files,
        durationMs: new Date() - start,
        cacheHit: true,
      });
      return files;
    }

    const files = [];
    for await (const page of paginateListObjectsV2({ client: this.s3 }, { Bucket: this.bucket, Prefix: prefix })) {
      page.Contents?.forEach((content) => files.push({ file: content.Key, size: content.Size }));
    }

    this.listingCache.set(cacheKey, files);
    runPostListFiles(listCallbacks, {
      prefix,
      bucket: this.bucket,
      files,
      durationMs: new Date() - start,
      cacheHit: false,
    });
    return files;
  }

  /**
   * Resets enqueued files
   *
   * @param {PromiseSettledResult} fileDLPromises Results of all the files downloaded
   * @returns {PromiseSettledResult} Results of all the files downloaded
   */
  resetEnqueued(fileDLPromises) {
    fileDLPromises.forEach((fileDownloadPromise) => {
      if (fileDownloadPromise.status === 'rejected') {
        this.enqueuedFiles.delete(fileDownloadPromise.reason);
      }
      if (fileDownloadPromise.status === 'fulfilled') {
        this.enqueuedFiles.delete(fileDownloadPromise.value);
      }
    });
    return fileDLPromises;
  }

  /**
   * Starts the download for all files
   *
   * @param {object} stats Stats to write to
   * @param {string[]} filePaths An array of file paths
   * @returns {Promise[]} An array of promises resolving when a download is complete and written
   */
  startDownloads(stats, filePaths) {
    return filePaths.map((fileObject) => {
      const { file } = fileObject;
      if (this.enqueuedFiles.has(file)) {
        stats.enqueuedHits += 1;
        return this.enqueuedFiles.get(file);
      }
      const filePromise = this.downloadFile(stats, fileObject);
      this.enqueuedFiles.set(file, filePromise);
      return filePromise;
    });
  }

  /**
   * Wrapper decides which download strategy to use. One of:
   *   - Check cache before downloading
   *   - Don't check cache and always download
   *
   * @param {object} stats The stats object to write file cache stats to
   * @param {object} fileObject The file object
   * @returns {Promise<object>} A Promise that resolves to the file path object
   */
  downloadFile(stats, fileObject) {
    if (fileObject.cache === false) return this.downloadFileForced(stats, fileObject);
    return this.downloadFileCache(stats, fileObject);
  }

  /**
   * A download strategy that checks cache before downloading
   * Default strategy
   *
   * @param {object} stats The stats object to write file stats to
   * @param {object} fileObject The file object
   * @returns {Promise<object>} A Promise that resolves to the file path object
   */
  downloadFileCache(stats, fileObject) {
    const { file, size } = fileObject;
    const dir = dirname(`${this.mount}/${file}`);
    return fsPromise
      .stat(`${this.mount}/${file}`)
      .then(() => {
        stats.cacheHits += 1;
        return this.processFile(`${this.mount}/${file}`);
      })
      .catch(() => {
        return fsPromise
          .mkdir(dir, { recursive: true })
          .then(() => {
            stats.cacheMisses += 1;
            stats.bytesDownloaded += size;
            return this.objectToFile(file);
          })
          .catch(() => {
            return Promise.reject(file);
          });
      });
  }

  /**
   * A download strategy that does not check cache before downloading.
   *
   * @param {object} stats The stats object to write file stats to
   * @param {object} fileObject The file object
   * @returns {Promise<object>} A Promise that resolves to the file path object
   */
  downloadFileForced(stats, fileObject) {
    const { file, size } = fileObject;
    const dir = dirname(`${this.mount}/${file}`);
    return fsPromise
      .mkdir(dir, { recursive: true })
      .then(() => {
        stats.cacheMisses += 1;
        stats.bytesDownloaded += size;
        return this.objectToFile(file);
      })
      .catch(() => {
        return Promise.reject(file);
      });
  }

  /**
   * Downloads an S3 object and writes it to the local filesystem.
   *
   * @param {string} key The S3 object key
   * @returns {Promise<string>} The local file path the object was written to
   */
  async objectToFile(key) {
    const file = `${this.mount}/${key}`;
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      await fsPromise.writeFile(tmp, Buffer.concat(chunks));
      await fsPromise.rename(tmp, file);
      return this.processFile(file);
    } catch (error) {
      logger.error(`${error.$metadata?.httpStatusCode ?? error.statusCode} - ${file}`);
      await fsPromise.unlink(tmp).catch(() => {});
      throw error;
    }
  }

  /**
   * Passes a downloaded file path to possibly be further processed by a plugin.
   * For example, the Avro plugin processes .avro files to json
   *
   * @param {string} file
   * @returns {Promise} A Promise that resolves when after file is processed by one or more plugins.
   */
  processFile(file) {
    return this.plugins.reduce((promise, plugin) => {
      if (!plugin.processFile) return promise;
      return promise.then((currentFile) => plugin.processFile(currentFile));
    }, Promise.resolve(file));
  }

  /**
   * Checks the accumulated value of bytes preflight.
   * Throws if it exceeds `process.env.MAX_MB_DOWNLOAD` or the default
   *
   * @param {object[]} filePaths An array of file path objects
   * @returns true
   */
  preFlightCheck(filePaths) {
    const totalBytes = filePaths.reduce((total, fileObject) => total + fileObject.size, 0);
    const totalMB = totalBytes / 1e6;
    const maxMB = process.env.MAX_MB_DOWNLOAD ? Number(process.env.MAX_MB_DOWNLOAD) : 1000;

    if (totalMB > maxMB) {
      throw new Error(`The total file size required for this query (${totalMB} MBs) exceeds ${maxMB} MBs`);
    }

    return true;
  }
}

export function buildS3Client({ apiKey, accessKeyId, secretAccessKey, endpoint, region = 'us-east-1' }) {
  const config = { ...(endpoint && { endpoint }), region, forcePathStyle: true };

  if (apiKey) return buildIbmIamClient(config, apiKey);
  return new S3Client({ ...config, credentials: { accessKeyId, secretAccessKey } });
}
