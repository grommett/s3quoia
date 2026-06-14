import { createWriteStream } from 'node:fs';
import fsPromise from 'node:fs/promises';
import avro from 'avsc';

import QueryParserPlugin from '../query-parser/query-parser.js';

const AVRO_EXTENSION = /\.avro(\?|$)/i;

class AvroPlugin extends QueryParserPlugin {
  name = 'AvroPlugin';

  processQuery(context) {
    const { query, settings, endpoint, defaultBucket } = context;
    const avroSettings = this.getFiles({ endpoint, defaultBucket, query });
    const processedQuery = replaceAvroExtension(query);
    return { ...context, settings: [...settings, ...avroSettings], query: processedQuery };
  }

  getFiles({ endpoint, defaultBucket, query }) {
    return super.getFiles({ endpoint, defaultBucket, query })
      .filter(setting => AVRO_EXTENSION.test(setting.file))
      .map(setting => ({ ...setting, sqlFileReference: setting.file.replace(/\.avro/gi, '.json') }));
  }

  /**
   * Converts an avro file to json file
   *
   * @param {string} file
   * @returns {Promise<string>} A promise that resolves to the processed file's name
   */
  processFile(file) {
    if (!file.includes('.avro')) return Promise.resolve(file);
    const errorMsg = `Error converting avro to json for ${file}`;

    return new Promise((resolve, reject) => {
      const jsonFile = file.replace('.avro', '.json');
      fileExists(jsonFile)
        .then(exists => {
          if (exists) return resolve(jsonFile);
          const fileStream = createWriteStream(jsonFile);
          avro.createFileDecoder(file).pipe(fileStream);
          fileStream.on('close', () => resolve(jsonFile));
          fileStream.on('error', () => reject(new Error(errorMsg)));
        })
        .catch(() => reject(new Error(errorMsg)));
    });
  }
}

function replaceAvroExtension(query) {
  return query.replace(/\.avro/gi, '.json');
}

async function fileExists(file) {
  try {
    await fsPromise.stat(file);
    return true;
  } catch {
    return false;
  }
}

export default AvroPlugin;
