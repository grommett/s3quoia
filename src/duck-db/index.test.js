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
                        getColumnsObjectJS() {
                          return { col1: [0, 0, 0], col2: [1, 1, 1] };
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
            error() {},
          },
        },
      });

      const actual = await query(`select * from table;`);
      assert.deepStrictEqual(actual, [
        { name: 'col1', fields: [0, 0, 0] },
        { name: 'col2', fields: [1, 1, 1] },
      ]);
    });

    it('returns row-based data when format is set to jsonRecords', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getColumnsObjectJS() {
                          return { id: [1, 2, 3], name: ['Alice', 'Bob', 'Charlie'], age: [25, 30, 35] };
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
            error() {},
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

    it('returns empty array for jsonRecords format when no data', async () => {
      const { query } = await esmock.strict('./index.js', {
        '@duckdb/node-api': {
          DuckDBInstance: {
            create() {
              return Promise.resolve({
                connect() {
                  return Promise.resolve({
                    runAndReadAll() {
                      return Promise.resolve({
                        getColumnsObjectJS() {
                          return {};
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
            error() {},
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
                        getColumnsObjectJS() {
                          return {};
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
            error() {},
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
