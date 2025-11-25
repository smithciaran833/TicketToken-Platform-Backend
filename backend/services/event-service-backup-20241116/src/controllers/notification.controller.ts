import { AuthenticatedHandler } from '../types';

export const createNotification: AuthenticatedHandler = async (request, reply) => {
  return reply.status(501).send({
    success: false,
    error: 'Notification creation should be handled by notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service for creating notifications.'
  });
};

export const getUserNotifications: AuthenticatedHandler = async (request, reply) => {
  const { userId } = request.params as { userId: string };
  
  return reply.status(501).send({
    success: false,
    error: 'Notifications should be retrieved from notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service to get user notifications.',
    userId
  });
};

export const markAsRead: AuthenticatedHandler = async (request, reply) => {
  const { notificationId } = request.params as { notificationId: string };
  
  return reply.status(501).send({
    success: false,
    error: 'Notification updates should be handled by notification-service',
    message: 'This endpoint is a placeholder. Use the notification-service to mark notifications as read.',
    notificationId
  });
};
