export function buildDatasetContext(datasets) {
  if (!datasets?.length) return '';
  const datasetLines = datasets.flatMap(formatDataset);
  return ['CONFIGURED DATASETS', '', ...datasetLines].join('\n');
}

/**
 * Given a hint string (a file path prefix or SQL query text) and the configured
 * datasets, returns the `{ bucket, endpoint }` of the best-matching dataset, or
 * `{}` when no dataset matches or no datasets are configured.
 *
 * Matching strategy: find the dataset whose `prefix` appears as a substring of
 * the hint. When multiple datasets match, prefer the one with the longest prefix
 * (most specific). Falls back to the first dataset when the hint is empty.
 *
 * @param {object[]|undefined} datasets - Array of dataset config objects.
 * @param {string} [hint=''] - A file path prefix or SQL query string to match against.
 * @returns {{ bucket?: string, endpoint?: string }}
 */
export function resolveDatasetBucket(datasets, hint = '') {
  if (!datasets?.length) return {};
  const candidates = datasets.filter(({ prefix }) => prefix && hint.includes(prefix));
  const match = candidates.length
    ? candidates.reduce((best, d) => (d.prefix.length > best.prefix.length ? d : best))
    : datasets[0];
  const result = {};
  if (match.bucket) result.bucket = match.bucket;
  if (match.endpoint) result.endpoint = match.endpoint;
  return result;
}

function formatDataset({ name, description, bucket, endpoint, prefix, filePathTemplate, partitioning, files }) {
  const header = description ? `${name} — ${description}` : name;
  const lines = [header];
  if (bucket) lines.push(`  Bucket: ${bucket}`);
  if (endpoint) lines.push(`  Endpoint: ${endpoint}`);
  if (prefix && !filePathTemplate) lines.push(`  Prefix: ${prefix}`);
  if (prefix && filePathTemplate)
    lines.push(`  Full path: ${prefix}${filePathTemplate}  ({file} = resource name from Files list)`);
  if (partitioning) lines.push(`  Partitioning: ${partitioning}`);
  if (files) {
    const fileLines = Object.entries(files).flatMap(formatFileLine);
    lines.push('  Files:', ...fileLines);
  }
  lines.push('');
  return lines;
}

function formatFileLine([fileName, { description: fileDesc }]) {
  return [`    ${fileDesc ? `${fileName} — ${fileDesc}` : fileName}`];
}
