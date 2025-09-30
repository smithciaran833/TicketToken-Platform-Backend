// Health check endpoint
const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'blockchain-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/ready', (req, res) => {
  // Check if worker is ready
  const workerReady = true; // Add actual check here
  
  if (workerReady) {
    res.json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

module.exports = router;
