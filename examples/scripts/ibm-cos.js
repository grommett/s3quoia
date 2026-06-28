/**
 * IBM Cloud Object Storage example using API key authentication.
 * Set IBM_COS_API_KEY, IBM_COS_ENDPOINT, and IBM_COS_BUCKET as env vars.
 */
import s3quoia from '../../src/s3quoia.js';

const { IBM_COS_API_KEY, IBM_COS_ENDPOINT, IBM_COS_BUCKET } = process.env;

if (!IBM_COS_API_KEY || !IBM_COS_ENDPOINT || !IBM_COS_BUCKET) {
  console.error('Set IBM_COS_API_KEY, IBM_COS_ENDPOINT, and IBM_COS_BUCKET');
  process.exit(1);
}

const rows = await s3quoia({
  query: "SELECT * FROM read_parquet('data/**/*.parquet', union_by_name=true) LIMIT 10",
  defaultEndpoint: IBM_COS_ENDPOINT,
  defaultBucket: IBM_COS_BUCKET,
  bucketsDir: '/tmp/s3quoia-scripts',
  apiKey: IBM_COS_API_KEY,
  format: 'jsonRecords',
});

console.table(rows);
