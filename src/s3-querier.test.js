import { describe, it } from 'node:test';
import assert from 'node:assert';

import QueryParserPlugin from './plugins/query-parser/query-parser.js';
import QueryFinalizerPlugin from './plugins/query-finalizer/query-finalizer.js';
import { mergeSettings } from './utils/file-settings/file-settings.js';

const DEFAULT_ENDPOINT = 'http://default-endpoint.com';
const DEFAULT_BUCKET = 'default-bucket';
const BUCKETS_DIR = '/mnt/s3';

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
});

function runQueryPipeline(query) {
  const plugins = [new QueryParserPlugin(), new QueryFinalizerPlugin()];
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
