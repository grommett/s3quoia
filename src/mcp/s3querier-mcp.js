import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleListFiles } from './handlers/list-files.js';
import { handleQuery } from './handlers/query.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const toolDescription = readFileSync(new URL('./descriptions/tool.md', import.meta.url), 'utf8');
const sqlDescription = readFileSync(new URL('./descriptions/sql-param.md', import.meta.url), 'utf8');
const listFilesTemplate = readFileSync(new URL('./descriptions/list-files.md', import.meta.url), 'utf8');
const docsContent = readFileSync(new URL('../../docs/s3-querier.md', import.meta.url), 'utf8');

const QUERY_TOOL_SCHEMA = {
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
};

const LIST_FILES_TOOL_SCHEMA = {
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
};

const DOCS_RESOURCE = {
  title: 'S3 Querier Documentation',
  description: 'Full documentation: query planning, file tokens, location tokens, and examples.',
  mimeType: 'text/markdown',
};

export class S3QuerierMCP {
  constructor(config = {}) {
    this.config = config;
  }

  async start() {
    const server = new McpServer({ name: 's3-querier', version: pkg.version });
    const transport = new StdioServerTransport();
    const listFilesDescription = buildListFilesDescription(this.config);
    const enrichedToolDescription = buildToolDescription(this.config);

    server.registerResource('s3-querier-docs', 's3-querier://docs', DOCS_RESOURCE, serveDocsHandler);
    server.registerTool(
      'list_files',
      { description: listFilesDescription, inputSchema: LIST_FILES_TOOL_SCHEMA },
      handleListFiles,
    );
    server.registerTool('query', { description: enrichedToolDescription, inputSchema: QUERY_TOOL_SCHEMA }, handleQuery);
    (this.config.tools ?? []).forEach(({ name, description, inputSchema, handler }) => {
      server.registerTool(name, { description, inputSchema }, handler);
    });

    await server.connect(transport);
  }
}

/** Helpers */

function serveDocsHandler(uri) {
  return { contents: [{ uri: uri.href, text: docsContent, mimeType: 'text/markdown' }] };
}

function buildListFilesDescription(config) {
  const today = new Date().toISOString().slice(0, 10);
  const withDate = listFilesTemplate.replace('{{TODAY}}', today);
  const datasetContext = buildDatasetContext(config.datasets);
  return datasetContext ? `${withDate}\n${datasetContext}` : withDate;
}

function buildToolDescription(config) {
  const datasetContext = buildDatasetContext(config.datasets);
  return datasetContext ? `${toolDescription}\n\n${datasetContext}` : toolDescription;
}

function buildDatasetContext(datasets) {
  if (!datasets?.length) return '';
  const datasetLines = datasets.flatMap(formatDataset);
  return ['CONFIGURED DATASETS', '', ...datasetLines].join('\n');
}

function formatDataset({ name, description, bucket, endpoint, prefix, partitioning, files }) {
  const header = description ? `${name} — ${description}` : name;
  const lines = [header];
  if (bucket) lines.push(`  Bucket: ${bucket}`);
  if (endpoint) lines.push(`  Endpoint: ${endpoint}`);
  if (prefix) lines.push(`  Prefix: ${prefix}`);
  if (partitioning) lines.push(`  Partitioning: ${partitioning}`);
  if (files) {
    const fileLines = Object.entries(files).flatMap(formatFileLine);
    lines.push('  Files:', ...fileLines);
  }
  lines.push('');
  return lines;
}

function formatFileLine([fileName, { description: fileDesc, schema }]) {
  const label = fileDesc ? `${fileName} — ${fileDesc}` : fileName;
  const result = [`    ${label}`];
  if (schema) result.push(`      Schema: ${schema}`);
  return result;
}
