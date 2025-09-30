import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

export const healthRoutes = Router();

healthRoutes.get('/:provider', healthController.getIntegrationHealth);
healthRoutes.get('/:provider/metrics', healthController.getMetrics);
healthRoutes.post('/:provider/test', healthController.testConnection);
