import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('buildIbmIamClient', () => {
  let buildIbmIamClient;
  let capturedMiddlewareFn;
  let capturedMiddlewareConfig;
  let capturedClientConfig;

  before(async () => {
    ({ buildIbmIamClient } = await esmock('./ibm-iam-client.js', {
      '@aws-sdk/client-s3': {
        S3Client: class MockS3Client {
          constructor(config) {
            capturedClientConfig = config;
            this.middlewareStack = {
              add(fn, middlewareConfig) {
                capturedMiddlewareFn = fn;
                capturedMiddlewareConfig = middlewareConfig;
              },
            };
          }
        },
      },
      './ibm-iam-token-manager.js': {
        IbmIamTokenManager: class MockIbmIamTokenManager {
          async getToken() { return 'mock-ibm-token'; }
        },
      },
    }));
  });

  it('registers the IBM IAM middleware at finalizeRequest with low priority', () => {
    buildIbmIamClient({ endpoint: 'http://s3.ibm.com', region: 'us-south', forcePathStyle: true }, 'my-api-key');

    assert.strictEqual(capturedMiddlewareConfig.name, 'ibmIamAuth');
    assert.strictEqual(capturedMiddlewareConfig.step, 'finalizeRequest');
    assert.strictEqual(capturedMiddlewareConfig.priority, 'low');
  });

  it('passes placeholder credentials to S3Client so the SDK does not reject the config', () => {
    buildIbmIamClient({ endpoint: 'http://s3.ibm.com', region: 'us-south', forcePathStyle: true }, 'my-api-key');

    assert.strictEqual(capturedClientConfig.credentials.accessKeyId, 'ibm-iam');
    assert.strictEqual(capturedClientConfig.credentials.secretAccessKey, 'ibm-iam');
  });

  it('injects a Bearer token Authorization header on each request', async () => {
    buildIbmIamClient({ endpoint: 'http://s3.ibm.com', region: 'us-south', forcePathStyle: true }, 'my-api-key');

    const requestArgs = { request: { headers: {} } };
    await capturedMiddlewareFn((args) => args)(requestArgs);

    assert.strictEqual(requestArgs.request.headers['Authorization'], 'Bearer mock-ibm-token');
  });
});
