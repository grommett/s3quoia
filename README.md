# s3-querier

Query S3-compatible storage directly with DuckDB SQL. S3 Querier handles listing files, downloading them locally, and executing your query — turning a data lake into a queryable resource with a single function call.

## Requirements

- Node.js >= 22
- S3-compatible storage (AWS S3, MinIO, IBM COS, etc.) with HMAC or IBM IAM credentials

## Installation

```bash
npm install s3-querier
```

## Usage

```js
import s3Querier from 's3-querier';

const results = await s3Querier({
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  defaultEndpoint: 'https://s3.amazonaws.com',
  defaultBucket: 'my-bucket',
  bucketsDir: '/tmp/s3-cache',
  from: new Date('2025-01-01').getTime(),
  to: new Date('2025-01-31').getTime(),
  query: `SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet')`,
  format: 'jsonRecords',
});
```

## API

### `s3Querier(options)`

Returns a `Promise` that resolves to the query results.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `accessKeyId` | `string` | ✓ | HMAC access key ID |
| `secretAccessKey` | `string` | ✓ | HMAC secret access key |
| `defaultEndpoint` | `string` | ✓ | S3 endpoint URL |
| `defaultBucket` | `string` | ✓ | Default bucket name |
| `bucketsDir` | `string` | ✓ | Local directory for caching downloaded files |
| `query` | `string` | ✓ | DuckDB SQL query |
| `from` | `number` | | Start of date range as a Unix timestamp (ms). Required when using date tokens. |
| `to` | `number` | | End of date range as a Unix timestamp (ms). Required when using date tokens. |
| `format` | `string` | | Output format. `'jsonRecords'` returns an array of row objects. Default is columnar (`[[col1val, ...], [col2val, ...]]`). |
| `plugins` | `array` | | Additional plugins to extend query processing. |

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `MAX_MB_DOWNLOAD` | `1000` | Maximum total download size in MB per query. Queries exceeding this limit throw an error. |

## Query Syntax

### Static Files

```sql
SELECT * FROM read_parquet('reports/summary.parquet') LIMIT 10;
```

### Date Tokens

When `from` and `to` are provided, date tokens are expanded into a list of matching file paths.

```sql
SELECT *
FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet', union_by_name=1);
```

| Token | Description | Example |
| --- | --- | --- |
| `{yyyy}` | 4-digit year | `2025` |
| `{MM}` | 2-digit month | `01`–`12` |
| `{dd}` | 2-digit day | `01`–`31` |
| `{hh}` | 2-digit hour | `00`–`23` |
| `{mm}` | 2-digit minute | `00`–`59` |
| `{ss}` | 2-digit second | `00`–`59` |

### Glob Patterns

```sql
SELECT * FROM read_parquet('reports/2025/*.parquet', union_by_name=1);
```

### Location Tokens

Override the default endpoint and bucket per file reference within a query.

```sql
SELECT *
FROM read_parquet('{endpoint:https://s3.us-east.example.com}/{bucket:my-bucket}/data.parquet');
```

### Cross-Bucket Joins

```sql
SELECT s.id, s.event_type, r.description
FROM read_parquet('{bucket:events-bucket}/reports/summary.parquet') s
JOIN read_parquet('{bucket:reference-bucket}/lookup.parquet') r ON s.id = r.id;
```

### Cache Control

Append `?cache=false` to force a fresh download, bypassing the local cache.

```sql
SELECT * FROM read_parquet('reports/summary.parquet?cache=false');
```

## Caching

Downloaded files are cached to `bucketsDir` on disk. Subsequent queries that reference the same files skip the download entirely. The listing cache (S3 object listings) is held in memory per process using an LRU cache, with today's prefix always re-fetched to pick up new files.

## Plugins

The `plugins` option accepts an array of plugin objects that can extend query parsing and file processing. A plugin may implement:

- `processQuery(context)` — transform the query context before execution
- `processFile(filePath)` — process each downloaded file (e.g. convert Avro to JSON)

The built-in Avro plugin is an example:

```js
import s3Querier from 's3-querier';
import AvroPlugin from 's3-querier/src/plugins/avro/avro-plugin.js';

const results = await s3Querier({
  // ...
  plugins: [new AvroPlugin()],
  query: `SELECT * FROM read_json('data.avro+json')`,
});
```

## Examples

The `examples/` directory contains a local interactive demo and standalone scripts. All examples target a local MinIO instance — you'll need [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed. Both are bundled with Docker Desktop on Mac and Windows; on Linux, install the Compose plugin separately.

### Interactive demo

Starts MinIO, seeds it with sample parquet data, and launches an Express server with a Monaco SQL editor in the browser.

```bash
npm run demo:up     # start MinIO and seed data (runs once)
npm run demo:start  # start the Express server
```

Then open [http://localhost:3000](http://localhost:3000). The editor has five pre-loaded example queries you can run or modify. When you're done:

```bash
npm run demo:down   # stop MinIO
```

### Standalone scripts

Run any script directly after MinIO is up:

```bash
npm run demo:up                               # if not already running
node examples/scripts/basic-query.js         # fetch the first 10 sales rows
node examples/scripts/glob-pattern.js        # filter to Jan–Feb with a brace glob
node examples/scripts/date-range.js          # use {from}/{to} date tokens
node examples/scripts/ibm-cos.js             # IBM Cloud Object Storage (requires env vars)
```

For the IBM COS script, set these environment variables first:

```bash
export IBM_COS_API_KEY=your-api-key
export IBM_COS_ENDPOINT=https://s3.us-south.cloud-object-storage.appdomain.cloud
export IBM_COS_BUCKET=your-bucket
```

## License

MIT
