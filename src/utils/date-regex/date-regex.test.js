import { describe, it } from 'node:test';
import assert from 'node:assert';
import { regexFromPattern, removeFileDatePatterns } from './date-regex.js';

describe('date-regex', () => {
  describe('regexFromPattern', () => {
    it('returns true when the generated regex matches a string', () => {
      const regex = regexFromPattern('/year={yyyy}/month={MM}/day=*/hour=*/minute=*/bareMetalServers_*.parquet');
      const file = `/year=2023/month=12/day=22/hour=21/minute=30/bareMetalServers_202312222130000000.parquet`;
      assert.deepStrictEqual(regex.test(file), true);
    });
    it('returns false when the generated regex matches does not match a string', () => {
      const regex = regexFromPattern('/year={yyyy}/month={MM}/day=*/hour=*/minute=*/accounts_*.parquet');
      const file = `/year=2023/month=12/day=22/hour=21/minute=30/bareMetalServers_202312222130000000.parquet`;
      assert.deepStrictEqual(regex.test(file), false);
    });
  });

  describe('removeFileDatePatterns', () => {
    it('replaces all date tokens with * to produce a DuckDB glob path', () => {
      const query = `SELECT * FROM read_parquet('/mnt/cos/bucket/year={yyyy}/month={MM}/day={dd}/data.parquet')`;
      const result = removeFileDatePatterns(query);
      assert.strictEqual(result, `SELECT * FROM read_parquet('/mnt/cos/bucket/year=*/month=*/day=*/data.parquet')`);
    });

    it('replaces hour, minute, and second tokens', () => {
      const result = removeFileDatePatterns('year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/second={ss}/f.parquet');
      assert.strictEqual(result, 'year=*/month=*/day=*/hour=*/minute=*/second=*/f.parquet');
    });

    it('leaves strings with no date tokens unchanged', () => {
      const result = removeFileDatePatterns('reports/summary.parquet');
      assert.strictEqual(result, 'reports/summary.parquet');
    });
  });
});
