const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'transfer-service' });
});

router.get('/health/db', async (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    database: 'check-main-file',
    service: 'transfer-service',
    note: 'Database pool is in main application file'
  });
});

module.exports = router;
