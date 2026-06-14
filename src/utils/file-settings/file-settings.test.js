import { describe, it } from 'node:test';
import assert from 'node:assert';

import { mergeSettings } from './file-settings.js';

describe('file-settings', () => {
  describe('mergeSettings', () => {
    it('returns merged settings on endpoint & bucket', () => {
      const file1 = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/vault_secrets_report_genctl_dal-dev_123.csv',
        cache: true,
      };
      const file2 = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=production/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/vault_secrets_report_genctl_dal-dev_123.csv',
        cache: true,
      };
      const file3 = {
        endpoint: 'http://us-south.com',
        bucket: 'obs-vpc-objects-raw',
        file: 'vpc_objects_raw/version=1.0.0/env=production/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/instances_*.csv',
        cache: true,
      };

      const expected = [
        {
          filePatterns: [
            {
              file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/vault_secrets_report_genctl_dal-dev_123.csv',
              cache: true,
            },
            {
              file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=production/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/vault_secrets_report_genctl_dal-dev_123.csv',
              cache: true,
            },
          ],
          staticFiles: [],
          endpoint: 'http://us-east.com',
          bucket: 'obs-vpc-metadata-raw',
        },
        {
          filePatterns: [
            {
              file: 'vpc_objects_raw/version=1.0.0/env=production/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={mm}/instances_*.csv',
              cache: true,
            },
          ],
          staticFiles: [],
          endpoint: 'http://us-south.com',
          bucket: 'obs-vpc-objects-raw',
        },
      ];
      const actual = mergeSettings([file1, file2, file3]);
      assert.deepStrictEqual(actual, expected);
    });

    it('returns settings with files containing date tokens added to the filePatterns array', () => {
      const settingWithDateTokens = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year={yyyy}/month={MM}/day={dd}/hour={hh}/minute={hh}/vault_secrets_report_genctl_dal-dev_123.csv',
        cache: false
      };
      const [actual] = mergeSettings([settingWithDateTokens]);

      assert.deepStrictEqual(actual.filePatterns[0].file, settingWithDateTokens.file);
    });

    it('returns settings with files containing a glob character added to the filePatterns array', () => {
      const settingWithGlob = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year=2024/month=11/day=06/hour=*/minute=*/vault_secrets_report_genctl_dal-dev_*.csv',
        cache: true
      };
      const [actual] = mergeSettings([settingWithGlob]);

      assert.deepStrictEqual(actual.filePatterns[0].file, settingWithGlob.file);
    });

    it('returns settings with files containing no date tokens or globs added to the staticFiles array', () => {
      const settingStaticFile = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year=2024/month=11/day=06/hour=00/minute=00/vault_secrets_report_genctl_dal-dev_123.csv',
      };
      const [actual] = mergeSettings([settingStaticFile]);

      assert.deepStrictEqual(actual.staticFiles[0].file, settingStaticFile.file);
    });

    it('returns settings with files containing no date tokens or globs added to the staticFiles array', () => {
      const settingStaticFile = {
        endpoint: 'http://us-east.com',
        bucket: 'obs-vpc-metadata-raw',
        file: 'vpc_vault_secrets_metadata_raw_poc/version=1.0.0/env=dev/year=2024/month=11/day=06/hour=00/minute=00/vault_secrets_report_genctl_dal-dev_123.csv',
      };
      const [actual] = mergeSettings([settingStaticFile]);

      assert.deepStrictEqual(actual.staticFiles[0].file, settingStaticFile.file);
    });
  });
});
