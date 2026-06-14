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
      new S3WithSpy({ accessKeyId: 'test-key', secretAccessKey: 'test-secret', endpoint: 'http://minio:9000', bucket: 'test-bucket', plugins: [] });

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
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const actual = await s3.getFilePathsFromPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', { file: '/path/to/file' });

      assert.deepStrictEqual(actual.length, 2);
    });

    it('filters out non-matching file paths from S3 listing results', async () => {
      class S3ClientWithNonMatching extends DefaultS3Client {
        async send(command) {
          if (command.constructor.name === 'ListObjectsV2Command') {
            return {
              Contents: [
                { Key: '/path/to/file1', Size: 0 },
                { Key: '/non-matching/file/pattern', Size: 0 },
                { Key: '/path/to/file2', Size: 0 },
              ],
            };
          }
          return super.send(command);
        }
      }

      const S3Custom = await getS3withMocks({ s3ClientClass: S3ClientWithNonMatching });
      const s3 = new S3Custom({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const actual = await s3.getFilePathsFromPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', { file: '/path/to/file' });

      assert.deepStrictEqual(actual.length, 2);
      assert.deepEqual(actual[0].file, '/path/to/file1');
      assert.deepEqual(actual[1].file, '/path/to/file2');
      assert.ok(actual.every((fileObject) => fileObject.file !== '/non-matching/file/pattern'));
    });
  });

  describe('createPrefixes', () => {
    it('returns a list of prefixes by day to use for listing files in a given date range', () => {
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const pattern = 'year={yyyy}/month={MM}/day={dd}/my-file_{yyyy}{MM}{dd}{hh}{mm}{ss}';
      const actual = s3.createPrefixes('2005-01-17T00:00:00Z', '2005-01-19T00:00:00Z', pattern);

      actual.forEach((prefix) => {
        assert.deepEqual(/day=\d{2}/.test(prefix), true);
        assert.deepEqual(/hour=\d{2}/.test(prefix), false);
      });
      assert.deepEqual(actual.length, 3);
    });

    it('returns a list of prefixes by hour to use for listing files in a given date range', () => {
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const pattern = 'year={yyyy}/month={MM}/day={dd}/hour={hh}/my-file_{yyyy}{MM}{dd}{hh}{mm}{ss}';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      actual.forEach((prefix) => {
        assert.deepEqual(/day=\d{2}/.test(prefix), true);
        assert.deepEqual(/hour=\d{2}/.test(prefix), true);
      });
      assert.deepEqual(actual.length, 8);
    });

    it('returns a prefix up to the first glob', () => {
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const pattern = 'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=*/minute=00/accounts_*.parquet';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      assert.deepEqual(actual.length, 1);
      assert.deepEqual(actual[0], 'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=');
    });

    it('returns the full file path if no date tokens or globs are found', () => {
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
      const pattern = 'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=22/minute=00/accounts.parquet';
      const actual = s3.createPrefixes('2005-01-17T23:00:00Z', '2005-01-18T06:07:00Z', pattern);

      assert.deepEqual(actual.length, 1);
      assert.deepEqual(actual[0], 'obs-vpc-objects/vpc_objects_2rep/version=v1.0.0/env=production/year=2025/month=01/day=08/hour=22/minute=00/accounts.parquet');
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
      const s3 = new S3Cache({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://endpoint', bucket: 'bucket', listingCache, plugins: [] });
      await s3.listFiles('test-cached-prefix');

      assert.deepEqual(sendSpy.mock.callCount(), 0);
    });
  });

  describe('getTodayPrefix', () => {
    it('returns the prefix used for todays date', () => {
      const s3 = new S3({ accessKeyId: '123', secretAccessKey: 'secret', endpoint: 'http://s3.com', bucket: 'vpc-objects', plugins: [] });
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
});

async function* asyncBody() {
  yield Buffer.from('');
}

class DefaultS3Client {
  async send(command) {
    if (command.constructor.name === 'ListObjectsV2Command') {
      return { Contents: [{ Key: '/path/to/file1', Size: 0 }, { Key: '/path/to/file2', Size: 0 }] };
    }
    return { Body: asyncBody() };
  }
}

function getS3withMocks({
  mkdir = () => Promise.resolve(),
  writeFile = () => Promise.resolve(),
  stat = () => Promise.resolve(),
  s3ClientClass = DefaultS3Client,
  buildIbmIamClientFn = () => new DefaultS3Client(),
}) {
  return esmock('./s3.js', {
    'node:fs/promises': { mkdir, writeFile, stat },
    'node:path': { dirname: () => {} },
    '@aws-sdk/client-s3': {
      S3Client: s3ClientClass,
      ListObjectsV2Command: class ListObjectsV2Command {
        constructor(params) { Object.assign(this, params); }
      },
      GetObjectCommand: class GetObjectCommand {
        constructor(params) { Object.assign(this, params); }
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
