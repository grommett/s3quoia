import s3quoia from '../../src/s3quoia.js';

const rows = await s3quoia({
  query: "SELECT * FROM read_parquet('sales/**/*.parquet', union_by_name=true) ORDER BY date LIMIT 10",
  defaultEndpoint: 'http://localhost:9000',
  defaultBucket: 'demo',
  bucketsDir: '/tmp/s3quoia-scripts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  format: 'jsonRecords',
});

console.table(rows);
