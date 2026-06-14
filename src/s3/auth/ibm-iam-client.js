import { S3Client } from '@aws-sdk/client-s3';
import { IbmIamTokenManager } from './ibm-iam-token-manager.js';

export function buildIbmIamClient(config, apiKey) {
  const tokenManager = new IbmIamTokenManager(apiKey);
  const client = new S3Client({ ...config, credentials: { accessKeyId: 'ibm-iam', secretAccessKey: 'ibm-iam' } });
  client.middlewareStack.add(ibmIamMiddleware(tokenManager), { step: 'finalizeRequest', priority: 'low', name: 'ibmIamAuth' });
  return client;
}

function ibmIamMiddleware(tokenManager) {
  return (next) => async (args) => {
    const token = await tokenManager.getToken();
    args.request.headers['Authorization'] = `Bearer ${token}`;
    return next(args);
  };
}
