import { describe, it } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

import QueryParserPlugin from './plugins/query-parser/query-parser.js';
import { mergeSettings } from './utils/file-settings/file-settings.js';

const DEFAULT_ENDPOINT = 'http://default-endpoint.com';
const DEFAULT_BUCKET = 'default-bucket';
const BUCKETS_DIR = '/mnt/s3';
const MOCK_RESULT = [{ name: 'col', fields: [1] }];
const MOCK_QUERY_OPTIONS = {
  query: `SELECT * FROM read_parquet('{bucket:my-bucket}/data.parquet')`,
  bucketsDir: '/tmp',
  defaultEndpoint: 'http://localhost',
  defaultBucket: 'my-bucket',
};

describe('s3-querier', () => {
  describe('query to download settings', () => {
    it('groups files from the same bucket into a single settings entry', () => {
      const query = `
        SELECT *
        FROM read_parquet('{bucket:obs-vpc-raw}/year={yyyy}/month={MM}/day={dd}/hour={hh}/data.parquet')
        JOIN read_csv('{bucket:obs-vpc-raw}/reference/accounts.csv')
        ON parquet.id = csv.id
      `;

      const settings = runQueryPipeline(query);

      assert.deepStrictEqual(settings, [
        {
          endpoint: DEFAULT_ENDPOINT,
          bucket: 'obs-vpc-raw',
          filePatterns: [{ file: 'year={yyyy}/month={MM}/day={dd}/hour={hh}/data.parquet', cache: true }],
          staticFiles: [{ file: 'reference/accounts.csv', cache: true }],
        },
      ]);
    });

    it('produces a separate settings entry per unique endpoint and bucket', () => {
      const query = `
        SELECT *
        FROM read_parquet('{endpoint:http://us-east.com}/{bucket:bucket-east}/year={yyyy}/month={MM}/day={dd}/data.parquet')
        JOIN read_csv('{endpoint:http://us-south.com}/{bucket:bucket-south}/static/reference.csv')
        ON east.id = south.id
      `;

      const settings = runQueryPipeline(query);

      assert.deepStrictEqual(settings.length, 2);
      assert.deepStrictEqual(settings[0].endpoint, 'http://us-east.com');
      assert.deepStrictEqual(settings[0].bucket, 'bucket-east');
      assert.deepStrictEqual(settings[1].endpoint, 'http://us-south.com');
      assert.deepStrictEqual(settings[1].bucket, 'bucket-south');
    });

    it('merges multiple files from the same bucket while keeping a separate entry for a different bucket', () => {
      const query = `
        SELECT *
        FROM read_parquet('{endpoint:http://us-east.com}/{bucket:bucket-east}/year={yyyy}/month={MM}/day={dd}/data.parquet')
        JOIN read_csv('{endpoint:http://us-east.com}/{bucket:bucket-east}/reference/accounts.csv')
        JOIN read_json('{endpoint:http://us-south.com}/{bucket:bucket-south}/static/lookup.json')
        ON east.id = south.id
      `;

      const settings = runQueryPipeline(query);

      assert.deepStrictEqual(settings, [
        {
          endpoint: 'http://us-east.com',
          bucket: 'bucket-east',
          filePatterns: [{ file: 'year={yyyy}/month={MM}/day={dd}/data.parquet', cache: true }],
          staticFiles: [{ file: 'reference/accounts.csv', cache: true }],
        },
        {
          endpoint: 'http://us-south.com',
          bucket: 'bucket-south',
          filePatterns: [],
          staticFiles: [{ file: 'static/lookup.json', cache: true }],
        },
      ]);
    });

    it('falls back to default endpoint and bucket when not specified in the query', () => {
      const query = `SELECT * FROM read_parquet('year={yyyy}/month={MM}/day={dd}/data.parquet')`;

      const settings = runQueryPipeline(query);

      assert.deepStrictEqual(settings, [
        {
          endpoint: DEFAULT_ENDPOINT,
          bucket: DEFAULT_BUCKET,
          filePatterns: [{ file: 'year={yyyy}/month={MM}/day={dd}/data.parquet', cache: true }],
          staticFiles: [],
        },
      ]);
    });
  });

  describe('preQuery', () => {
    it('calls preQuery with sql, downloadedPaths, and bucketsDir', async (context) => {
      const preQuerySpy = context.mock.fn(() => null);
      const plugin = { processQuery: (ctx) => ctx, preQuery: preQuerySpy };

      const { default: s3Querier } = await getMockedQuerier();
      await s3Querier({ ...MOCK_QUERY_OPTIONS, plugins: [plugin] });

      assert.equal(preQuerySpy.mock.callCount(), 1);
      const [callArgs] = preQuerySpy.mock.calls[0].arguments;
      assert.ok(typeof callArgs.sql === 'string');
      assert.deepStrictEqual(callArgs.downloadedPaths, ['/tmp/my-bucket/data.parquet']);
      assert.equal(callArgs.bucketsDir, '/tmp');
    });

    it('calls the callback returned by preQuery with the result', async (context) => {
      const callbackSpy = context.mock.fn();
      const plugin = { processQuery: (ctx) => ctx, preQuery: () => callbackSpy };

      const { default: s3Querier } = await getMockedQuerier();
      await s3Querier({ ...MOCK_QUERY_OPTIONS, plugins: [plugin] });

      assert.equal(callbackSpy.mock.callCount(), 1);
      const [callArgs] = callbackSpy.mock.calls[0].arguments;
      assert.deepStrictEqual(callArgs.result, MOCK_RESULT);
    });

    it('does not reject the query result when the preQuery callback throws', async () => {
      const plugin = {
        processQuery: (ctx) => ctx,
        preQuery: () => () => Promise.reject(new Error('callback error')),
      };

      const { default: s3Querier } = await getMockedQuerier();
      const result = await s3Querier({ ...MOCK_QUERY_OPTIONS, plugins: [plugin] });

      assert.deepStrictEqual(result, MOCK_RESULT);
    });
  });

  describe('postQuery', () => {
    it('calls postQuery with result, downloadedPaths, and bucketsDir', async (context) => {
      const postQuerySpy = context.mock.fn();
      const plugin = { processQuery: (ctx) => ctx, postQuery: postQuerySpy };

      const { default: s3Querier } = await getMockedQuerier();
      await s3Querier({ ...MOCK_QUERY_OPTIONS, plugins: [plugin] });

      assert.equal(postQuerySpy.mock.callCount(), 1);
      const [callArgs] = postQuerySpy.mock.calls[0].arguments;
      assert.deepStrictEqual(callArgs.result, MOCK_RESULT);
      assert.deepStrictEqual(callArgs.downloadedPaths, ['/tmp/my-bucket/data.parquet']);
      assert.equal(callArgs.bucketsDir, '/tmp');
    });

    it('does not reject the query result when postQuery throws', async () => {
      const plugin = {
        processQuery: (ctx) => ctx,
        postQuery: () => Promise.reject(new Error('plugin error')),
      };

      const { default: s3Querier } = await getMockedQuerier();
      const result = await s3Querier({ ...MOCK_QUERY_OPTIONS, plugins: [plugin] });

      assert.deepStrictEqual(result, MOCK_RESULT);
    });
  });
});

function getMockedQuerier() {
  return esmock('./s3-querier.js', {
    './s3/s3.js': {
      default: class {
        downloadFiles() {
          return Promise.resolve(['/tmp/my-bucket/data.parquet']);
        }
      },
    },
    './duck-db/index.js': {
      query: () => Promise.resolve(MOCK_RESULT),
    },
    './utils/logger.js': {
      logger: { error: () => {}, info: () => {} },
    },
  });
}

function runQueryPipeline(query) {
  const plugins = [new QueryParserPlugin()];
  const context = {
    endpoint: DEFAULT_ENDPOINT,
    defaultBucket: DEFAULT_BUCKET,
    bucketsDir: BUCKETS_DIR,
    query,
    settings: [],
  };
  const processed = plugins.reduce((result, plugin) => plugin.processQuery(result), context);
  return mergeSettings(processed.settings);
}
