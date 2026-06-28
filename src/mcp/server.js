#!/usr/bin/env node
import { S3QuoiaMCP } from './s3quoia-mcp.js';
import { FSPurgePlugin, StatsPlugin } from '../../s3quoia.js';
import { logger } from '../utils/logger.js';

const { S3_BUCKETS_DIR = '/tmp/s3quoia', S3_PURGE_CACHE = 'true', S3_PURGE_TTL_MINUTES = '60' } = process.env;

await new S3QuoiaMCP({ plugins: buildDefaultPlugins() }).start();

function buildDefaultPlugins() {
  const plugins = [];
  if (S3_PURGE_CACHE !== 'false') {
    plugins.push(new FSPurgePlugin({ bucketsDir: S3_BUCKETS_DIR, lastAccessTTLMinutes: Number(S3_PURGE_TTL_MINUTES) }));
  }
  plugins.push(new StatsPlugin((event) => logger.info(event)));
  return plugins;
}
