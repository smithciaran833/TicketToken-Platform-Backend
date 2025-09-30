import { Router } from 'express';
import { QueueController } from '../controllers/queue.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const queueController = new QueueController();

// All routes require authentication
router.use(authenticate);

// Basic authenticated routes
router.get('/', queueController.listQueues.bind(queueController));
router.get('/:name/status', queueController.getQueueStatus.bind(queueController));
router.get('/:name/jobs', queueController.getQueueJobs.bind(queueController));

// Admin only routes
router.post(
  '/:name/pause',
  authorize('admin'),
  queueController.pauseQueue.bind(queueController)
);

router.post(
  '/:name/resume',
  authorize('admin'),
  queueController.resumeQueue.bind(queueController)
);

router.post(
  '/:name/clear',
  authorize('admin'),
  queueController.clearQueue.bind(queueController)
);

export default router;
