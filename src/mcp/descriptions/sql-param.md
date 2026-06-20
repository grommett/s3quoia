A DuckDB SQL query. File paths inside read_parquet() or read_csv() are resolved against S3
and downloaded before the query runs. Paths are relative to the bucket root — do not use
s3://, s3a://, or any protocol prefix. To reference a non-default bucket, use the
{bucket:name} token instead.

REQUIRED: always call read_parquet() or read_csv() — plain table names are not supported.
Prefer union_by_name=1 when reading multiple files.

SCHEMA DISCOVERY: Never guess column names. Before writing any query that joins files or
references specific columns, run SELECT * FROM read_parquet('path') LIMIT 1 on each file
to inspect the actual schema. Only then write the real query.

FILE PATH TOKENS

Date tokens — expanded using the `from` and `to` parameters:
  {yyyy}  4-digit year      e.g. 2025
  {MM}    2-digit month     e.g. 08
  {dd}    2-digit day       e.g. 03
  {hh}    2-digit hour      e.g. 14
  {mm}    2-digit minute    e.g. 30
  {ss}    2-digit second    e.g. 00

Location tokens — override endpoint or bucket per path:
  {endpoint:https://s3.example.com}
  {bucket:my-bucket}

QUERYING TIME-PARTITIONED DATA

Always use date tokens for time-partitioned paths — even for a single snapshot. Tokens keep
the partitioning structure explicit and make the query work correctly if the time range
changes. Only hardcode a date when the file is genuinely static (not part of any
time-partition scheme).

Use date tokens in the SQL with `from`/`to` as separate parameters. ONE query with tokens
downloads all matching files across the range — do not make multiple tool calls with
hardcoded dates.

  ✗ WRONG — hardcoded date in path (even for a single hour):
      sql: SELECT * FROM read_parquet('events/year=2026/month=06/day=15/hour=14/data.parquet')

  ✗ WRONG — multiple tool calls with hardcoded hours:
      sql: SELECT * FROM read_parquet('events/year=2026/month=06/day=15/hour=12/data.parquet')
      sql: SELECT * FROM read_parquet('events/year=2026/month=06/day=15/hour=13/data.parquet')
      sql: SELECT * FROM read_parquet('events/year=2026/month=06/day=15/hour=14/data.parquet')

  ✓ CORRECT — one tool call, tokens expand across all hours in the range:
      sql:  SELECT * FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/hour={hh}/data.parquet', union_by_name=1)
      from: 2026-06-15T12:00:00Z
      to:   2026-06-15T14:59:59Z

Tokens also expand inside the filename, not just in path directory segments:
  data/year={yyyy}/month={MM}/day={dd}/hour={hh}/file_{yyyy}{MM}{dd}{hh}00.parquet
  → s3-querier downloads one file per hour in the from/to range.

HIVE-PARTITIONED DATA

For paths partitioned only by year and month (no day segment), use {yyyy} and {MM} together:
  sales/year={yyyy}/month={MM}/data.parquet

s3-querier generates one prefix per calendar month in the from/to range, so a Q1 query
(from=2024-01-01, to=2024-03-31) fetches exactly months 01, 02, 03 — not all of 2024.

Do NOT use DuckDB character-class globs like month=0[1-3] — DuckDB does not support them.
Use {yyyy}/{MM} tokens instead, which s3-querier expands correctly.

EXAMPLES

Single file:
  SELECT * FROM read_parquet('reports/summary.parquet') LIMIT 10

Hour-partitioned files — tokens in path and filename (requires from/to):
  SELECT * FROM read_parquet(
    'events/year={yyyy}/month={MM}/day={dd}/hour={hh}/file_{yyyy}{MM}{dd}{hh}00.parquet',
    union_by_name=1)

Day-partitioned files (requires from/to):
  SELECT id FROM read_parquet('events/year={yyyy}/month={MM}/day={dd}/data.parquet', union_by_name=1)

Month-partitioned files (no day segment — use {yyyy}/{MM} only):
  SELECT * FROM read_parquet('sales/year={yyyy}/month={MM}/data.parquet', union_by_name=1)

Cross-endpoint join:
  WITH east AS (SELECT id FROM read_parquet('{endpoint:https://s3.us-east.example.com}/{bucket:logs}/data/{yyyy}{MM}{dd}.parquet'))
  SELECT * FROM read_parquet('{endpoint:https://s3.eu-west.example.com}/{bucket:logs}/data/{yyyy}{MM}{dd}.parquet') AS west
  JOIN east ON west.id = east.id

GLOB SYNTAX (last resort — filename patterns only)

Globs match non-time file name segments within a known folder:
  jobs/window=202308032130/*.parquet

  Do NOT use globs on time-partitioned folder segments (year=, month=, day=, hour=, etc.).
  A folder-level glob like hour=*/ matches every hour and causes massive over-fetching.
  Use date tokens with from/to instead — they expand to exactly the hours/days needed:
    ✗  data/year=2026/month=06/day=15/hour=*/file.parquet
    ✓  data/year={yyyy}/month={MM}/day={dd}/hour={hh}/file.parquet  (with from/to)

  Tokens and globs can be combined — tokens on folder segments, glob on the filename:
    data/year={yyyy}/month={MM}/day={dd}/hour={hh}/records_*.parquet