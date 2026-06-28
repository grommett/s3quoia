Download files from S3-compatible storage and execute a DuckDB SQL query against them.

Queries must use DuckDB table functions such as read_parquet() or read_csv() with file paths
that reference objects in S3. S3 Querier resolves those paths, downloads the matching files,
and runs the query locally with DuckDB.

TIME-PARTITIONED DATA: use date tokens ({yyyy}, {MM}, {dd}, {hh}, {mm}) in file paths
together with the `from` and `to` parameters to query a time range. ONE query with tokens
fetches all matching files across the range — never make multiple calls with hardcoded dates.

  sql:  SELECT * FROM read_parquet('data/year={yyyy}/month={MM}/day={dd}/hour={hh}/file.parquet', union_by_name=1)
  from: 2026-06-15T12:00:00Z
  to:   2026-06-15T19:59:59Z

CURRENT TIME: If the query involves "now", "recent", "latest", or a relative time range,
call `get_current_time` first to get the accurate current UTC time. Do not rely on training
knowledge to guess the current date or time. This does not apply to static file queries or
queries for a specific known date range.

Read the `s3quoia://docs` resource or the `sql` parameter description for full token
syntax, examples, and query planning tips before writing your first query.
