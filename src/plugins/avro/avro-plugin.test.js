import { describe, it } from 'node:test';
import assert from 'node:assert';
import AvroPlugin from './avro-plugin.js';

describe('AvroPlugin', () => {
  describe('processQuery', () => {
    const query = `with avroQuery as( select * from read_json('my-file.avro') ), gzipCSV as( select * from read_json('{bucket:another-bucket}/year={yyyy}/my-file.avro') ) select * from read_parquet('my-file.csv');`;
    it('returns settings with .avro files found in the query and sqlFileReference', () => {
      const plugin = new AvroPlugin();
      const settings = [];
      const endpoint = 'http://test.com';
      const defaultBucket = 'us-east';
      const actual = plugin.processQuery({ settings, endpoint, defaultBucket, query });
      const expected = [
        {
          endpoint,
          bucket: defaultBucket,
          file: 'my-file.avro',
          sqlFileReference: 'my-file.json',
          cache: true,
        },
        {
          endpoint,
          bucket: 'another-bucket',
          file: 'year={yyyy}/my-file.avro',
          sqlFileReference: 'year={yyyy}/my-file.json',
          cache: true,
        },
      ];

      assert.deepStrictEqual(actual.settings, expected);
    });

    it('returns settings with single .avro file found in the query and sqlFileReference', () => {
      const avroFile =
        'telem_raw_event_data_us_south/rias-ng-us-south-dal13-prod_lifecycle_snapshot/year=2024/month=09/day=12/hour=23/rias-ng-us-south-dal13-prod_lifecycle_snapshot+0+0000195526.avro';
      const singleFileQuery = `select context from read_json('${avroFile}' limit 2;`;
      const plugin = new AvroPlugin();
      const settings = [];
      const endpoint = 'http://test.com';
      const defaultBucket = 'obs-vpc-eventing-prod-raw';
      const actual = plugin.processQuery({ settings, endpoint, defaultBucket, query: singleFileQuery });
      const expected = [
        {
          endpoint,
          bucket: defaultBucket,
          file: avroFile,
          sqlFileReference:
            'telem_raw_event_data_us_south/rias-ng-us-south-dal13-prod_lifecycle_snapshot/year=2024/month=09/day=12/hour=23/rias-ng-us-south-dal13-prod_lifecycle_snapshot+0+0000195526.json',
          cache: true,
        },
      ];

      assert.deepStrictEqual(actual.settings, expected);
    });

    it('returns cache settings with single .avro file found in the query and sqlFileReference', () => {
      const avroFile = 'rias-ng-us-south-dal13-prod_lifecycle_snapshot+0+0000195526.avro?cache=false';
      const singleFileQuery = `select context from read_json('${avroFile}' limit 2;`;
      const plugin = new AvroPlugin();
      const settings = [];
      const endpoint = 'http://test.com';
      const defaultBucket = 'obs-vpc-eventing-prod-raw';
      const actual = plugin.processQuery({ settings, endpoint, defaultBucket, query: singleFileQuery });
      const expected = [
        {
          endpoint,
          bucket: defaultBucket,
          file: 'rias-ng-us-south-dal13-prod_lifecycle_snapshot+0+0000195526.avro',
          sqlFileReference: 'rias-ng-us-south-dal13-prod_lifecycle_snapshot+0+0000195526.json',
          cache: false,
        },
      ];

      assert.deepStrictEqual(actual.settings, expected);
    });

    it('modifies the query to read json files and removes avro files', () => {
      const plugin = new AvroPlugin();
      const settings = [];
      const endpoint = 'http://test.com';
      const defaultBucket = 'us-east';
      const actual = plugin.processQuery({ settings, endpoint, defaultBucket, query });

      assert(actual.query.includes('.avro') === false);
      assert(actual.query.includes('.json') === true);
    });
  });

  describe('processFile', () => {
    it('resolves with file name if the file is not an avro file', async () => {
      const plugin = new AvroPlugin();
      const fileName = 'my-file.json';
      const actual = await plugin.processFile(fileName);

      assert(actual === fileName);
    });
  });
});
