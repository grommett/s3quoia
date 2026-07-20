import { describe, it } from 'node:test';
import assert from 'node:assert';
import BucketResolverPlugin from './bucket-resolver-plugin.js';

const DATASETS = [
  { name: 'Sales', bucket: 'sales-bucket', prefix: 'sales/' },
  { name: 'Logs', bucket: 'logs-bucket', endpoint: 'https://s3.logs.example.com', prefix: 'logs/raw/' },
];

describe('BucketResolverPlugin', () => {
  it('fills in the bucket for a file setting with no bucket, matched by prefix', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [{ file: 'sales/year=2024/data.parquet', endpoint: undefined, bucket: undefined }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, 'sales-bucket');
  });

  it('fills in the endpoint too when the matched dataset has one', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [{ file: 'logs/raw/2024/file.parquet', endpoint: undefined, bucket: undefined }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, 'logs-bucket');
    assert.strictEqual(actual.settings[0].endpoint, 'https://s3.logs.example.com');
  });

  it('resolves each file in a join independently to its own dataset bucket', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [
      { file: 'sales/year=2024/data.parquet', endpoint: undefined, bucket: undefined },
      { file: 'logs/raw/2024/file.parquet', endpoint: undefined, bucket: undefined },
    ];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, 'sales-bucket');
    assert.strictEqual(actual.settings[1].bucket, 'logs-bucket');
  });

  it('does not overwrite a bucket that is already resolved', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [{ file: 'sales/year=2024/data.parquet', endpoint: undefined, bucket: 'explicit-bucket' }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, 'explicit-bucket');
  });

  it('does not overwrite an endpoint that is already resolved', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [
      { file: 'logs/raw/2024/file.parquet', endpoint: 'https://existing.example.com', bucket: undefined },
    ];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].endpoint, 'https://existing.example.com');
  });

  it('leaves a file unchanged when no dataset prefix matches, with no fallback to the first dataset', () => {
    const plugin = new BucketResolverPlugin(DATASETS);
    const settings = [{ file: 'unknown/path/data.parquet', endpoint: undefined, bucket: undefined }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, undefined);
  });

  it('picks the most specific (longest prefix) match when multiple datasets match', () => {
    const datasets = [
      { name: 'ReportsAll', bucket: 'reports-all', prefix: 'reports/' },
      { name: 'ReportsMonthly', bucket: 'reports-monthly', prefix: 'reports/monthly/' },
    ];
    const plugin = new BucketResolverPlugin(datasets);
    const settings = [{ file: 'reports/monthly/jan.parquet', endpoint: undefined, bucket: undefined }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, 'reports-monthly');
  });

  it('does nothing when no datasets are configured', () => {
    const plugin = new BucketResolverPlugin();
    const settings = [{ file: 'sales/year=2024/data.parquet', endpoint: undefined, bucket: undefined }];
    const actual = plugin.processQuery({ settings });

    assert.strictEqual(actual.settings[0].bucket, undefined);
  });
});
