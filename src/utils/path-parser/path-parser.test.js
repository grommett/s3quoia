import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseFilePath } from './path-parser.js';

describe('path-parser', () => {
  describe('parseFilePath', () => {
    it('parses a plain static file path', () => {
      const result = parseFilePath('my-bucket/data/report.parquet');
      assert.strictEqual(result.endpoint, null);
      assert.strictEqual(result.bucket, null);
      assert.strictEqual(result.file, 'my-bucket/data/report.parquet');
      assert.strictEqual(result.cache, true);
    });

    it('extracts a bucket location token and strips it from the file path', () => {
      const result = parseFilePath('{bucket:my-bucket}/year={yyyy}/data.csv');
      assert.strictEqual(result.bucket, 'my-bucket');
      assert.strictEqual(result.file, 'year={yyyy}/data.csv');
    });

    it('extracts an endpoint location token and strips it from the file path', () => {
      const result = parseFilePath('{endpoint:https://s3.us-south.com}/{bucket:my-bucket}/file.parquet');
      assert.strictEqual(result.endpoint, 'https://s3.us-south.com');
      assert.strictEqual(result.bucket, 'my-bucket');
      assert.strictEqual(result.file, 'file.parquet');
    });

    it('preserves all date tokens in the reconstructed file path', () => {
      const result = parseFilePath('data/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/second={ss}/f.parquet');
      assert.strictEqual(result.file, 'data/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/second={ss}/f.parquet');
    });

    it('preserves glob wildcards in the reconstructed file path', () => {
      const result = parseFilePath('jobs/window=20230803/*.parquet');
      assert.strictEqual(result.file, 'jobs/window=20230803/*.parquet');
    });

    it('parses ?cache=false and returns cache: false', () => {
      const result = parseFilePath('data/file.parquet?cache=false');
      assert.strictEqual(result.cache, false);
      assert.strictEqual(result.file, 'data/file.parquet');
    });

    it('parses ?cache=true and returns cache: true', () => {
      const result = parseFilePath('data/file.parquet?cache=true');
      assert.strictEqual(result.cache, true);
    });

    it('defaults cache to true when no ?cache param is present', () => {
      const result = parseFilePath('data/file.parquet');
      assert.strictEqual(result.cache, true);
    });

    it('handles endpoint URLs with port numbers and paths', () => {
      const result = parseFilePath('{endpoint:http://cos-location.ibm.com:443}/{bucket:prod-bucket}/data.parquet');
      assert.strictEqual(result.endpoint, 'http://cos-location.ibm.com:443');
      assert.strictEqual(result.bucket, 'prod-bucket');
    });

    it('handles file names with + characters (avro pattern)', () => {
      const result = parseFilePath('telem/rias-ng+0+0000195526.avro');
      assert.strictEqual(result.file, 'telem/rias-ng+0+0000195526.avro');
    });

    it('trims whitespace from bucket and endpoint values', () => {
      const result = parseFilePath('{bucket: my-bucket}/file.parquet');
      assert.strictEqual(result.bucket, 'my-bucket');
    });

    it('handles combined date tokens, globs, and cache param', () => {
      const result = parseFilePath('{bucket:obs-raw}/year={yyyy}/month={MM}/*.csv.gz?cache=false');
      assert.strictEqual(result.bucket, 'obs-raw');
      assert.strictEqual(result.file, 'year={yyyy}/month={MM}/*.csv.gz');
      assert.strictEqual(result.cache, false);
    });
  });
});
