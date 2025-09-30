import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { body, param } from 'express-validator';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Send single notification
router.post(
  '/send',
  authMiddleware,
  [
    body('venueId').isUUID().withMessage('Valid venue ID required'),
    body('recipientId').isString().withMessage('Recipient ID required'),
    body('recipient.email').optional().isEmail().withMessage('Valid email required'),
    body('recipient.phone').optional().isMobilePhone('any').withMessage('Valid phone required'),
    body('channel').isIn(['email', 'sms', 'push', 'webhook']).withMessage('Valid channel required'),
    body('type').isIn(['transactional', 'marketing', 'system']).withMessage('Valid type required'),
    body('template').isString().withMessage('Template name required'),
    body('priority').isIn(['critical', 'high', 'normal', 'low']).withMessage('Valid priority required'),
    body('data').isObject().withMessage('Template data required'),
  ],
  notificationController.send
);

// Send batch notifications
router.post(
  '/send-batch',
  authMiddleware,
  [
    body('notifications').isArray().withMessage('Notifications array required'),
    body('notifications.*.venueId').isUUID().withMessage('Valid venue ID required'),
    body('notifications.*.recipientId').isString().withMessage('Recipient ID required'),
    body('notifications.*.channel').isIn(['email', 'sms']).withMessage('Valid channel required'),
    body('notifications.*.template').isString().withMessage('Template name required'),
  ],
  notificationController.sendBatch
);

// Get notification status
router.get(
  '/status/:id',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Valid notification ID required'),
  ],
  notificationController.getStatus
);

export default router;
