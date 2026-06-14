/**
 * Demonstrates glob patterns: query only January and February sales
 * using a brace-expansion glob instead of the full wildcard.
 */
import s3Querier from '../../src/s3-querier.js';

const rows = await s3Querier({
  query: "SELECT product, ROUND(SUM(amount), 2) AS total FROM read_parquet('sales/year=2024/month=0[12]/*.parquet', union_by_name=true) GROUP BY product ORDER BY total DESC",
  defaultEndpoint: 'http://localhost:9000',
  defaultBucket: 'demo',
  bucketsDir: '/tmp/s3-querier-scripts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  format: 'jsonRecords',
});

console.table(rows);
