const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const IBM_IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

export class IbmIamTokenManager {
  constructor(apiKey, { tokenUrl = IBM_IAM_TOKEN_URL, fetchFn = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.tokenUrl = tokenUrl;
    this.fetchFn = fetchFn;
    this.token = null;
    this.expiry = 0;
  }

  async getToken() {
    if (this.token && Date.now() < this.expiry - TOKEN_REFRESH_BUFFER_MS) {
      return this.token;
    }
    return this.refresh();
  }

  async refresh() {
    const body = new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: this.apiKey,
    });
    const response = await this.fetchFn(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`IBM IAM token fetch failed: ${response.status} ${response.statusText}`);
    }

    const { access_token, expires_in } = await response.json();
    this.token = access_token;
    this.expiry = Date.now() + expires_in * 1000;
    return this.token;
  }
}
