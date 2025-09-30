import { Router } from 'express';
import { BatchController } from '../controllers/batch.controller';

const router = Router();

// Batch processing routes
router.get('/batch/jobs', BatchController.getBatchJobs);
router.post('/batch/kyc', BatchController.runDailyChecks); // Using existing method
router.post('/batch/risk-assessment', BatchController.runDailyChecks); // Using existing method
router.get('/batch/job/:jobId', BatchController.getBatchJobs); // Using existing method
router.post('/batch/ofac-update', BatchController.updateOFACList);

export default router;
