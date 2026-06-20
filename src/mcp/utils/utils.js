export function buildDatasetContext(datasets) {
  if (!datasets?.length) return '';
  const datasetLines = datasets.flatMap(formatDataset);
  return ['CONFIGURED DATASETS', '', ...datasetLines].join('\n');
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
