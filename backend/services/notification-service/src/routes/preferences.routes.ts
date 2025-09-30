import { Router } from 'express';
import { preferenceManager } from '../services/preference-manager';
import { logger } from '../config/logger';

const router = Router();

// Get user preferences
router.get('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = await preferenceManager.getPreferences(userId);
    res.json(preferences);
  } catch (error) {
    logger.error('Failed to get preferences', { error });
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update user preferences
router.put('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const preferences = await preferenceManager.updatePreferences(
      userId,
      updates,
      req.headers['x-user-id'] as string,
      'User update'
    );
    res.json(preferences);
  } catch (error) {
    logger.error('Failed to update preferences', { error });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Unsubscribe via token
router.post('/unsubscribe/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const success = await preferenceManager.unsubscribe(token);
    
    if (success) {
      res.json({ message: 'Successfully unsubscribed' });
    } else {
      res.status(404).json({ error: 'Invalid unsubscribe token' });
    }
  } catch (error) {
    logger.error('Failed to unsubscribe', { error });
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Check if can send notification
router.post('/can-send', async (req, res) => {
  try {
    const { userId, channel, type } = req.body;
    const canSend = await preferenceManager.canSendNotification(userId, channel, type);
    res.json({ canSend });
  } catch (error) {
    logger.error('Failed to check notification permission', { error });
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

export default router;
