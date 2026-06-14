import { describe, it } from 'node:test';
import assert from 'node:assert';
import QueryParserPlugin from './query-parser.js';

describe('QueryParserPlugin', () => {
  it('returns download settings for parquet, csv, csv.gz & json files ', () => {
    const plugin = new QueryParserPlugin();
    const expected = [
      {
        endpoint: 'http://test.com',
        bucket: 'us-east',
        file: 'my-file.csv',
        cache: true,
        sqlFileReference: '{bucket:us-east}/my-file.csv',
      },
      {
        endpoint: 'http://test.com',
        bucket: 'gzipped-files',
        file: 'year={yyyy}/my-file.csv.gz',
        cache: true,
        sqlFileReference: '{bucket:gzipped-files}/year={yyyy}/my-file.csv.gz',
      },
      {
        endpoint: 'https://amazon.s3.com',
        bucket: 'json-files',
        file: 'year={yyyy}/my-json-file.json',
        cache: true,
        sqlFileReference: '{endpoint:https://amazon.s3.com}/{bucket:json-files}/year={yyyy}/my-json-file.json',
      },
      {
        endpoint: 'http://test.com',
        bucket: 'us-east',
        file: 'my-file.parquet',
        cache: true,
        sqlFileReference: 'my-file.parquet',
      },
    ]
    const endpoint = 'http://test.com';
    const defaultBucket = 'us-east';
    const query = `with csvQuery as(select * from read_csv('{bucket:us-east}/my-file.csv')), gzipCSV as(select * from read_csv('{bucket:gzipped-files}/year={yyyy}/my-file.csv.gz')), jsonFile as(select * from read_json('{endpoint:https://amazon.s3.com}/{bucket:json-files}/year={yyyy}/my-json-file.json')) select * from read_parquet('my-file.parquet');`;
    const actual = plugin.processQuery({ settings: [], endpoint, defaultBucket, query });
    assert.deepStrictEqual(actual.settings, expected);
  });

  it('returns cache download settings for parquet, csv, csv.gz & json files ', () => {
    const plugin = new QueryParserPlugin();
    const expected = [
      {
        endpoint: 'http://test.com',
        bucket: 'us-east',
        file: 'my-file.csv',
        cache: false,
        sqlFileReference: '{bucket:us-east}/my-file.csv?cache=false',
      },
      {
        endpoint: 'http://test.com',
        bucket: 'gzipped-files',
        file: 'year={yyyy}/my-file.csv.gz',
        cache: true,
        sqlFileReference: '{bucket:gzipped-files}/year={yyyy}/my-file.csv.gz?cache=true',
      },
      {
        endpoint: 'https://amazon.s3.com',
        bucket: 'json-files',
        file: 'year={yyyy}/my-json-file.json',
        cache: false,
        sqlFileReference: '{endpoint:https://amazon.s3.com}/{bucket:json-files}/year={yyyy}/my-json-file.json?cache=false',
      },
      {
        endpoint: 'http://test.com',
        bucket: 'us-east',
        file: 'my-file.parquet',
        cache: true,
        sqlFileReference: 'my-file.parquet',
      },
    ]
    const endpoint = 'http://test.com';
    const defaultBucket = 'us-east';
    const query = `with csvQuery as(select * from read_csv('{bucket:us-east}/my-file.csv?cache=false')), gzipCSV as(select * from read_csv('{bucket:gzipped-files}/year={yyyy}/my-file.csv.gz?cache=true')), jsonFile as(select * from read_json('{endpoint:https://amazon.s3.com}/{bucket:json-files}/year={yyyy}/my-json-file.json?cache=false')) select * from read_parquet('my-file.parquet');`;
    const actual = plugin.processQuery({ settings: [], endpoint, defaultBucket, query });
    
    assert.deepStrictEqual(actual.settings, expected);
  });
});
