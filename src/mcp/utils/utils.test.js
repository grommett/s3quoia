import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveDatasetBucket } from './utils.js';

const DATASETS = [
  { name: 'Sales', bucket: 'sales-bucket', prefix: 'sales/' },
  { name: 'Logs', bucket: 'logs-bucket', endpoint: 'https://s3.logs.example.com', prefix: 'logs/raw/' },
  { name: 'Reports', bucket: 'reports-bucket', prefix: 'reports/monthly/' },
];

describe('resolveDatasetBucket', () => {
  it('returns empty object when no datasets are configured', () => {
    assert.deepStrictEqual(resolveDatasetBucket(undefined, 'sales/'), {});
    assert.deepStrictEqual(resolveDatasetBucket([], 'sales/'), {});
  });

  it('returns bucket for a dataset whose prefix matches the hint', () => {
    assert.deepStrictEqual(resolveDatasetBucket(DATASETS, 'sales/2024/data.parquet'), { bucket: 'sales-bucket' });
  });

  it('includes endpoint when the matched dataset has one', () => {
    assert.deepStrictEqual(resolveDatasetBucket(DATASETS, 'logs/raw/2024/file.parquet'), {
      bucket: 'logs-bucket',
      endpoint: 'https://s3.logs.example.com',
    });
  });

  it('picks the most specific (longest prefix) match when multiple datasets match', () => {
    // 'reports/monthly/' is more specific than a hypothetical 'reports/' match
    const datasets = [
      { name: 'ReportsAll', bucket: 'reports-all', prefix: 'reports/' },
      { name: 'ReportsMonthly', bucket: 'reports-monthly', prefix: 'reports/monthly/' },
    ];
    assert.deepStrictEqual(resolveDatasetBucket(datasets, 'reports/monthly/jan.parquet'), {
      bucket: 'reports-monthly',
    });
  });

  it('falls back to the first dataset when no prefix matches the hint', () => {
    assert.deepStrictEqual(resolveDatasetBucket(DATASETS, 'unknown/path/'), { bucket: 'sales-bucket' });
  });

  it('falls back to the first dataset when hint is empty', () => {
    assert.deepStrictEqual(resolveDatasetBucket(DATASETS, ''), { bucket: 'sales-bucket' });
  });

  it('omits endpoint key when the matched dataset has no endpoint', () => {
    const result = resolveDatasetBucket(DATASETS, 'sales/data.parquet');
    assert.strictEqual('endpoint' in result, false);
  });

  it('omits bucket key when the matched dataset has no bucket', () => {
    const datasets = [{ name: 'NoBucket', prefix: 'nope/', endpoint: 'https://x.com' }];
    const result = resolveDatasetBucket(datasets, 'nope/file');
    assert.strictEqual('bucket' in result, false);
    assert.strictEqual(result.endpoint, 'https://x.com');
  });
});
