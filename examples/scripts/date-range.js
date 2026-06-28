/**
 * Demonstrates date tokens. s3quoia expands {yyyy}/{MM}/{dd} in the path
 * into one prefix per day in the from/to range, so only matching partitions
 * are downloaded rather than the entire bucket.
 */
import s3quoia from '../../src/s3quoia.js';

const from = new Date('2024-02-01').getTime();
const to = new Date('2024-02-28').getTime();

const rows = await s3quoia({
  query: "SELECT date, product, amount FROM read_parquet('sales/year={yyyy}/month={MM}/data.parquet', union_by_name=true) ORDER BY date",
  defaultEndpoint: 'http://localhost:9000',
  defaultBucket: 'demo',
  bucketsDir: '/tmp/s3quoia-scripts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  from,
  to,
  format: 'jsonRecords',
});

console.table(rows);
