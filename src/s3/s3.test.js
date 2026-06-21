import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('S3', () => {
  let S3;

  before(async () => {
    S3 = await getS3withMocks({});
  });

  describe('constructor auth - HMAC', () => {
    let S3WithSpy;
    let capturedConfig;

    before(async () => {
      class S3ClientSpy extends DefaultS3Client {
        constructor(config) {
          super();
          capturedConfig = config;
        }
      }
      S3WithSpy = await getS3withMocks({ s3ClientClass: S3ClientSpy });
    });

    it('uses HMAC credentials when accessKeyId and secretAccessKey are provided', () => {
      new S3WithSpy({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'http://minio:9000',
        bucket: 'test-bucket',
        plugins: [],
      });

      assert.strictEqual(capturedConfig.credentials.accessKeyId, 'test-key');
      assert.strictEqual(capturedConfig.credentials.secretAccessKey, 'test-secret');
      assert.strictEqual(capturedConfig.forcePathStyle, true);
      assert.strictEqual(capturedConfig.endpoint, 'http://minio:9000');
    });

    it('omits endpoint from config when not provided', () => {
      new S3WithSpy({ accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'my-bucket', plugins: [] });

      assert.strictEqual(capturedConfig.endpoint, undefined);
    });
  });

  describe('constructor auth - IBM IAM', () => {
    let S3IbmIam;
    let capturedConfig;
    let capturedApiKey;

    before(async () => {
      S3IbmIam = await getS3withMocks({
        buildIbmIamClientFn: (config, apiKey) => {
          capturedConfig = config;
          capturedApiKey = apiKey;
          return new DefaultS3Client();
        },
      });
    });

    it('delegates to buildIbmIamClient when apiKey is provided', () => {
      new S3IbmIam({ apiKey: 'my-api-key', endpoint: 'http://s3.ibm.com', bucket: 'my-bucket', plugins: [] });

      assert.strictEqual(capturedApiKey, 'my-api-key');
      assert.strictEqual(capturedConfig.endpoint, 'http://s3.ibm.com');
      assert.strictEqual(capturedConfig.forcePathStyle, true);
    });
  });

  describe('getFilePathsFromPrefixes', () => {
    it('returns a list of file paths from S3 listing for each date', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const actual = await s3.getFilePathsFromPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', {
        file: '/path/to/file',
      });

      assert.deepStrictEqual(actual.length, 2);
    });

    it('filters out non-matching file paths from S3 listing results', async () => {
      class S3ClientWithNonMatching extends DefaultS3Client {
        send(command) {
          if (command.constructor.name === 'ListObjectsV2Command') {
            return Promise.resolve({
              Contents: [
                { Key: '/path/to/file1', Size: 0 },
                { Key: '/non-matching/file/pattern', Size: 0 },
                { Key: '/path/to/file2', Size: 0 },
              ],
            });
          }
          return super.send(command);
        }
      }

      const S3Custom = await getS3withMocks({ s3ClientClass: S3ClientWithNonMatching });
      const s3 = new S3Custom({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const actual = await s3.getFilePathsFromPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', {
        file: '/path/to/file',
      });

      assert.deepStrictEqual(actual.length, 2);
      assert.deepEqual(actual[0].file, '/path/to/file1');
      assert.deepEqual(actual[1].file, '/path/to/file2');
      assert.ok(actual.every((fileObject) => fileObject.file !== '/non-matching/file/pattern'));
    });
  });

  describe('createPrefixes', () => {
    it('returns a list of prefixes by day to use for listing files in a given date range', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern = 'year={yyyy}/month={MM}/day={dd}/my-file_{yyyy}{MM}{dd}{hh}{mm}{ss}';
      const actual = s3.createPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', pattern);

      actual.forEach((prefix) => {
        assert.deepEqual(/day=\d{2}/.test(prefix), true);
        assert.deepEqual(/hour=\d{2}/.test(prefix), false);
      });
      assert.deepEqual(actual.length, 3);
    });

    it('returns a list of prefixes by hour to use for listing files in a given date range', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern = 'year={yyyy}/month={MM}/day={dd}/hour={hh}/my-file_{yyyy}{MM}{dd}{hh}{mm}{ss}';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      actual.forEach((prefix) => {
        assert.deepEqual(/day=\d{2}/.test(prefix), true);
        assert.deepEqual(/hour=\d{2}/.test(prefix), true);
      });
      assert.deepEqual(actual.length, 8);
    });

    it('returns a prefix up to the first glob', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern =
        'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=*/minute=00/accounts_*.parquet';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      assert.deepEqual(actual.length, 1);
      assert.deepEqual(
        actual[0],
        'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=',
      );
    });

    it('returns a list of prefixes by month for year/month patterns without a day token', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern = 'sales/year={yyyy}/month={MM}/data.parquet';
      const actual = s3.createPrefixes('2024-01-01T00:00:00Z', '2024-03-31T23:59:59Z', pattern);

      assert.deepEqual(actual.length, 3);
      assert.ok(actual.every((prefix) => /month=\d{2}/.test(prefix)));
      assert.ok(actual.every((prefix) => !/day=/.test(prefix)));
      assert.deepEqual(actual[0], 'sales/year=2024/month=01');
      assert.deepEqual(actual[1], 'sales/year=2024/month=02');
      assert.deepEqual(actual[2], 'sales/year=2024/month=03');
    });

    it('returns month prefixes spanning a year boundary', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern = 'sales/year={yyyy}/month={MM}/data.parquet';
      const actual = s3.createPrefixes('2024-12-01T00:00:00Z', '2025-02-28T23:59:59Z', pattern);

      assert.deepEqual(actual.length, 3);
      assert.deepEqual(actual[0], 'sales/year=2024/month=12');
      assert.deepEqual(actual[1], 'sales/year=2025/month=01');
      assert.deepEqual(actual[2], 'sales/year=2025/month=02');
    });

    it('returns the full file path if no date tokens or globs are found', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const pattern =
        'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=22/minute=00/accounts.parquet';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      assert.deepEqual(actual.length, 1);
      assert.deepEqual(
        actual[0],
        'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=22/minute=00/accounts.parquet',
      );
    });
  });

  describe('listFiles', () => {
    it('does not call send if listing is in cache', async () => {
      const listingCache = new Map();
      const sendSpy = mock.fn(() => Promise.resolve({ Contents: [] }));
      class S3ClientCacheTest extends DefaultS3Client {
        send(...args) {
          return sendSpy(...args);
        }
      }
      listingCache.set('bucket/test-cached-prefix', ['file/path']);
      const S3Cache = await getS3withMocks({ s3ClientClass: S3ClientCacheTest });
      const s3 = new S3Cache({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://endpoint',
        bucket: 'bucket',
        listingCache,
        plugins: [],
      });
      await s3.listFiles('test-cached-prefix');

      assert.deepEqual(sendSpy.mock.callCount(), 0);
    });
  });

  describe('objectToFile', () => {
    it('writes to a temp path then atomically renames to the final path', async () => {
      const writeFileSpy = mock.fn(() => Promise.resolve());
      const renameSpy = mock.fn(() => Promise.resolve());
      const S3Atomic = await getS3withMocks({ writeFile: writeFileSpy, rename: renameSpy });
      const s3 = new S3Atomic({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'my-bucket',
        mount: '/tmp/test',
        plugins: [],
      });

      await s3.objectToFile('some/file.parquet');

      const writtenPath = writeFileSpy.mock.calls[0].arguments[0];
      const [renamedFrom, renamedTo] = renameSpy.mock.calls[0].arguments;

      assert.ok(writtenPath.startsWith('/tmp/test/some/file.parquet.'), `expected temp path, got: ${writtenPath}`);
      assert.ok(writtenPath.endsWith('.tmp'), `expected .tmp suffix, got: ${writtenPath}`);
      assert.strictEqual(renamedFrom, writtenPath);
      assert.strictEqual(renamedTo, '/tmp/test/some/file.parquet');
    });

    it('removes the temp file and rethrows when the download fails', async () => {
      const unlinkSpy = mock.fn(() => Promise.resolve());
      const S3Failing = await getS3withMocks({
        writeFile: () => Promise.reject(new Error('disk full')),
        unlink: unlinkSpy,
      });
      const s3 = new S3Failing({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'my-bucket',
        mount: '/tmp/test',
        plugins: [],
      });

      await assert.rejects(s3.objectToFile('some/file.parquet'));

      assert.strictEqual(unlinkSpy.mock.callCount(), 1);
      const unlinkedPath = unlinkSpy.mock.calls[0].arguments[0];
      assert.ok(unlinkedPath.endsWith('.tmp'), `expected .tmp suffix on unlinked path, got: ${unlinkedPath}`);
    });
  });

  describe('getTodayPrefix', () => {
    it('returns the prefix used for todays date', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'vpc-objects',
        plugins: [],
      });
      const now = new Date();
      const pattern = 'year={yyyy}/month={MM}/day={dd}/my-file_{yyyy}{MM}{dd}{hh}{mm}{ss}';
      const expected = 'year={yyyy}/month={MM}/day={dd}'
        .replace('{yyyy}', now.getFullYear())
        .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
        .replace('{dd}', String(now.getDate()).padStart(2, '0'));
      const actual = s3.getTodayPrefix(pattern);

      assert.deepEqual(actual, expected);
    });
  });

  describe('evictTodayFromListingCache', () => {
    it('removes all cache entries that start with today day-level prefix', () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const listingCache = new Map([
        [`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/hour=14/`, [{ file: 'a.parquet', size: 1 }]],
        [`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/hour=15/`, [{ file: 'b.parquet', size: 1 }]],
        [`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/`, [{ file: 'c.parquet', size: 1 }]],
        [`bucket/prefix/year=${yyyy}/month=${MM}/day=01/`, [{ file: 'd.parquet', size: 1 }]],
      ]);
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'bucket',
        listingCache,
        plugins: [],
      });

      s3.evictTodayFromListingCache('prefix/year={yyyy}/month={MM}/day={dd}/hour={hh}/file.parquet');

      assert.ok(!listingCache.has(`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/hour=14/`));
      assert.ok(!listingCache.has(`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/hour=15/`));
      assert.ok(!listingCache.has(`bucket/prefix/year=${yyyy}/month=${MM}/day=${dd}/`));
      assert.ok(listingCache.has(`bucket/prefix/year=${yyyy}/month=${MM}/day=01/`), 'past day entries should remain');
    });
  });

  describe('preFlightCheck', () => {
    it('returns true when the total file size is within the default limit', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const filePaths = [
        { file: 'a.parquet', size: 500 * 1e6 },
        { file: 'b.parquet', size: 400 * 1e6 },
      ];

      assert.strictEqual(s3.preFlightCheck(filePaths), true);
    });

    it('throws when the total file size exceeds the default 1000 MB limit', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const filePaths = [{ file: 'big.parquet', size: 1001 * 1e6 }];

      assert.throws(() => s3.preFlightCheck(filePaths), /exceeds/);
    });

    it('respects the MAX_MB_DOWNLOAD environment variable', () => {
      process.env.MAX_MB_DOWNLOAD = '100';
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const filePaths = [{ file: 'medium.parquet', size: 101 * 1e6 }];

      assert.throws(() => s3.preFlightCheck(filePaths), /exceeds/);
      delete process.env.MAX_MB_DOWNLOAD;
    });
  });

  describe('logStatistics', () => {
    it('returns the original results array', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const results = ['./file1.parquet', './file2.parquet'];
      const stats = { start: new Date(), bytesDownloaded: 1024 * 1024, cacheHits: 1, cacheMisses: 1, enqueuedHits: 0 };
      const logFn = s3.logStatistics(stats);

      assert.strictEqual(logFn(results), results);
    });
  });

  describe('startDownloads', () => {
    it('increments enqueuedHits when a file is already being downloaded', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      s3.enqueuedFiles.set('data.parquet', Promise.resolve('./data.parquet'));
      const stats = { enqueuedHits: 0, cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };

      s3.startDownloads(stats, [{ file: 'data.parquet', size: 0, cache: true }]);

      assert.strictEqual(stats.enqueuedHits, 1);
    });

    it('does not increment enqueuedHits for a file not yet being downloaded', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const stats = { enqueuedHits: 0, cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };

      s3.startDownloads(stats, [{ file: 'new.parquet', size: 0, cache: true }]);

      assert.strictEqual(stats.enqueuedHits, 0);
    });
  });

  describe('downloadFile', () => {
    it('resolves with the local file path when cache is not false', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };
      const result = await s3.downloadFile(stats, { file: 'data.parquet', size: 100 });

      assert.strictEqual(result, '/mnt/data.parquet');
      assert.strictEqual(stats.cacheHits, 1);
    });

    it('resolves with the local file path when cache is false', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };
      const result = await s3.downloadFile(stats, { file: 'data.parquet', size: 100, cache: false });

      assert.strictEqual(result, '/mnt/data.parquet');
      assert.strictEqual(stats.cacheMisses, 1);
    });
  });

  describe('downloadFileCache', () => {
    it('returns the local path and counts a cache hit when the file already exists', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };
      const result = await s3.downloadFileCache(stats, { file: 'data.parquet', size: 100 });

      assert.strictEqual(result, '/mnt/data.parquet');
      assert.strictEqual(stats.cacheHits, 1);
      assert.strictEqual(stats.cacheMisses, 0);
    });

    it('downloads the file and counts a cache miss when the file does not exist locally', async () => {
      const S3Miss = await getS3withMocks({ stat: () => Promise.reject(new Error('not found')) });
      const s3 = new S3Miss({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };
      const result = await s3.downloadFileCache(stats, { file: 'data.parquet', size: 512 });

      assert.strictEqual(result, '/mnt/data.parquet');
      assert.strictEqual(stats.cacheMisses, 1);
      assert.strictEqual(stats.bytesDownloaded, 512);
    });
  });

  describe('downloadFileForced', () => {
    it('always downloads the file regardless of local cache', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };
      const result = await s3.downloadFileForced(stats, { file: 'data.parquet', size: 2048 });

      assert.strictEqual(result, '/mnt/data.parquet');
      assert.strictEqual(stats.cacheMisses, 1);
      assert.strictEqual(stats.bytesDownloaded, 2048);
    });

    it('rejects when mkdir fails', async () => {
      const S3MkdirFail = await getS3withMocks({ mkdir: () => Promise.reject(new Error('permission denied')) });
      const s3 = new S3MkdirFail({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        mount: '/mnt',
        plugins: [],
      });
      const stats = { cacheHits: 0, cacheMisses: 0, bytesDownloaded: 0 };

      await assert.rejects(s3.downloadFileForced(stats, { file: 'data.parquet', size: 0 }));
    });
  });

  describe('processFile', () => {
    it('resolves with the file path when plugins process the file successfully', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [{ processFile: (file) => Promise.resolve(file) }],
      });

      assert.strictEqual(await s3.processFile('./data.parquet'), './data.parquet');
    });

    it('resolves with the file path when a plugin has no processFile method', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [{}],
      });

      assert.strictEqual(await s3.processFile('./data.parquet'), './data.parquet');
    });
  });

  describe('downloadFileList', () => {
    it('returns the list of successfully downloaded file paths', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const result = await s3.downloadFileList([{ file: 'data.parquet', size: 0, cache: true }]);

      assert.deepStrictEqual(result, ['./data.parquet']);
    });

    it('throws synchronously when total file size exceeds the limit', () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });

      assert.throws(() => s3.downloadFileList([{ file: 'big.parquet', size: 1001 * 1e6 }]), /exceeds/);
    });
  });

  describe('downloadFiles', () => {
    it('returns paths for all files matching the date range and pattern', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const result = await s3.downloadFiles({
        from: '2005-01-17T00:00:00Z',
        to: '2005-01-19T00:00:00Z',
        filePatterns: [{ file: '/path/to/file', cache: true }],
      });

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 2);
    });

    it('includes static files in the download result', async () => {
      const s3 = new S3({
        accessKeyId: '123',
        secretAccessKey: 'secret',
        endpoint: 'http://s3.com',
        bucket: 'test',
        plugins: [],
      });
      const result = await s3.downloadFiles({
        from: '2005-01-17T00:00:00Z',
        to: '2005-01-19T00:00:00Z',
        filePatterns: [],
        staticFiles: [{ file: 'static.parquet', size: 0, cache: true }],
      });

      assert.ok(result.some((path) => path.includes('static.parquet')));
    });
  });
});

