import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DuckDBInstance } from '@duckdb/node-api';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT = 'http://localhost:9000';
const BUCKET = 'test-bucket';
const BUCKET_2 = 'test-bucket-2';
const ACCESS_KEY = 'test-access-key';
const SECRET_KEY = 'test-secret-key';

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

async function createBucket(name) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`Bucket '${name}' created`);
  } catch (error) {
    if (error.Code === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyOwnedByYou') {
      console.log(`Bucket '${name}' already exists`);
    } else {
      throw error;
    }
  }
}

async function generateFixtures() {
  const dir = await mkdtemp(join(tmpdir(), 's3-e2e-seed-'));
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  const testData = `
    SELECT 1 AS id, 'login'    AS event_type, 'us-east' AS region, 42.5  AS value
    UNION ALL SELECT 2, 'logout',   'us-west', 18.3
    UNION ALL SELECT 3, 'purchase', 'eu-west', 199.99
  `;

  const day14Data = `SELECT 1 AS id, 14 AS day UNION ALL SELECT 2, 14 UNION ALL SELECT 3, 14`;
  const day15Data = `SELECT 1 AS id, 15 AS day UNION ALL SELECT 2, 15 UNION ALL SELECT 3, 15`;
  const day16Data = `SELECT 1 AS id, 16 AS day UNION ALL SELECT 2, 16 UNION ALL SELECT 3, 16`;
  const feb01Data = `SELECT 1 AS id, 1 AS day UNION ALL SELECT 2, 1 UNION ALL SELECT 3, 1`;
  const hour00Data = `SELECT 1 AS id, 0 AS hour UNION ALL SELECT 2, 0 UNION ALL SELECT 3, 0`;
  const hour01Data = `SELECT 1 AS id, 1 AS hour UNION ALL SELECT 2, 1 UNION ALL SELECT 3, 1`;
  const hour02Data = `SELECT 1 AS id, 2 AS hour UNION ALL SELECT 2, 2 UNION ALL SELECT 3, 2`;

  const referenceData = `
    SELECT 1 AS id, 'user login event'    AS description
    UNION ALL SELECT 2, 'user logout event'
    UNION ALL SELECT 3, 'purchase completed'
  `;

  const parquetPath = join(dir, 'data.parquet');
  const csvPath = join(dir, 'data.csv');
  const day14Path = join(dir, 'day14.parquet');
  const day15Path = join(dir, 'day15.parquet');
  const day16Path = join(dir, 'day16.parquet');
  const feb01Path = join(dir, 'feb01.parquet');
  const hour00Path = join(dir, 'hour00.parquet');
  const hour01Path = join(dir, 'hour01.parquet');
  const hour02Path = join(dir, 'hour02.parquet');
  const referencePath = join(dir, 'reference.parquet');

  await conn.run(`COPY (${testData}) TO '${parquetPath}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${testData}) TO '${csvPath}' (FORMAT CSV, HEADER)`);
  await conn.run(`COPY (${day14Data}) TO '${day14Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${day15Data}) TO '${day15Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${day16Data}) TO '${day16Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${feb01Data}) TO '${feb01Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${hour00Data}) TO '${hour00Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${hour01Data}) TO '${hour01Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${hour02Data}) TO '${hour02Path}' (FORMAT PARQUET)`);
  await conn.run(`COPY (${referenceData}) TO '${referencePath}' (FORMAT PARQUET)`);

  return { dir, parquetPath, csvPath, day14Path, day15Path, day16Path, feb01Path, hour00Path, hour01Path, hour02Path, referencePath };
}

async function upload(bucket, key, filePath) {
  const body = await readFile(filePath);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  console.log(`Uploaded ${bucket}/${key}`);
}

const { dir, parquetPath, csvPath, day14Path, day15Path, day16Path, feb01Path, hour00Path, hour01Path, hour02Path, referencePath } = await generateFixtures();

await Promise.all([createBucket(BUCKET), createBucket(BUCKET_2)]);

await Promise.all([
  upload(BUCKET, 'reports/summary.parquet', parquetPath),
  upload(BUCKET, 'reports/summary.csv', csvPath),
  upload(BUCKET, 'reports/2024/summary.parquet', parquetPath),
  upload(BUCKET, 'reports/2024/detail.parquet', parquetPath),
  upload(BUCKET, 'events/year=2024/month=01/day=14/data.parquet', day14Path),
  upload(BUCKET, 'events/year=2024/month=01/day=15/data.parquet', day15Path),
  upload(BUCKET, 'events/year=2024/month=01/day=16/data.parquet', day16Path),
  upload(BUCKET, 'events/year=2024/month=02/day=01/data.parquet', feb01Path),
  upload(BUCKET, 'events/year=2024/month=01/day=14/hour=00/data.parquet', hour00Path),
  upload(BUCKET, 'events/year=2024/month=01/day=14/hour=01/data.parquet', hour01Path),
  upload(BUCKET, 'events/year=2024/month=01/day=14/hour=02/data.parquet', hour02Path),
  upload(BUCKET_2, 'reference.parquet', referencePath),
]);

await rm(dir, { recursive: true });
