import { describe, it } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('S3QuerierMCP', () => {
  it('registers the query and list_files tools on start', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();
    const toolNames = registrations.tools.map(({ name }) => name);

    assert.ok(toolNames.includes('query'));
    assert.ok(toolNames.includes('list_files'));
  });

  it('registers the s3-querier-docs resource on start', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    assert.strictEqual(registrations.resources[0].name, 's3-querier-docs');
  });

  it('includes dataset context in tool descriptions when datasets are configured', async () => {
    const config = {
      datasets: [{ name: 'Sales', description: 'Sales data', bucket: 'sales-bucket', endpoint: 'http://s3.io' }],
    };
    const { mcp, registrations } = await buildMcp(config);
    await mcp.start();

    const queryTool = registrations.tools.find(({ name }) => name === 'query');
    const listFilesTool = registrations.tools.find(({ name }) => name === 'list_files');

    assert.ok(queryTool.config.description.includes('CONFIGURED DATASETS'));
    assert.ok(queryTool.config.description.includes('Sales'));
    assert.ok(queryTool.config.description.includes('sales-bucket'));
    assert.ok(listFilesTool.config.description.includes('CONFIGURED DATASETS'));
  });

  it('renders file schema in dataset context when schema is provided', async () => {
    const config = {
      datasets: [
        {
          name: 'Sales',
          files: {
            orders: { description: 'Order records', schema: 'id (varchar), amount (float)' },
            products: { description: 'Product catalog' },
          },
        },
      ],
    };
    const { mcp, registrations } = await buildMcp(config);
    await mcp.start();

    const queryTool = registrations.tools.find(({ name }) => name === 'query');
    assert.ok(queryTool.config.description.includes('Schema: id (varchar), amount (float)'));
    assert.ok(!queryTool.config.description.includes('Schema: undefined'));
  });

  it('omits dataset context from tool descriptions when no datasets are configured', async () => {
    const { mcp, registrations } = await buildMcp();
    await mcp.start();

    const queryTool = registrations.tools.find(({ name }) => name === 'query');
    assert.ok(!queryTool.config.description.includes('CONFIGURED DATASETS'));
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
    const uri = new URL('s3-querier://docs');
    const result = resource.handler(uri);

    assert.strictEqual(result.contents[0].mimeType, 'text/markdown');
    assert.strictEqual(result.contents[0].uri, uri.href);
    assert.ok(result.contents[0].text.length > 0);
  });
});

async function buildMcp(config = {}) {
  const registrations = { tools: [], resources: [] };

  class MockMcpServer {
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

  const { S3QuerierMCP } = await esmock('./s3querier-mcp.js', {
    '@modelcontextprotocol/sdk/server/mcp.js': { McpServer: MockMcpServer },
    '@modelcontextprotocol/sdk/server/stdio.js': { StdioServerTransport: class StdioServerTransport {} },
  });

  return { mcp: new S3QuerierMCP(config), registrations };
}
