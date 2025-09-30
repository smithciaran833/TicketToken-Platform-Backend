import { Router } from 'express';
import { GroupPaymentController } from '../controllers/group-payment.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new GroupPaymentController();

router.post('/create', authenticate, (req, res, next) => controller.createGroup(req, res, next));
router.post('/:groupId/contribute/:memberId', (req, res, next) => controller.contributeToGroup(req, res, next));
router.get('/:groupId/status', (req, res, next) => controller.getGroupStatus(req, res, next));
router.post('/:groupId/reminders', authenticate, (req, res, next) => controller.sendReminders(req, res, next));
router.get('/:groupId/history', (req, res, next) => controller.getContributionHistory(req, res, next));

export default router;
