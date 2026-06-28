import { readFileSync } from 'node:fs';

import BaseResource from '../base-resource.js';

const docsContent = readFileSync(new URL('../../../../docs/s3quoia.md', import.meta.url), 'utf8');

export default class S3QuoiaDocsResource extends BaseResource {
  name = 's3quoia-docs';
  uri = 's3quoia://docs';

  getMeta() {
    return {
      title: 'S3quoia Documentation',
      description: 'Full documentation: query planning, file tokens, location tokens, and examples.',
      mimeType: 'text/markdown',
    };
  }

  handler(uri) {
    return { contents: [{ uri: uri.href, text: docsContent, mimeType: 'text/markdown' }] };
  }
}
