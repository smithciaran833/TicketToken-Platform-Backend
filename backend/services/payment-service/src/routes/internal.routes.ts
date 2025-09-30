import { Router } from 'express';
import { internalAuth } from '../middleware/internal-auth';
import { db } from '../config/database';

const router = Router();

router.post('/internal/payment-complete', internalAuth, async (req, res) => {
  const { orderId, paymentId } = req.body;
  
  try {
    // Update payment_transactions table which actually exists
    const result = await db('payment_transactions')
      .where('id', paymentId)
      .update({
        status: 'completed',
        updated_at: new Date()
      })
      .returning('*');
    
    console.log('Payment completed:', { orderId, paymentId });
    
    res.json({ 
      success: true, 
      orderId, 
      paymentId,
      transaction: result[0]
    });
  } catch (error) {
    console.error('Payment completion error:', error);
    res.status(500).json({ error: 'Failed to complete payment' });
  }
});

export default router;
