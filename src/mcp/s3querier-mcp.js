import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import QueryTool from './tools/query/query.js';
import ListFilesTool from './tools/list-files/list-files.js';
import CurentTimeTool from './tools/current-time/current-time.js';

import S3QuerierDocsResource from './resources/s3-querier-docs/s3-querier-docs.js';
import S3QuerierDatasetsResource from './resources/s3-querier-datasets/s3-querier-datasets.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const DEFAULT_INSTRUCTIONS = `
Step 1: Use list_files to discover what data is available under a prefix.
Step 2: Check the columns field in the list_files response — if present, use those column names. Otherwise run SELECT * FROM read_parquet('path') LIMIT 1 to inspect the schema.
Step 3: For time-partitioned data, call get_current_time to get the current UTC time, then query with the appropriate from/to range.
Step 4: Query using the correct file paths discovered in Step 1.
`.trim();

const DATASETS_INSTRUCTIONS = `
Step 1: Read the s3-querier://datasets resource to see available datasets and their S3 paths.
Step 2: Review the datasets to identify which are relevant to the request.
Step 3: For time-partitioned data, call get_current_time to get the current UTC time.
Step 4: Run SELECT * FROM read_parquet('full_path') LIMIT 1 on each relevant file to inspect column names before writing your query.
Step 5: Query the relevant datasets directly — do not use list_files to explore the bucket.
`.trim();

export class S3QuerierMCP {
  constructor(config = {}) {
    this.config = config;
    this.toolClasses = [QueryTool, ListFilesTool, CurentTimeTool];
    this.resourceClasses = [S3QuerierDocsResource, S3QuerierDatasetsResource];
  }

  async start() {
    const server = new McpServer({
      name: 's3-querier',
      version: pkg.version,
      instructions: buildInstructions(this.config),
    });
    const transport = new StdioServerTransport();

    this.resourceClasses.forEach((ResourceClass) => {
      const resource = new ResourceClass(this.config);
      if (!resource.isEnabled()) return;
      server.registerResource(resource.name, resource.uri, resource.getMeta(), resource.handler.bind(resource));
    });

    this.toolClasses.forEach((ToolClass) => {
      const tool = new ToolClass(this.config);
      server.registerTool(tool.name, tool.getConfig(), tool.handler.bind(tool));
    });

    (this.config.tools ?? []).forEach(({ name, description, inputSchema, handler }) => {
      server.registerTool(name, { description, inputSchema }, handler);
    });

    await server.connect(transport);
  }
}

function buildInstructions(config) {
  const base = config.instructions ?? (config.datasets?.length ? DATASETS_INSTRUCTIONS : DEFAULT_INSTRUCTIONS);
  if (config.additionalInstructions) return `${base}\n\n${config.additionalInstructions}`;
  return base;
}
