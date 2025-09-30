import { Router } from 'express';
import { RiskController } from '../controllers/risk.controller';
import { requireComplianceOfficer } from '../middleware/auth.middleware';

const router = Router();

// Risk assessment routes
router.post('/risk/assess', requireComplianceOfficer, RiskController.calculateRiskScore);
router.get('/risk/:entityId/score', RiskController.calculateRiskScore); // Using same method
router.put('/risk/:entityId/override', requireComplianceOfficer, RiskController.flagVenue); // Using flag as override
router.post('/risk/flag', RiskController.flagVenue);
router.post('/risk/resolve', RiskController.resolveFlag);

export default router;
