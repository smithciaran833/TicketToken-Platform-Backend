import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();
const healthController = new HealthController();

router.get('/', healthController.checkHealth.bind(healthController));
router.get('/ready', healthController.checkReadiness.bind(healthController));

export default router;
