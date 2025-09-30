import { Router } from 'express';
import { BankController } from '../controllers/bank.controller';

const router = Router();

// Bank verification routes
router.post('/bank/verify', BankController.verifyBankAccount);
router.post('/bank/payout-method', BankController.createPayoutMethod);
router.get('/bank/:accountId/status', BankController.verifyBankAccount); // Using existing method

export default router;
