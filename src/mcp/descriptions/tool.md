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

Read the `s3-querier://docs` resource or the `sql` parameter description for full token
syntax, examples, and query planning tips before writing your first query.
