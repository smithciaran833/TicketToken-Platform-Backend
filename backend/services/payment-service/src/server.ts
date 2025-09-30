import app from './app';
import { config } from './config';

const PORT = config.server.port || 3003;

app.listen(PORT, () => {
  console.log(`
🚀 Payment Service Started!
================================
Mode: Development (Mock Services)
Port: ${PORT}
================================

Available Endpoints:
- GET  /health
- POST /api/payments/process
- GET  /api/payments/transaction/:id

Test with:
curl http://0.0.0.0:${PORT}/health
  `);
});
