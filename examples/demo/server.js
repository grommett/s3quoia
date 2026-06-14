import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import s3Querier from '../../src/s3-querier.js';

const PORT = 3000;
const BUCKETS_DIR = join(tmpdir(), 's3-querier-demo');
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

function bigintReplacer(_, val) {
  return typeof val === 'bigint' ? Number(val) : val;
}

app.post('/query', async (req, res) => {
  const { sql, endpoint, bucket, accessKeyId, secretAccessKey, apiKey, format } = req.body;
  const isColumnar = format === 'columnar';

  try {
    const result = await s3Querier({
      query: sql,
      defaultEndpoint: endpoint,
      defaultBucket: bucket,
      bucketsDir: BUCKETS_DIR,
      accessKeyId: apiKey ? undefined : accessKeyId,
      secretAccessKey: apiKey ? undefined : secretAccessKey,
      apiKey: apiKey || undefined,
      format: isColumnar ? undefined : 'jsonRecords',
    });
    const payload = isColumnar ? { columns: result } : { rows: result };
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(payload, bigintReplacer));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Demo server running at http://localhost:${PORT}`);
  console.log('MinIO console: http://localhost:9001');
});
