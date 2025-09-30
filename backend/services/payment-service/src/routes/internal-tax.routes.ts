import { Router } from 'express';
import { TaxCalculatorService } from '../services/compliance/tax-calculator.service';
import { internalAuth } from '../middleware/internal-auth';

const router = Router();
const taxCalculator = new TaxCalculatorService();

// ISSUE #25 FIX: Internal endpoint with proper authentication
router.post('/internal/calculate-tax', internalAuth, async (req, res) => {
  try {
    const { amount, venueAddress, customerAddress } = req.body;
    
    // Log which service is requesting tax calculation
    console.log('Tax calculation requested by:', (req as any).internalService);
    
    const taxResult = await taxCalculator.calculateTax(
      amount,
      venueAddress,
      customerAddress
    );
    
    return res.json(taxResult);
  } catch (error) {
    console.error('Tax calculation error:', error);
    return res.status(500).json({ error: 'Tax calculation failed' });
  }
});

export default router;
