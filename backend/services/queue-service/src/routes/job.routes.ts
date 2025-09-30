import { Router } from 'express';
import { JobController, addJobSchema } from '../controllers/job.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';

const router = Router();
const jobController = new JobController();

// All job routes require authentication
router.use(authenticate);

// Add a new job
router.post(
  '/',
  validateBody(addJobSchema),
  jobController.addJob.bind(jobController)
);

// Get job details
router.get('/:id', jobController.getJob.bind(jobController));

// Retry a failed job
router.post(
  '/:id/retry',
  authorize('admin', 'venue_admin'),
  jobController.retryJob.bind(jobController)
);

// Cancel a job
router.delete(
  '/:id',
  authorize('admin', 'venue_admin'),
  jobController.cancelJob.bind(jobController)
);

// Add batch jobs
router.post(
  '/batch',
  authorize('admin', 'venue_admin'),
  jobController.addBatchJobs.bind(jobController)
);

export default router;
