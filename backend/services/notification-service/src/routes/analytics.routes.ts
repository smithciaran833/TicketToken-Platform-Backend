import { Router } from 'express';
import { analyticsService } from '../services/analytics';
import { logger } from '../config/logger';

const router = Router();

// Get overall metrics
router.get('/analytics/metrics', async (req, res) => {
  try {
    const { startDate, endDate, channel } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const metrics = await analyticsService.getMetrics(start, end, channel as string);
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get channel breakdown
router.get('/analytics/channels', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const metrics = await analyticsService.getChannelMetrics(start, end);
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get channel metrics', { error });
    res.status(500).json({ error: 'Failed to get channel metrics' });
  }
});

// Get hourly breakdown
router.get('/analytics/hourly/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { channel } = req.query;
    
    const breakdown = await analyticsService.getHourlyBreakdown(
      new Date(date),
      channel as string
    );
    res.json(breakdown);
  } catch (error) {
    logger.error('Failed to get hourly breakdown', { error });
    res.status(500).json({ error: 'Failed to get hourly breakdown' });
  }
});

// Get top notification types
router.get('/analytics/top-types', async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const types = await analyticsService.getTopNotificationTypes(
      start,
      end,
      parseInt(limit as string) || 10
    );
    res.json(types);
  } catch (error) {
    logger.error('Failed to get top types', { error });
    res.status(500).json({ error: 'Failed to get top types' });
  }
});

// Track email open
router.get('/track/open/:trackingId', async (req, res) => {
  try {
    const { n: notificationId, u: userId } = req.query;
    
    if (notificationId && userId) {
      await analyticsService.trackEngagement({
        notificationId: notificationId as string,
        userId: userId as string,
        action: 'opened'
      });
    }
    
    // Return 1x1 transparent pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(pixel);
  } catch (error) {
    logger.error('Failed to track open', { error });
    res.status(200).end(); // Still return pixel
  }
});

// Track link click
router.get('/track/click', async (req, res) => {
  try {
    const { n: notificationId, u: userId, l: linkId, url } = req.query;
    
    if (notificationId && userId && linkId && url) {
      await analyticsService.trackClick({
        notificationId: notificationId as string,
        userId: userId as string,
        linkId: linkId as string,
        originalUrl: url as string,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    
    // Redirect to original URL
    res.redirect(url as string || '/');
  } catch (error) {
    logger.error('Failed to track click', { error });
    res.redirect(req.query.url as string || '/');
  }
});

export default router;
