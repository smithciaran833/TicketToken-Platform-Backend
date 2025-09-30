import { Router } from 'express';
import { OFACController } from '../controllers/ofac.controller';
import { requireComplianceOfficer } from '../middleware/auth.middleware';

const router = Router();

// OFAC screening routes
router.post('/ofac/check', requireComplianceOfficer, OFACController.checkName);

export default router;
