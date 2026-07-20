import { describe, it } from 'node:test';
import assert from 'node:assert';

import DatasetBucketPlugin from './dataset-bucket-plugin.js';

const DATASETS = [
  { name: 'Sales', bucket: 'sales-bucket', prefix: 'sales/' },
  { name: 'Logs', bucket: 'logs-bucket', endpoint: 'https://s3.logs.example.com', prefix: 'logs/raw/' },
  { name: 'Reports', bucket: 'reports-bucket', prefix: 'reports/monthly/' },
];

function makeContext(settings) {
  return { query: '', endpoint: null, defaultBucket: null, bucketsDir: '/tmp', settings };
}

describe('DatasetBucketPlugin', () => {
  describe('processQuery', () => {
    it('returns context unchanged when no datasets are configured', () => {
      const plugin = new DatasetBucketPlugin([]);
      const ctx = makeContext([{ file: 'sales/data.parquet', bucket: null }]);
      assert.deepStrictEqual(plugin.processQuery(ctx), ctx);
    });

    it('fills bucket when file path starts with a dataset prefix', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([{ file: 'sales/2024/data.parquet', bucket: null }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'sales-bucket');
    });

    it('fills bucket and endpoint when matched dataset has both', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([{ file: 'logs/raw/2024/file.parquet', bucket: null }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'logs-bucket');
      assert.strictEqual(result.settings[0].endpoint, 'https://s3.logs.example.com');
    });

    it('picks the most specific (longest prefix) match', () => {
      const datasets = [
        { name: 'ReportsAll', bucket: 'reports-all', prefix: 'reports/' },
        { name: 'ReportsMonthly', bucket: 'reports-monthly', prefix: 'reports/monthly/' },
      ];
      const plugin = new DatasetBucketPlugin(datasets);
      const ctx = makeContext([{ file: 'reports/monthly/jan.parquet', bucket: null }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'reports-monthly');
    });

    it('falls back to first dataset with a bucket when no prefix matches', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([{ file: 'unknown/path/file.parquet', bucket: null }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'sales-bucket');
    });

    it('does not overwrite a setting that already has a bucket', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([{ file: 'sales/data.parquet', bucket: 'already-set' }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'already-set');
    });

    it('does not add endpoint key when matched dataset has no endpoint', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([{ file: 'sales/data.parquet', bucket: null }]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual('endpoint' in result.settings[0], false);
    });

    it('handles multiple settings independently', () => {
      const plugin = new DatasetBucketPlugin(DATASETS);
      const ctx = makeContext([
        { file: 'sales/a.parquet', bucket: null },
        { file: 'logs/raw/b.parquet', bucket: null },
        { file: 'reports/monthly/c.parquet', bucket: 'explicit' },
      ]);
      const result = plugin.processQuery(ctx);
      assert.strictEqual(result.settings[0].bucket, 'sales-bucket');
      assert.strictEqual(result.settings[1].bucket, 'logs-bucket');
      assert.strictEqual(result.settings[2].bucket, 'explicit');
    });
  });
});
