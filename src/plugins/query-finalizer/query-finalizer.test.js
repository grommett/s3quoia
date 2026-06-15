import { describe, it } from 'node:test';
import assert from 'node:assert';
import QueryFinalizerPlugin from './query-finalizer.js';

const plugin = new QueryFinalizerPlugin();
const BUCKETS_DIR = '/mnt/s3';

describe('QueryFinalizerPlugin', () => {
  describe('finalizeQuery', () => {
    it('replaces a single static file ref with its exact local path', () => {
      const query = `SELECT * FROM read_parquet('reports/summary.parquet')`;
      const fileSettings = [
        { sqlFileReference: 'reports/summary.parquet', file: 'reports/summary.parquet', bucket: 'my-bucket' },
      ];
      const downloadedPaths = ['/mnt/s3/my-bucket/reports/summary.parquet'];

      const result = plugin.finalizeQuery(query, fileSettings, downloadedPaths, BUCKETS_DIR);

      assert.ok(result.includes('/mnt/s3/my-bucket/reports/summary.parquet'));
      assert.ok(!result.includes("'reports/summary.parquet'"));
    });

    it('replaces a date-partitioned pattern with a DuckDB array literal of exact paths', () => {
      const query = `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet', union_by_name=1)`;
      const fileSettings = [
        {
          sqlFileReference: 'events/year={yyyy}/month={MM}/day={dd}/data.parquet',
          file: 'events/year={yyyy}/month={MM}/day={dd}/data.parquet',
          bucket: 'my-bucket',
        },
      ];
      const downloadedPaths = [
        '/mnt/s3/my-bucket/events/year=2024/month=01/day=14/data.parquet',
        '/mnt/s3/my-bucket/events/year=2024/month=01/day=15/data.parquet',
      ];

      const result = plugin.finalizeQuery(query, fileSettings, downloadedPaths, BUCKETS_DIR);

      assert.ok(
        result.includes(
          `['/mnt/s3/my-bucket/events/year=2024/month=01/day=14/data.parquet', '/mnt/s3/my-bucket/events/year=2024/month=01/day=15/data.parquet']`,
        ),
      );
      assert.ok(!result.includes('{yyyy}'));
      assert.ok(!result.includes('{MM}'));
    });

    it('throws when no downloaded files match the file pattern', () => {
      const query = `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet')`;
      const fileSettings = [
        {
          sqlFileReference: 'events/year={yyyy}/month={MM}/day={dd}/data.parquet',
          file: 'events/year={yyyy}/month={MM}/day={dd}/data.parquet',
          bucket: 'my-bucket',
        },
      ];

      assert.throws(() => plugin.finalizeQuery(query, fileSettings, [], BUCKETS_DIR), /No files found/);
    });

    it('does not include files from a different bucket in the match', () => {
      const query = `SELECT * FROM read_parquet('data.parquet')`;
      const fileSettings = [{ sqlFileReference: 'data.parquet', file: 'data.parquet', bucket: 'bucket-a' }];
      const downloadedPaths = ['/mnt/s3/bucket-a/data.parquet', '/mnt/s3/bucket-b/data.parquet'];

      const result = plugin.finalizeQuery(query, fileSettings, downloadedPaths, BUCKETS_DIR);

      assert.ok(result.includes('/mnt/s3/bucket-a/data.parquet'));
      assert.ok(!result.includes('/mnt/s3/bucket-b/data.parquet'));
    });

    it('removes endpoint and bucket location tokens from the finalized query', () => {
      const query = `SELECT * FROM read_parquet('{endpoint:http://s3.example.com}/{bucket:my-bucket}/data.parquet')`;
      const fileSettings = [
        {
          sqlFileReference: '{endpoint:http://s3.example.com}/{bucket:my-bucket}/data.parquet',
          file: 'data.parquet',
          bucket: 'my-bucket',
        },
      ];
      const downloadedPaths = ['/mnt/s3/my-bucket/data.parquet'];

      const result = plugin.finalizeQuery(query, fileSettings, downloadedPaths, BUCKETS_DIR);

      assert.ok(!result.includes('{endpoint:'));
      assert.ok(!result.includes('{bucket:'));
      assert.ok(result.includes('/mnt/s3/my-bucket/data.parquet'));
    });
  });
});
