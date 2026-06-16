# S3 Querier

S3 Querier allows you to query data lake content directly using [DuckDB](https://duckdb.org/) queries. By parsing these queries, determining the necessary files, and dynamically downloading and processing them, S3 Querier transforms what is otherwise an opaque storage system into a user-friendly, queryable resource.

## Planning Your Queries

When querying data from a data lake, be mindful of how your queries are constructed. S3 Querier downloads files from S3-compatible storage before they can be queried using DuckDB, so query speed is directly influenced by the size and number of files involved.

### Key Considerations

1. **File Size And Query Efficiency**
   Large files increase query time because they take longer to download. To optimize performance:

   - Query only the columns you need. Avoid `SELECT *` without a `LIMIT`.
   - Avoid overly broad queries that download unnecessary files, such as `read_parquet('my-bucket/*.parquet')`.

2. **1GB File Size Limit**
   This service enforces a 1GB limit per query. Queries that access files accumulating beyond this limit will fail.

3. **Partitioning And Filtering**
   Partition your data in the lake where possible. This lets you filter queries to target only relevant partitions, reducing unnecessary downloads.

### Tips For Better Query Planning

- **Test Locally First**
  [Install the DuckDB CLI](https://duckdb.org/docs/installation/?version=stable&environment=cli&platform=macos&download_method=direct) and experiment with your queries on local parquet files before running them against S3. This gives a fast feedback loop for understanding data structure and refining queries.

- **Be Mindful Of Time Ranges In Date Tokens**
  Long time ranges require fetching more files and slow execution. Use narrow time ranges whenever possible. If a query fails due to the 1GB limit, narrow the `from`/`to` range and run multiple queries — for example, query 4–6 hours at a time instead of a full day.

- **Create Secondary Representations Of Your Data**
  For larger datasets, break files into smaller chunks to avoid hitting the file size limit.

- **Monitor Query Times**
  If a query is slow, revisit the query logic and the files it accesses.

## Example Queries

Below are some examples of common use cases.

**Key Concepts:**

- Static files versus dynamic files. A static file is a file for which you know the exact location in S3. A dynamic file uses one or more file tokens to match a range of files. [See the file tokens section](#file-tokens-overview) for details.
- In most cases you'll want to use `union_by_name=1` when using `read_parquet` or `read_csv`. Read more about [why this is important](https://duckdb.org/2025/01/10/union-by-name.html).

### Querying A Single, Static File

```sql
SELECT * FROM
  read_parquet('file1.parquet', union_by_name=1)
LIMIT 10;
```

### Getting Multiple, Static Files

When querying multiple files they should share the same or a similar schema. Use `union_by_name=1` to handle minor schema differences.

```sql
SELECT * FROM
  read_parquet(['file1.parquet', 'file2.parquet'], union_by_name=1)
LIMIT 10;
```

### Querying Time-Related Files

Use date tokens to query files spanning a specific date range. When S3 Querier receives a `from` and `to` parameter, it automatically expands the file list to match the date tokens in your query.

#### Example

Given `from=2025-08-03` and `to=2025-08-06`, the following query:

```sql
SELECT id
FROM read_parquet('jobs_failed/year={yyyy}/month={MM}/day={dd}/servers.parquet', union_by_name=1);
```

Will resolve and download:

```
jobs_failed/year=2025/month=08/day=03/servers.parquet
jobs_failed/year=2025/month=08/day=04/servers.parquet
jobs_failed/year=2025/month=08/day=05/servers.parquet
jobs_failed/year=2025/month=08/day=06/servers.parquet
```

For more details, see [tips about date ranges](#tips-for-better-query-planning).

### Querying Files From Multiple Locations

Use location tokens to query files across different endpoints or buckets in a single query.

```sql
WITH us_south_data AS (
  SELECT id, timestamp
  FROM read_parquet('{endpoint:https://s3.us-south.example.com}/{bucket:my-bucket}/my_time_series/{yyyy}{MM}{dd}{hh}{mm}{ss}.parquet')
)
SELECT id, timestamp
FROM read_parquet('{endpoint:https://s3.us-east.example.com}/{bucket:my-bucket}/my_time_series_2/{yyyy}{MM}{dd}{hh}{mm}{ss}.parquet') AS us_east_data
JOIN us_south_data ON us_east_data.id = us_south_data.id;
```

### Tips And Utilities

See the DuckDB docs for [`read_parquet` parameters](https://duckdb.org/docs/stable/data/parquet/overview.html#parameters) and [`read_csv` parameters](https://duckdb.org/docs/stable/data/csv/overview#parameters).

#### Getting The File Name Of The File(s) Being Queried

Pass `filename=1` to `read_parquet` or `read_csv` to include the source file path as a column in results.

```sql
SELECT id, filename
FROM read_parquet('year={yyyy}/month={MM}/my-file.parquet', filename=1);
```

| id  | filename                            |
| --- | ----------------------------------- |
| 1   | year=2025/month=01/my-file.parquet  |

#### Extracting Partition Values From Hive-Style Paths

If your data uses Hive-style partitioning (e.g., `year=2025/month=04/day=20`), use `hive_partitioning=1` to extract partition keys as columns.

```sql
SELECT year, month, day, id
FROM read_parquet('jobs_failed/year=2025/month=01/day=19/my-file.parquet', hive_partitioning=1);
```

| id | year | month | day |
| -- | ---- | ----- | --- |
| 1  | 2025 | 01    | 19  |

---

## File Tokens Overview

File tokens allow you to create dynamic queries with patterns that vary based on time, non-time components, or storage location. There are three types: **Glob Syntax**, **Time Formatting Tokens**, and **Location Tokens**.

### Glob Syntax

Glob syntax handles file name segments that vary but are not time-related.

```
jobs_failed/window=202308032130/0.parquet
jobs_failed/window=202308032230/3.parquet
jobs_failed/window=202308032330/6.parquet
```

```sql
SELECT id
FROM read_parquet('jobs_failed/window=202308032130/*.parquet', union_by_name=1);
```

> [!WARNING]
> **Never use globs on time-partitioned folder segments** (e.g. `year=*/`, `month=*/`, `hour=*/`). A folder-level glob matches every partition and will over-fetch, hitting the 1GB query limit.
>
> Use [time formatting tokens](#time-formatting-tokens) with `from`/`to` instead — they expand to exactly the partitions needed:
>
> ```sql
> -- ❌ WRONG — hour=*/ fetches every hour
> SELECT * FROM read_parquet('data/year=2026/month=06/day=15/hour=*/file.parquet');
>
> -- ✅ CORRECT — {hh} with from/to fetches only the requested hours
> SELECT * FROM read_parquet('data/year={yyyy}/month={MM}/day={dd}/hour={hh}/file.parquet', union_by_name=1);
> ```
>
> Globs are appropriate only for **file name patterns within a known folder**, or for non-time path segments. They can be combined with time tokens — tokens on the folder segments, glob on the filename:
> ```sql
> SELECT * FROM read_parquet('data/year={yyyy}/month={MM}/day={dd}/hour={hh}/records_*.parquet', union_by_name=1);
> ```

---

### Time Formatting Tokens

Time tokens dynamically match files based on time-related patterns in their names, based on [Unicode Technical Standard #35](https://unicode.org/reports/tr35/).

| **Token**         | **Usage**      | **Example Output** |
| ----------------- | -------------- | ------------------ |
| **Year** `{yyyy}` | 4-digit year   | 1970, ..., 2030    |
| **Month** `{MM}`  | 2-digit month  | 01...12            |
| **Day** `{dd}`    | 2-digit day    | 01...31            |
| **Hour** `{hh}`   | 2-digit hour   | 00...23            |
| **Minute** `{mm}` | 2-digit minute | 00...59            |
| **Second** `{ss}` | 2-digit second | 00...59            |

```sql
SELECT id
FROM read_parquet('jobs_failed/window={yyyy}{MM}{dd}{hh}{mm}/*.parquet', union_by_name=1);
```

---

### Location Tokens

Location tokens let you vary the storage endpoint and bucket within a query.

| **Token**                  | **Usage**                        | **Example**                                                  |
| -------------------------- | -------------------------------- | ------------------------------------------------------------ |
| **Endpoint** `{endpoint:}` | Specifies a storage endpoint URL | `{endpoint:http://s3.example.com}/my-bucket/file.parquet`    |
| **Bucket** `{bucket:}`     | Specifies a storage bucket       | `{bucket:my-bucket}/file.parquet`                            |

```sql
SELECT id
FROM read_parquet('{endpoint:http://s3.example.com}/{bucket:my-bucket}/jobs_failed/window={yyyy}{MM}{dd}{hh}{mm}/*.parquet');
```

**Benefits:**

1. **Cross-Endpoint Queries** — Query data stored on different S3-compatible endpoints in a single query.
2. **Cross-Bucket Queries** — Access data from multiple buckets without separate queries.
3. **Dynamic Query Construction** — Combine location tokens with glob syntax and time tokens for fully dynamic, cross-location queries.
