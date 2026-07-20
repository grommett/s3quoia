export function buildDatasetContext(datasets) {
  if (!datasets?.length) return '';
  const datasetLines = datasets.flatMap(formatDataset);
  return ['CONFIGURED DATASETS', '', ...datasetLines].join('\n');
}

/**
 * Resolves bucket and endpoint for list_files by matching the prefix argument
 * against configured dataset prefixes (startsWith, longest match wins).
 * Falls back to the first dataset that has a bucket when nothing matches.
 *
 * @param {object[]|undefined} datasets
 * @param {string} [prefix='']
 * @returns {{ bucket?: string, endpoint?: string }}
 */
export function resolveListFilesBucket(datasets, prefix = '') {
  if (!datasets?.length) return {};
  const candidates = datasets.filter(({ prefix: dp }) => dp && prefix.startsWith(dp));
  const match = candidates.length
    ? candidates.reduce((best, ds) => (ds.prefix.length > best.prefix.length ? ds : best))
    : (datasets.find((ds) => ds.bucket) ?? null);
  if (!match) return {};
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
