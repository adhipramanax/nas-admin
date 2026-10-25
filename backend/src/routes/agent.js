import { Router } from '../lib/router.js';
import { cancelPending, confirmPending, ollamaStatus, runAgent } from '../lib/agent.js';

const r = Router();

r.get('/status', async (req, res) => {
  res.json(await ollamaStatus());
});

r.post('/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'Pesan kosong' });
  try {
    res.json(await runAgent(messages));
  } catch (e) {
    const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|EHOSTUNREACH/.test(e.cause?.code || e.message);
    res.status(502).json({
      error: offline ? 'Tidak bisa terhubung ke Ollama. Cek OLLAMA_URL di Pengaturan.' : e.name === 'TimeoutError' ? 'Ollama terlalu lama merespon (timeout).' : e.message,
    });
  }
});

r.post('/actions/:id/confirm', async (req, res) => {
  res.json(await confirmPending(req.params.id));
});

r.post('/actions/:id/cancel', async (req, res) => {
  res.json({ ok: cancelPending(req.params.id) });
});

export default r;
