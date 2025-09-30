import { Router } from 'express';
import { TaxController } from '../controllers/tax.controller';

const router = Router();

// Tax routes - authenticated by default from index.ts
router.post('/tax/calculate', TaxController.calculateTax);
router.get('/tax/reports/:year', TaxController.generateTaxReport);

export default router;
