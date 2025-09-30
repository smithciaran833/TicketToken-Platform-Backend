import { Router } from 'express';
import { consentController } from '../controllers/consent.controller';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Grant consent - REQUIRES AUTH
router.post(
  '/grant',
  authMiddleware,  // ADDED AUTH
  [
    body('customerId').isString().withMessage('Customer ID required'),
    body('channel').isIn(['email', 'sms', 'push']).withMessage('Valid channel required'),
    body('type').isIn(['transactional', 'marketing', 'system']).withMessage('Valid type required'),
    body('source').isString().withMessage('Consent source required'),
    body('venueId').optional().isUUID().withMessage('Valid venue ID required'),
  ],
  consentController.grant
);

// Revoke consent - REQUIRES AUTH
router.post(
  '/revoke',
  authMiddleware,  // ADDED AUTH
  [
    body('customerId').isString().withMessage('Customer ID required'),
    body('channel').isIn(['email', 'sms', 'push']).withMessage('Valid channel required'),
    body('type').optional().isIn(['transactional', 'marketing', 'system']),
    body('venueId').optional().isUUID(),
  ],
  consentController.revoke
);

// Check consent status - ALREADY HAS AUTH
router.get(
  '/:customerId',
  authMiddleware,
  [
    param('customerId').isString().withMessage('Customer ID required'),
    query('channel').optional().isIn(['email', 'sms', 'push']),
    query('type').optional().isIn(['transactional', 'marketing', 'system']),
    query('venueId').optional().isUUID(),
  ],
  consentController.check
);

export default router;
