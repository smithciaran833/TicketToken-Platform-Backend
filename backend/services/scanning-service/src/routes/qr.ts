import express, { Request, Response, Router } from 'express';
import QRGenerator from '../services/QRGenerator';
import logger from '../utils/logger';

const router: Router = express.Router();
const qrGenerator = new QRGenerator();

// GET /api/qr/generate/:ticketId - Generate QR code for a ticket
router.get('/generate/:ticketId', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const result = await qrGenerator.generateRotatingQR(ticketId);
    
    return res.json(result);
  } catch (error: any) {
    logger.error('QR generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'QR_GENERATION_ERROR',
      message: error.message
    });
  }
});

// POST /api/qr/validate - Validate a QR code
router.post('/validate', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { qr_data } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_QR_DATA'
      });
    }
    
    // Parse and validate QR data
    const parts = qr_data.split(':');
    if (parts.length !== 3) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QR_FORMAT'
      });
    }
    
    return res.json({
      success: true,
      valid: true
    });
  } catch (error) {
    logger.error('QR validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR'
    });
  }
});

export default router;
