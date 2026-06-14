import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('duckdb', () => {
  describe('query', () => {
    it('returns columnar data by default', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getColumnsJS() {
                          return [
                            [0, 0, 0],
                            [1, 1, 1],
                          ];
                        },
                      });
                    },
                  });
                },
              });
            },
          },
        },
        '../utils/logger.js': {
          logger: {
            info() {},
          },
        },
      });

      const actual = await query(`select * from table;`);
      assert.deepStrictEqual(actual, [
        [0, 0, 0],
        [1, 1, 1],
      ]);
    });

    it('returns row-based data when format is set to row', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getRowObjectsJS() {
                          return [
                            { id: 1, name: 'Alice', age: 25 },
                            { id: 2, name: 'Bob', age: 30 },
                            { id: 3, name: 'Charlie', age: 35 },
                          ];
                        },
                      });
                    },
                  });
                },
              });
            },
          },
        },
        '../utils/logger.js': {
          logger: {
            info() {},
          },
        },
      });

      const actual = await query(`select * from users;`, { format: 'jsonRecords' });
      const expected = [
        { id: 1, name: 'Alice', age: 25 },
        { id: 2, name: 'Bob', age: 30 },
        { id: 3, name: 'Charlie', age: 35 },
      ];
      assert.deepStrictEqual(actual, expected);
    });

    it('returns empty array for row format when no data', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getRowObjectsJS() {
                          return [];
                        },
                      });
                    },
                  });
                },
              });
            },
          },
        },
        '../utils/logger.js': {
          logger: {
            info() {},
          },
        },
      });

      const actual = await query(`select * from empty_table;`, { format: 'jsonRecords' });
      assert.deepStrictEqual(actual, []);
    });

    it('returns empty array for columnar format when no data', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getColumnsJS() {
                          return [];
                        },
                      });
                    },
                  });
                },
              });
            },
          },
        },
        '../utils/logger.js': {
          logger: {
            info() {},
          },
        },
      });

      const actual = await query(`select * from empty_table;`);
      assert.deepStrictEqual(actual, []);
    });

    it('logs an error when an error is thrown', async () => {
      const loggerErrorSpy = mock.fn(() => {});
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  throw new Error('o_0');
                },
              });
            },
          },
        },
        '../utils/logger.js': {
          logger: {
            error: loggerErrorSpy,
          },
        },
      });
      try {
        await query(`select * from table;`);
      } catch {
        assert.deepStrictEqual(loggerErrorSpy.mock.callCount(), 1);
      }
    });
  });
});
