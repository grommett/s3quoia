import { describe, it } from 'node:test';
import assert from 'node:assert';
import { datesInRange, hoursInRange, monthsInRange, buildPath } from './file-path-builder.js';

describe('file path builder', () => {
  describe('datesInRange', () => {
    it('returns date objects for each date within a time range', () => {
      const from = new Date('1972-08-03T00:00:00Z');
      const to = new Date('1972-08-13T00:00:00Z');
      const actual = datesInRange(from, to);
      assert.deepStrictEqual(actual.length, 11);
    });
  });

  describe('monthsInRange', () => {
    it('returns one date per month within a range in the same year', () => {
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-03-31T00:00:00Z');
      const actual = monthsInRange(from, to);
      assert.deepStrictEqual(actual.length, 3);
    });

    it('returns months spanning a year boundary', () => {
      const from = new Date('2024-11-01T00:00:00Z');
      const to = new Date('2025-02-28T00:00:00Z');
      const actual = monthsInRange(from, to);
      assert.deepStrictEqual(actual.length, 4);
    });

    it('returns a single month when from and to are in the same month', () => {
      const from = new Date('2024-06-01T00:00:00Z');
      const to = new Date('2024-06-15T00:00:00Z');
      const actual = monthsInRange(from, to);
      assert.deepStrictEqual(actual.length, 1);
    });
  });

  describe('hoursInRange', () => {
    it('returns date objects for each hour within a time range', () => {
      const from = new Date('1972-08-03T06:00:00Z');
      const to = new Date('1972-08-03T07:00:00Z');
      const actual = hoursInRange(from, to);
      assert.deepStrictEqual(actual.length, 2);
    });
  });

  describe('buildPath', () => {
    it('expands a date from a file pattern', () => {
      const expected =
        'vpc_objects_2rep/version=v1.0.0/env=production/year=2023/month=12/day=22/hour=*/minute=30/bareMetalServers_*.parquet';
      const actual = buildPath(
        'vpc_objects_2rep/version=v1.0.0/env=production/year={yyyy}/month={MM}/day={dd}/hour=*/minute=30/bareMetalServers_*.parquet',
        new Date('2023-12-22T00:30:00Z'),
      );
      assert.deepStrictEqual(actual, expected);
    });
  });
});
