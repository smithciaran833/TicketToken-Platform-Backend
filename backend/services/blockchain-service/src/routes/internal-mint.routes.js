const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();

router.post("/internal/mint-tickets", async (req, res) => {
  try {
    // Forward to minting service with proper authentication
    const mintingUrl = process.env.MINTING_SERVICE_URL || "http://tickettoken-minting:3018";
    
    // Prepare the request body
    const requestBody = {
      ticketIds: req.body.ticketIds,
      eventId: req.body.eventId,
      userId: req.body.userId,
      queue: req.body.queue || "ticket.mint"
    };
    
    // Add internal service authentication headers
    const timestamp = Date.now().toString();
    const secret = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
    const payload = `blockchain-service:${timestamp}:${JSON.stringify(requestBody)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    const response = await axios.post(`${mintingUrl}/internal/mint`, requestBody, {
      headers: {
        'x-internal-service': 'blockchain-service',
        'x-timestamp': timestamp,
        'x-internal-signature': signature,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error("Minting proxy error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || "Minting request failed",
      message: error.response?.data?.message || error.message
    });
  }
});

module.exports = router;