async function* asyncBody() {
  yield Buffer.from('');
}

class DefaultS3Client {
  send(command) {
    if (command.constructor.name === 'ListObjectsV2Command') {
      return Promise.resolve({
        Contents: [
          { Key: '/path/to/file1', Size: 0 },
          { Key: '/path/to/file2', Size: 0 },
        ],
      });
    }
    return Promise.resolve({ Body: asyncBody() });
  }
}

function getS3withMocks({
  mkdir = () => Promise.resolve(),
  writeFile = () => Promise.resolve(),
  rename = () => Promise.resolve(),
  unlink = () => Promise.resolve(),
  stat = () => Promise.resolve(),
  s3ClientClass = DefaultS3Client,
  buildIbmIamClientFn = () => new DefaultS3Client(),
}) {
  return esmock('./s3.js', {
    'node:fs/promises': { mkdir, writeFile, rename, unlink, stat },
    'node:path': { dirname: () => {} },
    '@aws-sdk/client-s3': {
      S3Client: s3ClientClass,
      ListObjectsV2Command: class ListObjectsV2Command {
        constructor(params) {
          Object.assign(this, params);
        }
      },
      GetObjectCommand: class GetObjectCommand {
        constructor(params) {
          Object.assign(this, params);
        }
      },
    },
    '../utils/logger.js': {
      logger: { info() {}, error() {} },
    },
    './auth/ibm-iam-client.js': {
      buildIbmIamClient: buildIbmIamClientFn,
    },
  });
}
