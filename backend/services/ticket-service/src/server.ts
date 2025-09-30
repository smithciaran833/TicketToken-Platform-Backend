import express from 'express';
import { purchaseController } from './controllers/purchaseController';

const app = express();
app.use(express.json());

// Logging
app.use((req, _res, _next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  _next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'ticket-service' });
});

// Purchase routes
app.post('/api/v1/purchase', purchaseController.createOrder);
// Fixed: This route might not be needed or the method doesn't exist
// app.get('/api/v1/orders/:orderId', purchaseController.getOrder);

export default app;
