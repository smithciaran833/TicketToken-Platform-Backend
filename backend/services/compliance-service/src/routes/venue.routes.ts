import { Router } from 'express';
import { VenueController } from '../controllers/venue.controller';
import { authenticate, requireComplianceOfficer } from '../middleware/auth.middleware';

const router = Router();

// All venue compliance routes are already authenticated by index.ts
// But we add additional role checks where needed

router.post('/venue/start-verification', 
  requireComplianceOfficer,
  VenueController.startVerification
);

router.get('/venue/:venueId/status', 
  VenueController.getVerificationStatus
);

router.get('/venue/verifications', 
  requireComplianceOfficer,
  VenueController.getAllVerifications
);

export default router;
