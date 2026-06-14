import { DuckDBInstance } from '@duckdb/node-api';
import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT = 'http://localhost:9000';
const ACCESS_KEY_ID = 'minioadmin';
const SECRET_ACCESS_KEY = 'minioadmin';
const BUCKET = 'demo';

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();

async function writeAndUpload(sql, key) {
  const safeName = key.replaceAll('/', '-');
  const tmpPath = join(tmpdir(), `s3-querier-demo-${safeName}`);
  await conn.run(`COPY (${sql}) TO '${tmpPath}' (FORMAT PARQUET)`);
  const body = await readFile(tmpPath);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
  await unlink(tmpPath);
  console.log(`seeded: ${key}`);
}

try {
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
} catch (err) {
  if (err.Code !== 'BucketAlreadyOwnedByYou') throw err;
}

await Promise.all([
  writeAndUpload(
    `SELECT range + 1 AS id,
      date_add(date '2024-01-01', INTERVAL (range % 31) DAY) AS date,
      ['Widget A','Widget B','Gadget X','Gadget Y'][(range % 4) + 1] AS product,
      round(50 + random() * 950, 2) AS amount,
      ['North','South','East','West'][(range % 4) + 1] AS region
    FROM range(120)`,
    'sales/year=2024/month=01/data.parquet',
  ),
  writeAndUpload(
    `SELECT range + 121 AS id,
      date_add(date '2024-02-01', INTERVAL (range % 29) DAY) AS date,
      ['Widget A','Widget B','Gadget X','Gadget Y'][(range % 4) + 1] AS product,
      round(50 + random() * 950, 2) AS amount,
      ['North','South','East','West'][(range % 4) + 1] AS region
    FROM range(110)`,
    'sales/year=2024/month=02/data.parquet',
  ),
  writeAndUpload(
    `SELECT range + 231 AS id,
      date_add(date '2024-03-01', INTERVAL (range % 31) DAY) AS date,
      ['Widget A','Widget B','Gadget X','Gadget Y'][(range % 4) + 1] AS product,
      round(50 + random() * 950, 2) AS amount,
      ['North','South','East','West'][(range % 4) + 1] AS region
    FROM range(130)`,
    'sales/year=2024/month=03/data.parquet',
  ),
  writeAndUpload(
    `SELECT unnest(['Widget A','Widget B','Gadget X','Gadget Y']) AS name,
      unnest(['Widgets','Widgets','Gadgets','Gadgets']) AS category,
      unnest([29.99, 49.99, 99.99, 149.99]) AS price`,
    'products/catalog.parquet',
  ),
]);

console.log('Demo data seeded. MinIO console: http://localhost:9001');
