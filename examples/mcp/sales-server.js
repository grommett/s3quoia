#!/usr/bin/env node

/**
 * Example: Sales MCP Server
 *
 * A S3QuoiaMCP server enriched with dataset metadata for the demo sales
 * and product catalog data. Run the demo MinIO instance first:
 *
 *   npm run demo:up
 *
 * Then register with Claude:
 *
 *   claude mcp add sales-demo \
 *     -e S3_ENDPOINT=http://localhost:9000 \
 *     -e S3_BUCKET=demo \
 *     -e S3_ACCESS_KEY_ID=minioadmin \
 *     -e S3_SECRET_ACCESS_KEY=minioadmin \
 *     -- node examples/mcp/sales-server.js
 *
 * Example questions to ask Claude:
 *   - "What were total sales by region in Q1 2024?"
 *   - "Which product had the highest revenue in 2024?"
 *   - "Compare monthly sales between Q4 2024 and Q1 2025"
 *   - "What is the average order value by product category?"
 */

import { S3QuoiaMCP } from '../../src/mcp/s3quoia-mcp.js';

new S3QuoiaMCP({
  datasets: [
    {
      name: 'sales',
      description: 'Monthly sales transactions partitioned by year and month. Use date range (from/to) to filter by period.',
      prefix: 'sales/',
      partitioning: 'year/month',
      files: {
        data: {
          description: 'Sales records — id (int), date (date), product (Widget A/B, Gadget X/Y), amount (float), region (North/South/East/West)',
        },
      },
    },
    {
      name: 'products',
      description: 'Product catalog — static reference data, no partitioning',
      prefix: 'products/',
      files: {
        catalog: {
          description: 'Products — name, category (Widgets or Gadgets), price (float)',
        },
      },
    },
  ],
}).start();
