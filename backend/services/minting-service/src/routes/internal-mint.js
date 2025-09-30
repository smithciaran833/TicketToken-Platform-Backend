const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { MintingOrchestrator } = require('../services/MintingOrchestrator');
const { validateInternalRequest } = require('../middleware/internal-auth');

// Protected internal endpoint - only accessible by authenticated services
router.post('/internal/mint', validateInternalRequest, async (req, res) => {
  try {
    const { ticketIds, eventId, userId, queue } = req.body;
    
    // Validate required fields
    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'ticketIds array is required' 
      });
    }

    if (!eventId || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'eventId and userId are required' 
      });
    }

    logger.info('Internal mint request received', { 
      ticketIds, 
      eventId,
      userId,
      queue,
      fromService: req.internalService 
    });

    const orchestrator = new MintingOrchestrator();
    const results = [];

    for (const ticketId of ticketIds) {
      try {
        const result = await orchestrator.mintCompressedNFT({
          ticketId,
          eventId,
          userId,
          requestedBy: req.internalService
        });
        
        results.push({ 
          ticketId, 
          success: true, 
          result,
          mintAddress: result.mintAddress 
        });
      } catch (error) {
        logger.error('Mint failed for ticket', { 
          ticketId, 
          error: error.message,
          service: req.internalService 
        });
        results.push({ 
          ticketId, 
          success: false, 
          error: error.message 
        });
      }
    }

    const allSuccessful = results.every(r => r.success);
    
    res.json({ 
      success: allSuccessful, 
      results,
      mintedBy: req.internalService,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Internal mint endpoint error:', {
      error: error.message,
      service: req.internalService,
      body: req.body
    });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
