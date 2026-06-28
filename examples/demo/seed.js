import { DuckDBInstance } from '@duckdb/node-api';
import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT = 'http://localhost:9000';
const ACCESS_KEY_ID = 'minioadmin';
const SECRET_ACCESS_KEY = 'minioadmin';
const BUCKET = 'demo';

const SALES_MONTHS = [
  { year: 2024, month: 1, days: 31, count: 120 },
  { year: 2024, month: 2, days: 29, count: 110 },
  { year: 2024, month: 3, days: 31, count: 130 },
  { year: 2024, month: 4, days: 30, count: 115 },
  { year: 2024, month: 5, days: 31, count: 125 },
  { year: 2024, month: 6, days: 30, count: 120 },
  { year: 2024, month: 7, days: 31, count: 135 },
  { year: 2024, month: 8, days: 31, count: 130 },
  { year: 2024, month: 9, days: 30, count: 110 },
  { year: 2024, month: 10, days: 31, count: 125 },
  { year: 2024, month: 11, days: 30, count: 115 },
  { year: 2024, month: 12, days: 31, count: 140 },
  { year: 2025, month: 1, days: 31, count: 130 },
  { year: 2025, month: 2, days: 28, count: 115 },
  { year: 2025, month: 3, days: 31, count: 125 },
];

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();

try {
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
} catch (err) {
  if (err.Code !== 'BucketAlreadyOwnedByYou') throw err;
}

const { uploads: salesUploads } = SALES_MONTHS.reduce(addSalesUpload, { nextId: 1, uploads: [] });

await Promise.all([
  ...salesUploads,
  writeAndUpload(
    `SELECT unnest(['Widget A','Widget B','Gadget X','Gadget Y']) AS name,
      unnest(['Widgets','Widgets','Gadgets','Gadgets']) AS category,
      unnest([29.99, 49.99, 99.99, 149.99]) AS price`,
    'products/catalog.parquet',
  ),
]);

console.log('Demo data seeded. MinIO console: http://localhost:9001');

/** Helpers */

async function writeAndUpload(sql, key) {
  const safeName = key.replaceAll('/', '-');
  const tmpPath = join(tmpdir(), `s3quoia-demo-${safeName}`);
  await conn.run(`COPY (${sql}) TO '${tmpPath}' (FORMAT PARQUET)`);
  const body = await readFile(tmpPath);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
  await unlink(tmpPath);
  console.log(`seeded: ${key}`);
}

function addSalesUpload(acc, { year, month, days, count }) {
  const upload = writeAndUpload(salesMonthSql(acc.nextId, year, month, days, count), salesMonthKey(year, month));
  return { nextId: acc.nextId + count, uploads: [...acc.uploads, upload] };
}

function salesMonthSql(startId, year, month, days, count) {
  const mm = String(month).padStart(2, '0');
  return `SELECT range + ${startId} AS id,
    date_add(date '${year}-${mm}-01', INTERVAL (range % ${days}) DAY) AS date,
    ['Widget A','Widget B','Gadget X','Gadget Y'][(range % 4) + 1] AS product,
    round(50 + random() * 950, 2) AS amount,
    ['North','South','East','West'][(range % 4) + 1] AS region
  FROM range(${count})`;
}

function salesMonthKey(year, month) {
  const mm = String(month).padStart(2, '0');
  return `sales/year=${year}/month=${mm}/data.parquet`;
}
