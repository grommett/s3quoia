import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import s3Querier from '../src/s3-querier.js';

const ENDPOINT = 'http://localhost:9000';
const BUCKET = 'test-bucket';
const BUCKET_2 = 'test-bucket-2';
const ACCESS_KEY = 'test-access-key';
const SECRET_KEY = 'test-secret-key';

const FROM = new Date('2024-01-01').getTime();
const TO = new Date('2024-12-31').getTime();

function query(sql) {
  return s3Querier({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    defaultEndpoint: ENDPOINT,
    defaultBucket: BUCKET,
    bucketsDir,
    plugins: [],
    from: FROM,
    to: TO,
    query: sql,
    format: 'jsonRecords',
  });
}

let bucketsDir;

describe('s3-querier e2e', () => {
  before(async () => {
    bucketsDir = await mkdtemp(join(tmpdir(), 's3-e2e-'));
  });

  after(async () => {
    await rm(bucketsDir, { recursive: true });
  });

  it('downloads and queries a static parquet file', async () => {
    const result = await query(`SELECT * FROM read_parquet('reports/summary.parquet') ORDER BY id`);

    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { id: 1, event_type: 'login', region: 'us-east', value: 42.5 });
    assert.deepStrictEqual(result[2], { id: 3, event_type: 'purchase', region: 'eu-west', value: 199.99 });
  });

  it('downloads and queries a static csv file', async () => {
    const result = await query(`SELECT * FROM read_csv('reports/summary.csv') ORDER BY id`);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(Number(result[0].id), 1);
    assert.strictEqual(result[0].event_type, 'login');
    assert.strictEqual(result[0].region, 'us-east');
  });

  it('downloads and queries multiple parquet files via glob', async () => {
    const result = await query(`SELECT * FROM read_parquet('reports/2024/*.parquet', union_by_name=true) ORDER BY id`);

    assert.strictEqual(result.length, 6);
  });

  it('downloads only files within the date range using date tokens', async () => {
    const result = await s3Querier({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      defaultEndpoint: ENDPOINT,
      defaultBucket: BUCKET,
      bucketsDir,
      plugins: [],
      from: new Date('2024-01-14').getTime(),
      to: new Date('2024-01-15T23:59:59Z').getTime(),
      query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet') ORDER BY day, id`,
      format: 'jsonRecords',
    });

    assert.strictEqual(result.length, 6);
    assert.ok(result.every((row) => Number(row.day) === 14 || Number(row.day) === 15));
    assert.ok(result.every((row) => Number(row.day) !== 16));
  });

  it('joins a parquet and csv file in a single query', async () => {
    const result = await query(`
      SELECT p.id, p.event_type, c.region
      FROM read_parquet('reports/summary.parquet') p
      JOIN read_csv('reports/summary.csv') c ON p.id = c.id
      ORDER BY p.id
    `);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[0].event_type, 'login');
    assert.strictEqual(result[0].region, 'us-east');
  });

  it('throws when total download size exceeds MAX_MB_DOWNLOAD', async () => {
    process.env.MAX_MB_DOWNLOAD = '0.000001';
    try {
      await assert.rejects(
        () => s3Querier({
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
          defaultEndpoint: ENDPOINT,
          defaultBucket: BUCKET,
          bucketsDir,
          plugins: [],
          from: new Date(2024, 0, 14).getTime(),
          to: new Date(2024, 0, 16, 23, 59, 59).getTime(),
          query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet')`,
          format: 'jsonRecords',
        }),
        /exceeds/,
      );
    } finally {
      delete process.env.MAX_MB_DOWNLOAD;
    }
  });

  it('returns consistent results when the same file is referenced in multiple CTEs', async () => {
    const result = await query(`
      WITH a AS (SELECT * FROM read_parquet('reports/summary.parquet')),
           b AS (SELECT * FROM read_parquet('reports/summary.parquet'))
      SELECT a.id, a.event_type FROM a JOIN b ON a.id = b.id ORDER BY a.id
    `);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[0].event_type, 'login');
  });

  it('throws when no files match the date range', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 's3-e2e-empty-'));
    try {
      await assert.rejects(
        () => s3Querier({
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
          defaultEndpoint: ENDPOINT,
          defaultBucket: BUCKET,
          bucketsDir: emptyDir,
          plugins: [],
          from: new Date('2020-01-01').getTime(),
          to: new Date('2020-12-31').getTime(),
          query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet')`,
          format: 'jsonRecords',
        }),
        /No files found/,
      );
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });

  it('re-downloads a file when ?cache=false is set, ignoring the local cache', async () => {
    const cacheTestDir = await mkdtemp(join(tmpdir(), 's3-e2e-cache-'));
    const cachedFilePath = join(cacheTestDir, BUCKET, 'reports/summary.parquet');
    const baseOptions = {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      defaultEndpoint: ENDPOINT,
      defaultBucket: BUCKET,
      bucketsDir: cacheTestDir,
      plugins: [],
      from: FROM,
      to: TO,
      format: 'jsonRecords',
    };

    try {
      await s3Querier({ ...baseOptions, query: `SELECT * FROM read_parquet('reports/summary.parquet') ORDER BY id` });
      await writeFile(cachedFilePath, Buffer.alloc(0));

      const result = await s3Querier({
        ...baseOptions,
        query: `SELECT * FROM read_parquet('reports/summary.parquet?cache=false') ORDER BY id`,
      });

      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], { id: 1, event_type: 'login', region: 'us-east', value: 42.5 });
    } finally {
      await rm(cacheTestDir, { recursive: true });
    }
  });

  it('routes to the correct S3 instance using {endpoint} and {bucket} tokens in the query', async () => {
    const result = await s3Querier({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      defaultEndpoint: 'http://nonexistent.example.com',
      defaultBucket: 'nonexistent-bucket',
      bucketsDir,
      plugins: [],
      from: FROM,
      to: TO,
      query: `SELECT * FROM read_parquet('{endpoint:${ENDPOINT}}/{bucket:${BUCKET}}/reports/summary.parquet') ORDER BY id`,
      format: 'jsonRecords',
    });

    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { id: 1, event_type: 'login', region: 'us-east', value: 42.5 });
  });

  it('downloads only files within the hour range using {hh} date tokens', async () => {
    const hourTestDir = await mkdtemp(join(tmpdir(), 's3-e2e-hours-'));
    try {
      const result = await s3Querier({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: hourTestDir,
        plugins: [],
        from: new Date(2024, 0, 14, 0).getTime(),
        to: new Date(2024, 0, 14, 1, 59, 59).getTime(),
        query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/hour={hh}/data.parquet') ORDER BY hour, id`,
        format: 'jsonRecords',
      });

      assert.strictEqual(result.length, 6);
      assert.ok(result.every((row) => Number(row.hour) === 0 || Number(row.hour) === 1));
      assert.ok(result.every((row) => Number(row.hour) !== 2));
    } finally {
      await rm(hourTestDir, { recursive: true });
    }
  });

  it('downloads files spanning multiple months using date tokens', async () => {
    const multiMonthDir = await mkdtemp(join(tmpdir(), 's3-e2e-multi-month-'));
    try {
      const result = await s3Querier({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: multiMonthDir,
        plugins: [],
        from: new Date(2024, 0, 15).getTime(),
        to: new Date(2024, 1, 1, 23, 59, 59).getTime(),
        query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet') ORDER BY day, id`,
        format: 'jsonRecords',
      });

      assert.strictEqual(result.length, 9);
      assert.ok(result.some((row) => Number(row.day) === 15));
      assert.ok(result.some((row) => Number(row.day) === 16));
      assert.ok(result.some((row) => Number(row.day) === 1));
    } finally {
      await rm(multiMonthDir, { recursive: true });
    }
  });

  it('joins files from two different buckets using {bucket} tokens (ignores whitespace & comments too)', async () => {
    const result = await s3Querier({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      defaultEndpoint: ENDPOINT,
      defaultBucket: BUCKET,
      bucketsDir,
      plugins: [],
      from: FROM,
      to: TO,
      query: `
        SELECT s.id, s.event_type, r.description
        FROM read_parquet('{ bucket: ${BUCKET} }/reports/summary.parquet') s
        -- also ignores whitespace in tokens
        JOIN read_parquet('{ bucket: ${BUCKET_2} }/reference.parquet') r ON s.id = r.id -- a comment
        -- and comments
        ORDER BY s.id
      `,
      format: 'jsonRecords',
    });

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[0].event_type, 'login');
    assert.strictEqual(result[0].description, 'user login event');
    assert.strictEqual(result[2].description, 'purchase completed');
  });
});
