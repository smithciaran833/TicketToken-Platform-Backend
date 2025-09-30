import { Router } from 'express';
import { mappingController } from '../controllers/mapping.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const mappingRoutes = Router();

// All mapping routes require authentication and admin access
mappingRoutes.use(authenticate);
mappingRoutes.use(authorize('admin', 'venue_admin'));

mappingRoutes.get('/:provider/fields', mappingController.getAvailableFields);
mappingRoutes.get('/:provider/mappings', mappingController.getCurrentMappings);
mappingRoutes.put('/:provider/mappings', mappingController.updateMappings);
mappingRoutes.post('/:provider/mappings/test', mappingController.testMappings);
mappingRoutes.post('/:provider/mappings/apply-template', mappingController.applyTemplate);
mappingRoutes.post('/:provider/mappings/reset', mappingController.resetMappings);
mappingRoutes.post('/:provider/mappings/heal', mappingController.healMappings);
