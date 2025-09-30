import { Router } from 'express';
import { GDPRController } from '../controllers/gdpr.controller';

const router = Router();

// GDPR routes
router.post('/gdpr/request-data', GDPRController.requestDeletion); // Using deletion as closest match
router.post('/gdpr/delete-data', GDPRController.requestDeletion);
router.get('/gdpr/status/:requestId', GDPRController.getDeletionStatus);

export default router;
