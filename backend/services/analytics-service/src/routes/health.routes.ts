import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

const router = Router();

// Basic health check
router.get('/', healthController.health);

// Detailed health check
router.get('/ready', healthController.readiness);

// Liveness check
router.get('/live', healthController.liveness);

// Service dependencies check
router.get('/dependencies', healthController.dependencies);

export { router as healthRouter };
