import { Router } from 'express';

const router = Router();

// Health check routes - NO AUTH for monitoring/load balancers
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'compliance-service',
    timestamp: new Date().toISOString()
  });
});

router.get('/ready', (req, res) => {
  // Check if service is ready to handle requests
  res.json({ ready: true });
});

export default router;
