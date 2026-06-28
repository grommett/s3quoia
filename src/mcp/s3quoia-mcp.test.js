import { describe, it } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('S3QuoiaMCP', () => {
  it('registers the query and list_files tools on start', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();
    const toolNames = registrations.tools.map(({ name }) => name);

    assert.ok(toolNames.includes('query'));
    assert.ok(toolNames.includes('list_files'));
    assert.ok(toolNames.includes('get_current_time'));
  });

  it('get_current_time returns a valid ISO 8601 UTC timestamp', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    const tool = registrations.tools.find(({ name }) => name === 'get_current_time');
    const before = Date.now();
    const result = tool.handler();
    const after = Date.now();

    const timestamp = result.content[0].text;
    const parsed = new Date(timestamp).getTime();
    assert.ok(parsed >= before && parsed <= after, 'timestamp should be current');
    assert.ok(timestamp.endsWith('Z'), 'timestamp should be UTC');
  });

  it('registers the s3quoia-docs resource on start', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    assert.strictEqual(registrations.resources[0].name, 's3quoia-docs');
  });

  it('includes dataset pointer in tool description and registers datasets resource when datasets are configured', async () => {
    const config = {
      datasets: [{ name: 'Sales', description: 'Sales data', bucket: 'sales-bucket', endpoint: 'http://s3.io' }],
    };
    const { mcp, registrations } = await buildMcp(config);
    await mcp.start();

    const queryTool = registrations.tools.find(({ name }) => name === 'query');
    const listFilesTool = registrations.tools.find(({ name }) => name === 'list_files');
    const datasetsResource = registrations.resources.find(({ name }) => name === 's3quoia-datasets');

    assert.ok(queryTool.config.description.includes('s3quoia://datasets'));
    assert.ok(listFilesTool.config.description.includes('CONFIGURED DATASETS'));
    assert.ok(datasetsResource, 's3quoia-datasets resource should be registered');

    const result = datasetsResource.handler({ href: 's3quoia://datasets' });
    assert.ok(result.contents[0].text.includes('Sales'));
    assert.ok(result.contents[0].text.includes('sales-bucket'));
  });

  it('renders filePathTemplate in datasets resource when provided', async () => {
    const config = {
      datasets: [
        {
          name: 'cloud-resources',
          prefix: 'vpc_objects/version=v1/env=production/',
          filePathTemplate: 'year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/{file}_*.parquet',
          files: { loadBalancers: { description: 'Load balancer configurations' } },
        },
      ],
    };
    const { mcp, registrations } = await buildMcp(config);
    await mcp.start();

    const datasetsResource = registrations.resources.find(({ name }) => name === 's3quoia-datasets');
    const result = datasetsResource.handler({ href: 's3quoia://datasets' });
    assert.ok(
      result.contents[0].text.includes('year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/{file}_*.parquet'),
    );
    assert.ok(result.contents[0].text.includes('{file} = resource name from Files list'));
  });

  it('omits dataset context from tool descriptions when no datasets are configured', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    const queryTool = registrations.tools.find(({ name }) => name === 'query');
    assert.ok(!queryTool.config.description.includes('CONFIGURED DATASETS'));
  });

  it('uses default (no-datasets) instructions when no datasets are configured', async () => {
    const { mcp, state } = await buildMcp();
    await mcp.start();

    assert.ok(state.serverOptions.instructions.includes('list_files'));
    assert.ok(!state.serverOptions.instructions.includes('s3quoia://datasets'));
  });

  it('uses datasets instructions when datasets are configured', async () => {
    const config = {
      datasets: [{ name: 'Sales', description: 'Sales data', bucket: 'sales-bucket', endpoint: 'http://s3.io' }],
    };
    const { mcp, state } = await buildMcp(config);
    await mcp.start();

    assert.ok(state.serverOptions.instructions.includes('s3quoia://datasets'));
    assert.ok(state.serverOptions.instructions.includes('LIMIT 1'));
    assert.ok(state.serverOptions.instructions.includes('Never guess column names'));
    assert.ok(!state.serverOptions.instructions.startsWith('Step 1: Use list_files'));
  });

  it('overrides instructions entirely when config.instructions is provided', async () => {
    const config = { instructions: 'Custom instructions only' };
    const { mcp, state } = await buildMcp(config);
    await mcp.start();

    assert.strictEqual(state.serverOptions.instructions, 'Custom instructions only');
  });

  it('appends additionalInstructions to the computed default when no datasets are configured', async () => {
    const config = { additionalInstructions: 'Project-specific guidance' };
    const { mcp, state } = await buildMcp(config);
    await mcp.start();

    assert.ok(state.serverOptions.instructions.includes('list_files'));
    assert.ok(state.serverOptions.instructions.includes('Project-specific guidance'));
  });

  it('appends additionalInstructions to the datasets default when datasets are configured', async () => {
    const config = {
      datasets: [{ name: 'Sales', description: 'Sales data', bucket: 'sales-bucket', endpoint: 'http://s3.io' }],
      additionalInstructions:
        'Data is updated hourly. For recent data, set from to 2 hours before current time and to to current time.',
    };
    const { mcp, state } = await buildMcp(config);
    await mcp.start();

    assert.ok(state.serverOptions.instructions.includes('s3quoia://datasets'));
    assert.ok(state.serverOptions.instructions.includes('Data is updated hourly'));
  });

  it('registers additional tools from config', async () => {
    const config = {
      tools: [{ name: 'custom_tool', description: 'A custom tool', inputSchema: {}, handler: () => ({}) }],
    };
    const { mcp, registrations } = await buildMcp(config);
    await mcp.start();

    const toolNames = registrations.tools.map(({ name }) => name);
    assert.ok(toolNames.includes('custom_tool'));
  });

  it('serves the docs resource as markdown with the correct URI', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    const resource = registrations.resources[0];
    const uri = new URL('s3quoia://docs');
    const result = resource.handler(uri);

    assert.strictEqual(result.contents[0].mimeType, 'text/markdown');
    assert.strictEqual(result.contents[0].uri, uri.href);
    assert.ok(result.contents[0].text.length > 0);
  });
});

async function buildMcp(config = {}) {
  const registrations = { tools: [], resources: [] };
  const state = { serverOptions: null };

  class MockMcpServer {
    constructor(serverInfo, options) {
      state.serverOptions = { ...serverInfo, ...options };
    }
    registerTool(name, toolConfig, handler) {
      registrations.tools.push({ name, config: toolConfig, handler });
    }
    registerResource(name, uri, meta, handler) {
      registrations.resources.push({ name, uri, meta, handler });
    }
    connect() {
      return Promise.resolve();
    }
  }

  const { S3QuoiaMCP } = await esmock('./s3quoia-mcp.js', {
    '@modelcontextprotocol/sdk/server/mcp.js': { McpServer: MockMcpServer },
    '@modelcontextprotocol/sdk/server/stdio.js': { StdioServerTransport: class StdioServerTransport {} },
  });

  return { mcp: new S3QuoiaMCP(config), registrations, state };
}
