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
| `format` | `string` | | Output format. `'jsonRecords'` returns `[{ col: val }]`. Default is columnar `[{ name, fields: [val, ...] }]`. |
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

## BigInt

> [!WARNING]
> DuckDB returns `BigInt` for `COUNT(*)`, `SUM`, and other integer aggregations. `BigInt` is not JSON-serializable — `JSON.stringify` will throw.

The safest fix is to cast in SQL:

```sql
SELECT CAST(COUNT(*) AS INTEGER) AS total FROM read_parquet('data.parquet')
```

If you can't control the query, use the exported `bigintReplacer` with `JSON.stringify`:

```js
import s3Querier, { bigintReplacer } from 's3-querier';

const results = await s3Querier({ ..., format: 'jsonRecords' });
const json = JSON.stringify(results, bigintReplacer);
```

Note: `bigintReplacer` converts `BigInt` to `Number`, which loses precision for values above `Number.MAX_SAFE_INTEGER` (~9 quadrillion). For large integer IDs or counters, prefer the SQL cast.

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

## MCP Server

s3-querier ships a [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes two tools to any MCP-compatible client (Claude Desktop, Claude Code, etc.):

- **`query`** — runs a DuckDB SQL query against your S3 data
- **`list_files`** — lists objects under a prefix so an LLM can discover available data

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `S3_ENDPOINT` | ✓ | S3 endpoint URL |
| `S3_BUCKET` | ✓ | Default bucket |
| `S3_ACCESS_KEY_ID` | ✓ * | HMAC access key |
| `S3_SECRET_ACCESS_KEY` | ✓ * | HMAC secret key |
| `S3_API_KEY` | ✓ * | IBM IAM API key (alternative to HMAC) |
| `S3_BUCKETS_DIR` | | Local cache directory (default `/tmp/s3-querier`) |

\* Either HMAC pair **or** `S3_API_KEY` is required.

### Basic server

The built-in server entry point requires no configuration beyond environment variables.

**Claude Code / Claude Desktop**

```bash
claude mcp add s3-querier \
  -e S3_ENDPOINT=https://s3.amazonaws.com \
  -e S3_BUCKET=my-bucket \
  -e S3_ACCESS_KEY_ID=key \
  -e S3_SECRET_ACCESS_KEY=secret \
  -- node node_modules/s3-querier/src/mcp/server.js
```

**IBM Bob**

Add to `mcp_settings.json` (global, applies across all workspaces) or `.Bob/mcp.json` (project-level, committed with your repo):

```json
{
  "mcpServers": {
    "s3-querier": {
      "command": "node",
      "args": ["/absolute/path/to/node_modules/s3-querier/src/mcp/server.js"],
      "env": {
        "S3_ENDPOINT": "https://s3.amazonaws.com",
        "S3_BUCKET": "my-bucket",
        "S3_ACCESS_KEY_ID": "key",
        "S3_SECRET_ACCESS_KEY": "secret"
      },
      "disabled": false,
      "alwaysAllow": [],
      "disabledTools": []
    }
  }
}
```

### Extending with `S3QuerierMCP`

For richer LLM context, create a custom server using `S3QuerierMCP` and pass a `datasets` array. Each entry describes a dataset so the model knows what data is available and how it's structured — without having to explore the bucket first.

```js
// my-server.js
import { S3QuerierMCP } from 's3-querier/src/mcp/s3querier-mcp.js';

new S3QuerierMCP({
  datasets: [
    {
      name: 'sales',
      description: 'Monthly sales transactions partitioned by year and month.',
      prefix: 'sales/',
      partitioning: 'year/month',
      files: {
        data: {
          description: 'Sales records — id (int), date, product, amount (float), region',
        },
      },
    },
    {
      name: 'products',
      description: 'Product catalog — static reference data, no partitioning.',
      prefix: 'products/',
      files: {
        catalog: {
          description: 'Products — name, category, price (float)',
        },
      },
    },
  ],
}).start();
```

**Claude Code / Claude Desktop**

```bash
claude mcp add my-datalake \
  -e S3_ENDPOINT=https://s3.amazonaws.com \
  -e S3_BUCKET=my-bucket \
  -e S3_ACCESS_KEY_ID=key \
  -e S3_SECRET_ACCESS_KEY=secret \
  -- node my-server.js
```

**IBM Bob**

```json
{
  "mcpServers": {
    "my-datalake": {
      "command": "node",
      "args": ["/absolute/path/to/my-server.js"],
      "env": {
        "S3_ENDPOINT": "https://s3.amazonaws.com",
        "S3_BUCKET": "my-bucket",
        "S3_ACCESS_KEY_ID": "key",
        "S3_SECRET_ACCESS_KEY": "secret"
      },
      "disabled": false,
      "alwaysAllow": [],
      "disabledTools": []
    }
  }
}
```

#### Dataset options

| Field | Description |
| --- | --- |
| `name` | Dataset identifier |
| `description` | Narrative description injected into the tool prompt |
| `prefix` | S3 path prefix (e.g. `"sales/"`) |
| `partitioning` | Partitioning scheme hint (e.g. `"year/month"`) |
| `bucket` | Overrides `S3_BUCKET` for this dataset |
| `endpoint` | Overrides `S3_ENDPOINT` for this dataset |
| `files` | Map of logical file names to `{ description }` |

### Adding custom tools

Pass a `tools` array to register additional MCP tools alongside the built-in ones:

```js
import { z } from 'zod';
import { S3QuerierMCP } from 's3-querier/src/mcp/s3querier-mcp.js';

new S3QuerierMCP({
  datasets: [ /* ... */ ],
  tools: [
    {
      name: 'get_report',
      description: 'Returns the latest weekly summary report.',
      inputSchema: {
        week: z.string().describe('ISO week string, e.g. "2025-W03"'),
      },
      handler: async ({ week }) => {
        // your logic here
        return { content: [{ type: 'text', text: `Report for ${week}` }] };
      },
    },
  ],
}).start();
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
