/**
 * Fills in a missing `bucket`/`endpoint` on each per-file download setting by
 * matching `setting.file` against configured dataset prefixes.
 *
 * Runs after `QueryParserPlugin`, so `context.settings` already holds one
 * parsed entry per file reference (e.g. `sales/year={yyyy}/data.parquet`).
 * Matching is done per file rather than once for the whole query, so a join
 * across two datasets resolves each file to its own bucket independently.
 *
 * A file with no matching dataset prefix is left unchanged — no fallback to
 * the first configured dataset — so the existing "no bucket" error surfaces
 * normally instead of silently querying the wrong bucket.
 */
export default class BucketResolverPlugin {
  name = 'BucketResolverPlugin';

  constructor(datasets = []) {
    this.datasets = datasets;
  }

  processQuery(context) {
    const settings = context.settings.map((setting) => this.resolveSetting(setting));
    return { ...context, settings };
  }

  resolveSetting(setting) {
    if (setting.bucket) return setting;
    const dataset = this.findDataset(setting.file);
    if (!dataset) return setting;
    return { ...setting, bucket: dataset.bucket, endpoint: setting.endpoint ?? dataset.endpoint };
  }

  findDataset(file) {
    const candidates = this.datasets.filter(({ prefix }) => prefix && file?.startsWith(prefix));
    if (!candidates.length) return undefined;
    return candidates.reduce((best, dataset) => (dataset.prefix.length > best.prefix.length ? dataset : best));
  }
}
