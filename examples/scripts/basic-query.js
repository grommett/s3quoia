import s3Querier from '../../src/s3-querier.js';

const rows = await s3Querier({
  query: "SELECT * FROM read_parquet('sales/**/*.parquet', union_by_name=true) ORDER BY date LIMIT 10",
  defaultEndpoint: 'http://localhost:9000',
  defaultBucket: 'demo',
  bucketsDir: '/tmp/s3-querier-scripts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  format: 'jsonRecords',
});

console.table(rows);
