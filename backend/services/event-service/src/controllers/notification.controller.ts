import { AuthenticatedHandler } from '../types';

/**
 * Notification Controller - PLACEHOLDER ENDPOINTS
 * 
 * MEDIUM PRIORITY FIX for Issue #10:
 * These endpoints return 501 Not Implemented as notifications are handled by notification-service.
 * 
 * TODO - Future Integration:
 * 1. Option A: Remove these endpoints and routes if not needed in event-service
 * 2. Option B: Implement proxy/forwarding to notification-service
 * 3. Option C: Keep as placeholders for API documentation
 * 
 * Current Status: Placeholders with clear 501 responses indicating proper service location
 */

/**
 * TODO: This endpoint should either be removed or proxy to notification-service
 * POST /notifications
 */
export const createNotification: AuthenticatedHandler = async (request, reply) => {
  return reply.status(501).send({
    success: false,
    error: 'Notification creation should be handled by notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service for creating notifications.',
    // TODO: Implement service-to-service call to notification-service or remove this endpoint
  });
};

/**
 * TODO: This endpoint should either be removed or proxy to notification-service
 * GET /notifications/user/:userId
 */
export const getUserNotifications: AuthenticatedHandler = async (request, reply) => {
  const { userId } = request.params as { userId: string };
  
  return reply.status(501).send({
    success: false,
    error: 'Notifications should be retrieved from notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service to get user notifications.',
    userId,
    // TODO: Implement service-to-service call to notification-service or remove this endpoint
  });
};

/**
 * TODO: This endpoint should either be removed or proxy to notification-service
 * PUT /notifications/:notificationId/read
 */
export const markAsRead: AuthenticatedHandler = async (request, reply) => {
  const { notificationId } = request.params as { notificationId: string };
  
  return reply.status(501).send({
    success: false,
    error: 'Notification updates should be handled by notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service to mark notifications as read.',
    notificationId,
    // TODO: Implement service-to-service call to notification-service or remove this endpoint
  });
};
