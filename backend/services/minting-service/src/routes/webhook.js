const express = require('express');
const router = express.Router();
const { PaymentIntegration } = require('../services/PaymentIntegration');
const logger = require('../utils/logger');

// Webhook endpoint to be called by payment service
router.post('/webhook/payment-complete', async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate webhook signature (implement based on your payment provider)
    // const isValid = validateWebhookSignature(req);
    
    logger.info(`📥 Received payment webhook for order ${orderData.orderId}`);
    
    // Trigger minting
    const jobs = await PaymentIntegration.onPaymentComplete(orderData);
    
    res.json({
      success: true,
      message: `Minting initiated for ${jobs.length} tickets`,
      jobIds: jobs.map(j => j.id)
    });
    
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
