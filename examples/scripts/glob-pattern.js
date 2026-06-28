/**
 * Demonstrates glob patterns: query only January and February sales
 * using a brace-expansion glob instead of the full wildcard.
 */
import s3quoia from '../../src/s3quoia.js';

const rows = await s3quoia({
  query: "SELECT product, ROUND(SUM(amount), 2) AS total FROM read_parquet('sales/year=2024/month=0[12]/*.parquet', union_by_name=true) GROUP BY product ORDER BY total DESC",
  defaultEndpoint: 'http://localhost:9000',
  defaultBucket: 'demo',
  bucketsDir: '/tmp/s3quoia-scripts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  format: 'jsonRecords',
});

console.table(rows);
