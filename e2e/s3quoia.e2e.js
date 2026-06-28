import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import s3quoia, { StatsPlugin } from '../src/s3quoia.js';

const ENDPOINT = 'http://localhost:9000';
const BUCKET = 'test-bucket';
const BUCKET_2 = 'test-bucket-2';
const ACCESS_KEY = 'test-access-key';
const SECRET_KEY = 'test-secret-key';

const FROM = new Date('2024-01-01').getTime();
const TO = new Date('2024-12-31').getTime();
const statsPlugin = new StatsPlugin((event) => console.log(`[stats] ${new Date().toISOString()}`, event));

function query(sql) {
  return s3quoia({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    defaultEndpoint: ENDPOINT,
    defaultBucket: BUCKET,
    bucketsDir,
    plugins: [statsPlugin],
    from: FROM,
    to: TO,
    query: sql,
    format: 'jsonRecords',
  });
}

let bucketsDir;

describe('s3quoia e2e', () => {
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
    const result = await s3quoia({
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
        () => s3quoia({
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
          defaultEndpoint: ENDPOINT,
          defaultBucket: BUCKET,
          bucketsDir,
          plugins: [],
          from: new Date('2024-01-14T00:00:00Z').getTime(),
          to: new Date('2024-01-16T23:59:59Z').getTime(),
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
        () => s3quoia({
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
      await s3quoia({ ...baseOptions, query: `SELECT * FROM read_parquet('reports/summary.parquet') ORDER BY id` });
      await writeFile(cachedFilePath, Buffer.alloc(0));

      const result = await s3quoia({
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
    const result = await s3quoia({
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
      const result = await s3quoia({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: hourTestDir,
        plugins: [],
        from: new Date('2024-01-14T00:00:00Z').getTime(),
        to: new Date('2024-01-14T01:59:59Z').getTime(),
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
      const result = await s3quoia({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: multiMonthDir,
        plugins: [],
        from: new Date('2024-01-15T00:00:00Z').getTime(),
        to: new Date('2024-02-01T23:59:59Z').getTime(),
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

  it('downloads only files within the month range using {yyyy}/{MM} tokens without a day token', async () => {
    const monthRangeDir = await mkdtemp(join(tmpdir(), 's3-e2e-month-range-'));
    try {
      const result = await s3quoia({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: monthRangeDir,
        plugins: [],
        from: new Date('2024-01-01T00:00:00Z').getTime(),
        to: new Date('2024-03-31T23:59:59Z').getTime(),
        query: `SELECT * FROM read_parquet('sales/year={yyyy}/month={MM}/data.parquet') ORDER BY year, month, id`,
        format: 'jsonRecords',
      });

      assert.strictEqual(result.length, 9);
      assert.ok(result.every((row) => Number(row.year) === 2024));
      assert.ok(result.some((row) => Number(row.month) === 1));
      assert.ok(result.some((row) => Number(row.month) === 2));
      assert.ok(result.some((row) => Number(row.month) === 3));
      assert.ok(result.every((row) => Number(row.month) !== 4));
    } finally {
      await rm(monthRangeDir, { recursive: true });
    }
  });

  it('returns correct results for parallel queries over different date ranges', async () => {
    const parallelDir = await mkdtemp(join(tmpdir(), 's3-e2e-parallel-'));
    const baseOptions = {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      defaultEndpoint: ENDPOINT,
      defaultBucket: BUCKET,
      bucketsDir: parallelDir,
      plugins: [],
      format: 'jsonRecords',
      query: `SELECT * FROM read_parquet('sales/year={yyyy}/month={MM}/data.parquet', union_by_name=1) ORDER BY year, month, id`,
    };
    try {
      const [q1_2024, q1_2025] = await Promise.all([
        s3quoia({ ...baseOptions, from: new Date('2024-01-01T00:00:00Z').getTime(), to: new Date('2024-03-31T23:59:59Z').getTime() }),
        s3quoia({ ...baseOptions, from: new Date('2025-01-01T00:00:00Z').getTime(), to: new Date('2025-01-31T23:59:59Z').getTime() }),
      ]);

      assert.strictEqual(q1_2024.length, 9);
      assert.ok(q1_2024.every((row) => Number(row.year) === 2024));
      assert.ok(q1_2024.every((row) => Number(row.month) !== 4));

      assert.strictEqual(q1_2025.length, 3);
      assert.ok(q1_2025.every((row) => Number(row.year) === 2025));
    } finally {
      await rm(parallelDir, { recursive: true });
    }
  });

  it('handles concurrent cache=false downloads of the same file without corruption', async () => {
    const concurrentDir = await mkdtemp(join(tmpdir(), 's3-e2e-concurrent-'));
    try {
      const options = {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: concurrentDir,
        plugins: [],
        from: FROM,
        to: TO,
        format: 'jsonRecords',
        query: `SELECT * FROM read_parquet('reports/summary.parquet?cache=false') ORDER BY id`,
      };

      const [result1, result2] = await Promise.all([s3quoia(options), s3quoia(options)]);

      assert.strictEqual(result1.length, 3);
      assert.strictEqual(result2.length, 3);
      assert.deepStrictEqual(result1[0], { id: 1, event_type: 'login', region: 'us-east', value: 42.5 });
      assert.deepStrictEqual(result2[0], { id: 1, event_type: 'login', region: 'us-east', value: 42.5 });
    } finally {
      await rm(concurrentDir, { recursive: true });
    }
  });

  it('StatsPlugin fires listing, download, and query events', async () => {
    const events = [];
    const stats = new StatsPlugin((event) => events.push(event));
    const statsDir = await mkdtemp(join(tmpdir(), 's3-e2e-stats-'));

    try {
      await s3quoia({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        defaultEndpoint: ENDPOINT,
        defaultBucket: BUCKET,
        bucketsDir: statsDir,
        plugins: [stats],
        from: new Date('2024-01-14T00:00:00Z').getTime(),
        to: new Date('2024-01-15T23:59:59Z').getTime(),
        query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet') ORDER BY day, id`,
        format: 'jsonRecords',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const listingEvents = events.filter((event) => event.type === 'listing');
      const downloadEvents = events.filter((event) => event.type === 'download');
      const queryEvents = events.filter((event) => event.type === 'query');

      assert.ok(listingEvents.length > 0, 'expected at least one listing event');
      assert.ok(listingEvents.every((event) => typeof event.durationMs === 'number'));
      assert.ok(listingEvents.every((event) => typeof event.cacheHit === 'boolean'));

      assert.strictEqual(downloadEvents.length, 1);
      assert.strictEqual(downloadEvents[0].bucket, BUCKET);
      assert.ok(typeof downloadEvents[0].cacheHits === 'number');
      assert.ok(typeof downloadEvents[0].cacheMisses === 'number');
      assert.ok(typeof downloadEvents[0].durationMs === 'number');

      assert.strictEqual(queryEvents.length, 1);
      assert.ok(typeof queryEvents[0].durationMs === 'number');
      assert.strictEqual(queryEvents[0].rowCount, 6);
    } finally {
      await rm(statsDir, { recursive: true });
    }
  });

  it('joins files from two different buckets using {bucket} tokens (ignores whitespace & comments too)', async () => {
    const result = await s3quoia({
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
