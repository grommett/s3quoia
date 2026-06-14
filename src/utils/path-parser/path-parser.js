import peggy from 'peggy';
import { GRAMMAR } from './path-parser-grammar.js';

const DATE_UNIT_TOKENS = {
  year: '{yyyy}',
  month: '{MM}',
  day: '{dd}',
  hour: '{hh}',
  minute: '{mm}',
  second: '{ss}',
};

const compiledParser = peggy.generate(GRAMMAR);

/**
 * Parses an S3 file path string (without surrounding SQL quotes) into its
 * constituent tokens, then extracts endpoint, bucket, file path, and cache setting.
 *
 * @param {string} raw File path string as it appears inside the SQL quotes
 * @returns {{ endpoint: string|null, bucket: string|null, file: string, cache: boolean }}
 */
export function parseFilePath(raw) {
  const tokens = compiledParser.parse(raw);
  return {
    endpoint: extractEndpoint(tokens),
    bucket: extractBucket(tokens),
    file: buildFilePath(tokens),
    cache: extractCache(tokens),
  };
}

/** Reconstructs the file path from tokens, dropping endpoint/bucket/cache */
function buildFilePath(tokens) {
  return tokens
    .filter((token) => token.type !== 'endpoint' && token.type !== 'bucket' && token.type !== 'cache')
    .map(tokenToString)
    .join('');
}

function tokenToString(token) {
  if (token.type === 'literal') return token.value;
  if (token.type === 'date') return DATE_UNIT_TOKENS[token.unit];
  if (token.type === 'glob') return '*';
  return '';
}

function extractEndpoint(tokens) {
  return tokens.find((token) => token.type === 'endpoint')?.value ?? null;
}

function extractBucket(tokens) {
  return tokens.find((token) => token.type === 'bucket')?.value ?? null;
}

function extractCache(tokens) {
  const cacheToken = tokens.find((token) => token.type === 'cache');
  return cacheToken ? cacheToken.value : true;
}
