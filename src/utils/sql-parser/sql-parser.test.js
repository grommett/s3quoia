import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractFileReferences } from './sql-parser.js';

describe('sql-parser', () => {
  describe('extractFileReferences', () => {
    it('extracts a single parquet file from a read_parquet call', () => {
      const query = `SELECT * FROM read_parquet('jobs_failed/year={yyyy}/month={MM}/*.parquet', union_by_name=1);`;
      const [ref] = extractFileReferences(query);
      assert.strictEqual(ref.raw, 'jobs_failed/year={yyyy}/month={MM}/*.parquet');
    });

    it('extracts multiple files from array-form read_parquet', () => {
      const query = `SELECT * FROM read_parquet(['file1.parquet', 'file2.parquet'], union_by_name=1);`;
      const refs = extractFileReferences(query);
      assert.strictEqual(refs.length, 2);
      assert.strictEqual(refs[0].raw, 'file1.parquet');
      assert.strictEqual(refs[1].raw, 'file2.parquet');
    });

    it('extracts files from multiple function types in a CTE', () => {
      const query = `
        WITH csvData AS (SELECT * FROM read_csv('{bucket:my-bucket}/data.csv'))
        SELECT * FROM read_parquet('metrics.parquet');
      `;
      const refs = extractFileReferences(query);
      assert.strictEqual(refs.length, 2);
      assert.strictEqual(refs[0].raw, '{bucket:my-bucket}/data.csv');
      assert.strictEqual(refs[1].raw, 'metrics.parquet');
    });

    it('extracts files from read_json calls (used for avro plugin)', () => {
      const query = `SELECT * FROM read_json('my-file.avro');`;
      const [ref] = extractFileReferences(query);
      assert.strictEqual(ref.raw, 'my-file.avro');
    });

    it('includes ?cache= in the raw string for the path-parser to handle', () => {
      const query = `SELECT * FROM read_parquet('file.parquet?cache=false');`;
      const [ref] = extractFileReferences(query);
      assert.strictEqual(ref.raw, 'file.parquet?cache=false');
    });

    it('skips named parameters like union_by_name=1', () => {
      const query = `SELECT * FROM read_parquet('data.parquet', union_by_name=1, filename=1);`;
      const refs = extractFileReferences(query);
      assert.strictEqual(refs.length, 1);
      assert.strictEqual(refs[0].raw, 'data.parquet');
    });

    it('does not capture file names inside SQL comments', () => {
      const query = `
        -- read_parquet('commented-out.parquet')
        /* read_csv('also-ignored.csv') */
        SELECT * FROM read_parquet('real-file.parquet')
      `;
      const refs = extractFileReferences(query);
      assert.strictEqual(refs.length, 1);
      assert.strictEqual(refs[0].raw, 'real-file.parquet');
    });

    it('deduplicates the same file path referenced multiple times in a query', () => {
      const query = `
        WITH base AS (SELECT * FROM read_parquet('data.parquet'))
        SELECT a.id FROM base a
        JOIN base b ON a.id = b.id
        JOIN read_parquet('data.parquet') c ON a.id = c.id
      `;
      const refs = extractFileReferences(query);
      assert.strictEqual(refs.length, 1);
      assert.strictEqual(refs[0].raw, 'data.parquet');
    });

    it('returns an empty array for queries with no file-reading functions', () => {
      const query = `SELECT id, name FROM users WHERE id = 1;`;
      const refs = extractFileReferences(query);
      assert.deepStrictEqual(refs, []);
    });
  });
});
