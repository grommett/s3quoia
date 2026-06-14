import { DuckDBInstance } from '@duckdb/node-api';
import { logger } from '../utils/logger.js';

const db = await DuckDBInstance.create(':memory:', {
  threads: 4,
});

const formatStrategies = {
  jsonRecords: (reader) => reader.getRowObjectsJS(),
  default: (reader) => reader.getColumnsJS(),
};

/**
 * Execute a SQL query and return results in the specified format
 *
 * @param {string} sql - The SQL query to execute
 * @param {object} options - Query options
 * @param {string} options.format - Output format: 'row' for row-based, otherwise columnar (default)
 * @returns {Promise<Array>} Query results in the specified format
 */
export async function query(sql, options = {}) {
  const { format } = options;
  const queryStart = new Date();

  try {
    const connection = await db.connect();
    const reader = await connection.runAndReadAll(sql);

    const formatter = formatStrategies[format] ?? formatStrategies.default;
    const result = formatter(reader);

    const queryTime = new Date() - queryStart;
    logger.info(`Query completed in : ${queryTime / 1000} seconds`);
    return result ?? [];
  } catch (error) {
    logger.error(error);
    throw error;
  }
}
