import { readFileSync } from 'node:fs';
import { z } from 'zod';

import BaseTool from '../base-tool.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { bigintReplacer } from '../../../utils/bigint-replacer.js';
import { buildS3Client } from '../../../s3/s3.js';
import { readParquetColumns } from '../../../utils/parquet-schema-reader.js';
import { buildDatasetContext } from '../../utils/utils.js';

const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_API_KEY, S3_ENDPOINT, S3_BUCKET } = process.env;
const listFilesTemplate = readFileSync(new URL('../../descriptions/list-files.md', import.meta.url), 'utf8');

export default class ListFilesTool extends BaseTool {
  name = 'list_files';

  getConfig() {
    const today = new Date().toISOString().slice(0, 10);
    const withDate = listFilesTemplate.replace('{{TODAY}}', today);
    const datasetContext = buildDatasetContext(this.config.datasets);
    const description = datasetContext ? `${withDate}\n${datasetContext}` : withDate;

    return {
      description,
      inputSchema: {
        prefix: z
          .string()
          .optional()
          .describe('Path prefix to list under (e.g. "sales/" or ""). Defaults to empty string to list all files.'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum number of files to return (default 100). Increase if the response is truncated.'),
        endpoint: z.string().optional().describe('S3 endpoint URL. Overrides S3_ENDPOINT for this call.'),
        bucket: z.string().optional().describe('S3 bucket name. Overrides S3_BUCKET for this call.'),
      },
    };
  }

  async handler({ prefix = '', maxResults = 100, endpoint, bucket }) {
    const resolvedEndpoint = endpoint || S3_ENDPOINT;
    const resolvedBucket = bucket || S3_BUCKET;
    const s3Client = buildS3Client({
      apiKey: S3_API_KEY,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      endpoint: resolvedEndpoint,
    });
    const response = await s3Client.send(
      new ListObjectsV2Command({ Bucket: resolvedBucket, Prefix: prefix, MaxKeys: maxResults, Delimiter: '/' }),
    );
    const directories = (response.CommonPrefixes ?? []).map(({ Prefix }) => Prefix);
    const files = (response.Contents ?? []).map(({ Key, Size }) => ({ file: Key, size: Size }));
    const truncated = response.IsTruncated ?? false;
    const representatives = getRepresentativeFiles(files);
    const filesWithSchema = await Promise.all(
      files.map((fileObj) => maybeAddSchema(s3Client, resolvedBucket, representatives, fileObj)),
    );

    return {
      content: [
        { type: 'text', text: JSON.stringify({ directories, files: filesWithSchema, truncated }, bigintReplacer) },
      ],
    };
  }
}

/** Helpers */

function getRepresentativeFiles(files) {
  const parquetFiles = files.filter(({ file }) => file.endsWith('.parquet'));
  const dirMap = parquetFiles.reduce(addFirstFilePerDir, new Map());
  return new Set(dirMap.values());
}

function addFirstFilePerDir(acc, { file }) {
  const dir = file.substring(0, file.lastIndexOf('/'));
  if (!acc.has(dir)) acc.set(dir, file);
  return acc;
}

function maybeAddSchema(s3Client, bucket, representatives, fileObj) {
  if (representatives.has(fileObj.file)) return addSchema(s3Client, bucket, fileObj);
  return Promise.resolve(fileObj);
}

async function addSchema(s3Client, bucket, { file, size }) {
  if (!file.endsWith('.parquet')) return { file, size };
  const columns = await readParquetColumns(s3Client, bucket, file).catch(() => null);
  return { file, size, columns };
}
