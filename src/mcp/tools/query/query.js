import { readFileSync } from 'node:fs';
import { z } from 'zod';

import BaseTool from '../base-tool.js';
import s3quoia, { bigintReplacer } from '../../../s3quoia.js';

const {
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_API_KEY,
  S3_ENDPOINT,
  S3_BUCKET,
  S3_BUCKETS_DIR = '/tmp/s3quoia',
} = process.env;

const sqlDescription = readFileSync(new URL('../../descriptions/sql-param.md', import.meta.url), 'utf8');
const toolDescription = readFileSync(new URL('../../descriptions/tool.md', import.meta.url), 'utf8');

export default class QueryTool extends BaseTool {
  name = 'query';

  getConfig() {
    const description = this.config.datasets?.length
      ? `${toolDescription}\n\nCONFIGURED DATASETS: read the \`s3quoia://datasets\` resource for available datasets, prefixes, file path templates, and resource types.`
      : toolDescription;

    return {
      description,
      inputSchema: {
        sql: z.string().describe(sqlDescription),
        from: z
          .string()
          .optional()
          .describe('Start of date range as ISO 8601 (e.g. "2025-01-01"). Required when the query uses date tokens.'),
        to: z
          .string()
          .optional()
          .describe('End of date range as ISO 8601 (e.g. "2025-01-31"). Required when the query uses date tokens.'),
        endpoint: z.string().optional().describe('S3 endpoint URL. Overrides S3_ENDPOINT for this query.'),
        bucket: z.string().optional().describe('S3 bucket name. Overrides S3_BUCKET for this query.'),
      },
    };
  }

  async handler({ sql, from, to, endpoint, bucket }) {
    const fromMs = from ? new Date(from).getTime() : undefined;
    const toMs = to ? new Date(to).getTime() : undefined;
    const resolvedEndpoint = endpoint || S3_ENDPOINT;
    const resolvedBucket = bucket || S3_BUCKET;

    const results = await s3quoia({
      query: sql,
      from: fromMs,
      to: toMs,
      defaultEndpoint: resolvedEndpoint,
      defaultBucket: resolvedBucket,
      bucketsDir: S3_BUCKETS_DIR,
      apiKey: S3_API_KEY,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      format: 'jsonRecords',
      plugins: this.config.plugins ?? [],
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(results, bigintReplacer) }],
    };
  }
}
