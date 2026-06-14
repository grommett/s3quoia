import { extractFileReferences } from '../../utils/sql-parser/sql-parser.js';
import { parseFilePath } from '../../utils/path-parser/path-parser.js';

class QueryParserPlugin {
  name = 'BasePlugin';

  processQuery(context) {
    const { settings, endpoint, defaultBucket, query } = context;
    const fileSettings = this.getFiles({ endpoint, defaultBucket, query });
    return { ...context, settings: [...settings, ...fileSettings] };
  }

  getFiles({ endpoint, defaultBucket, query }) {
    return extractFileReferences(query).map((ref) => toFileSetting(ref, endpoint, defaultBucket));
  }

  static processFile(file) {
    return Promise.resolve(file);
  }
}

function toFileSetting({ raw }, defaultEndpoint, defaultBucket) {
  const parsed = parseFilePath(raw);
  return {
    endpoint: parsed.endpoint ?? defaultEndpoint,
    bucket: parsed.bucket ?? defaultBucket,
    file: parsed.file,
    cache: parsed.cache,
    sqlFileReference: raw,
  };
}

export default QueryParserPlugin;
