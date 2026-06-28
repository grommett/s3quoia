import { describe, it } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('handleQuery', () => {
  it('returns query results as JSON in MCP text content format', async () => {
    const { default: QueryTool } = await esmock('./query.js', {
      '../../../s3quoia.js': {
        default: () => Promise.resolve([{ name: 'Alice', count: 5 }]),
        bigintReplacer: passThrough,
      },
    });

    const tool = new QueryTool({});
    const result = await tool.handler({ sql: 'SELECT name, count FROM data' });

    assert.deepStrictEqual(result, {
      content: [{ type: 'text', text: '[{"name":"Alice","count":5}]' }],
    });
  });

  it('converts ISO date strings to millisecond timestamps', async () => {
    let capturedFrom;
    let capturedTo;
    const { default: QueryTool } = await esmock('./query.js', {
      '../../../s3quoia.js': {
        default: ({ from, to }) => {
          capturedFrom = from;
          capturedTo = to;
          return Promise.resolve([]);
        },
        bigintReplacer: passThrough,
      },
    });

    const tool = new QueryTool({});
    await tool.handler({ sql: 'SELECT 1', from: '2025-01-01', to: '2025-01-31' });

    assert.strictEqual(capturedFrom, new Date('2025-01-01').getTime());
    assert.strictEqual(capturedTo, new Date('2025-01-31').getTime());
  });

  it('passes plugins from config to s3quoia', async () => {
    let capturedPlugins;
    const { default: QueryTool } = await esmock('./query.js', {
      '../../../s3quoia.js': {
        default: ({ plugins }) => {
          capturedPlugins = plugins;
          return Promise.resolve([]);
        },
        bigintReplacer: passThrough,
      },
    });

    const fakePlugin = { processQuery: (ctx) => ctx };
    const tool = new QueryTool({ plugins: [fakePlugin] });
    await tool.handler({ sql: 'SELECT 1' });

    assert.deepStrictEqual(capturedPlugins, [fakePlugin]);
  });

  it('passes an empty plugins array when config has none', async () => {
    let capturedPlugins;
    const { default: QueryTool } = await esmock('./query.js', {
      '../../../s3quoia.js': {
        default: ({ plugins }) => {
          capturedPlugins = plugins;
          return Promise.resolve([]);
        },
        bigintReplacer: passThrough,
      },
    });

    const tool = new QueryTool({});
    await tool.handler({ sql: 'SELECT 1' });

    assert.deepStrictEqual(capturedPlugins, []);
  });

  it('omits from and to when not provided in the call', async () => {
    let capturedFrom;
    let capturedTo;
    const { default: QueryTool } = await esmock('./query.js', {
      '../../../s3quoia.js': {
        default: ({ from, to }) => {
          capturedFrom = from;
          capturedTo = to;
          return Promise.resolve([]);
        },
        bigintReplacer: passThrough,
      },
    });

    const tool = new QueryTool({});
    await tool.handler({ sql: 'SELECT 1' });

    assert.strictEqual(capturedFrom, undefined);
    assert.strictEqual(capturedTo, undefined);
  });
});

function passThrough(_, val) {
  return val;
}
