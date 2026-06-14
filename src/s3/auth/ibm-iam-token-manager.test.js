import { describe, it } from 'node:test';
import assert from 'node:assert';
import { IbmIamTokenManager } from './ibm-iam-token-manager.js';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function makeFetchFn({ token = 'test-token', expiresIn = 3600, ok = true } = {}) {
  return async () => ({
    ok,
    status: ok ? 200 : 401,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: async () => ({ access_token: token, expires_in: expiresIn }),
  });
}

describe('IbmIamTokenManager', () => {
  describe('getToken', () => {
    it('fetches a token on the first call', async () => {
      const manager = new IbmIamTokenManager('my-api-key', { fetchFn: makeFetchFn({ token: 'fresh-token' }) });

      const token = await manager.getToken();

      assert.strictEqual(token, 'fresh-token');
    });

    it('returns the cached token on subsequent calls before expiry', async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        return { ok: true, json: async () => ({ access_token: 'cached-token', expires_in: 3600 }) };
      };
      const manager = new IbmIamTokenManager('my-api-key', { fetchFn });

      await manager.getToken();
      await manager.getToken();

      assert.strictEqual(callCount, 1);
    });

    it('refreshes the token when within the refresh buffer window', async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        return { ok: true, json: async () => ({ access_token: `token-${callCount}`, expires_in: 3600 }) };
      };
      const manager = new IbmIamTokenManager('my-api-key', { fetchFn });

      await manager.getToken();
      manager.expiry = Date.now() + TOKEN_REFRESH_BUFFER_MS - 1000;
      const token = await manager.getToken();

      assert.strictEqual(callCount, 2);
      assert.strictEqual(token, 'token-2');
    });

    it('throws when the IBM IAM endpoint returns an error response', async () => {
      const manager = new IbmIamTokenManager('bad-key', { fetchFn: makeFetchFn({ ok: false }) });

      await assert.rejects(() => manager.getToken(), /IBM IAM token fetch failed: 401/);
    });
  });
});
