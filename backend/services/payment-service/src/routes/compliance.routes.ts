import { Router } from 'express';
import { ComplianceController } from '../controllers/compliance.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new ComplianceController();

router.get('/tax-forms/:year', authenticate, (req, res, next) => controller.getTaxForm(req, res, next));
router.get('/tax-forms/:year/download', authenticate, (req, res, next) => controller.downloadTaxForm(req, res, next));
router.get('/tax-summary', authenticate, (req, res, next) => controller.getTaxSummary(req, res, next));

export default router;
