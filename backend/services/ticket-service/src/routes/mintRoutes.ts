import { Router, Request, Response } from 'express';
import { MintWorker } from '../workers/mintWorker';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';

const router = Router();
const log = logger.child({ component: 'MintRoutes' });

// This should ONLY be called by internal queue processor
const MINT_SECRET = process.env.MINT_SERVICE_SECRET || 'mint-service-secret-change-in-production';

// Middleware to verify mint service authorization
async function verifyMintAuthorization(req: Request, res: Response, next: any) {
  const authHeader = req.headers['x-mint-authorization'] as string;
  
  if (!authHeader) {
    log.warn('Mint request without authorization');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify the authorization token
  if (authHeader !== `Bearer ${MINT_SECRET}`) {
    log.warn('Invalid mint authorization');
    return res.status(401).json({ error: 'Invalid authorization' });
  }

  // Verify the job is valid and hasn't been processed
  const job = req.body;
  if (!job.orderId || !job.userId || !job.ticketIds) {
    return res.status(400).json({ error: 'Invalid job structure' });
  }

  // Check if order exists and is in correct state
  const db = DatabaseService.getPool();
  try {
    const orderCheck = await db.query(
      'SELECT status, tenant_id FROM orders WHERE id = $1',
      [job.orderId]
    );

    if (orderCheck.rows.length === 0) {
      log.warn('Mint request for non-existent order', { orderId: job.orderId });
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderCheck.rows[0];
    
    // Only mint for orders that are PAID or AWAITING_MINT
    if (!['PAID', 'AWAITING_MINT'].includes(order.status)) {
      log.warn('Mint request for invalid order status', { 
        orderId: job.orderId, 
        status: order.status 
      });
      return res.status(400).json({ error: 'Invalid order status for minting' });
    }

    // Add tenant context
    (req as any).tenantId = order.tenant_id;
    
return     next();
  } catch (error) {
    log.error('Database check failed', error);
    res.status(500).json({ error: 'Validation failed' });
  }
}

// Endpoint to trigger minting - SECURED
router.post('/process-mint', verifyMintAuthorization, async (req, res) => {
  try {
    const job = req.body;
    const tenantId = (req as any).tenantId;
    
    log.info('Processing mint job', { 
      orderId: job.orderId,
      ticketCount: job.ticketIds?.length,
      tenantId
    });
    
    const result = await MintWorker.processMintJob(job);
    
    res.json(result);
  } catch (error: any) {
    log.error('Mint processing failed', error);
    res.status(500).json({ 
      error: 'Mint failed', 
      message: error.message 
    });
  }
});

export default router;
