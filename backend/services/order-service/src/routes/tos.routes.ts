import { Router } from 'express';
import { TOSController } from '../controllers/tos.controller';

const router = Router();
const controller = new TOSController();

router.post('/versions', (req, res) => controller.createVersion(req as any, res));
router.get('/versions/active', (req, res) => controller.getActiveVersion(req as any, res));
router.post('/accept', (req, res) => controller.acceptTOS(req as any, res));
router.post('/check-compliance', (req, res) => controller.checkCompliance(req as any, res));
router.get('/acceptances', (req, res) => controller.getUserAcceptances(req as any, res));
export default router;
