/**
 * Plugin that fills in a missing `bucket` (and `endpoint`) on each file setting
 * by matching the file path against the configured datasets' prefixes.
 *
 * Runs after QueryParserPlugin has already parsed the SQL and produced per-file
 * settings. For any setting that has no bucket yet, the dataset whose prefix is
 * the longest prefix-match of the file path wins.
 *
 * If no dataset prefix matches, falls back to the first dataset that has a bucket
 * — same behaviour as the previous default-bucket resolution.
 */
export default class DatasetBucketPlugin {
  constructor(datasets = []) {
    this.datasets = datasets;
  }

  processQuery(context) {
    if (!this.datasets.length) return context;
    const settings = context.settings.map((setting) => {
      if (setting.bucket) return setting;
      const resolved = this.resolveFromDatasets(setting.file);
      return resolved ? { ...setting, ...resolved } : setting;
    });
    return { ...context, settings };
  }

  resolveFromDatasets(filePath) {
    const candidates = this.datasets.filter(({ prefix }) => prefix && filePath.startsWith(prefix));
    const match = candidates.length
      ? candidates.reduce((best, ds) => (ds.prefix.length > best.prefix.length ? ds : best))
      : (this.datasets.find((ds) => ds.bucket) ?? null);
    if (!match) return null;
    const resolved = {};
    if (match.bucket) resolved.bucket = match.bucket;
    if (match.endpoint) resolved.endpoint = match.endpoint;
    return Object.keys(resolved).length ? resolved : null;
  }
}
