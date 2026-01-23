/**
 * Notification Service Client
 *
 * Client for communicating with notification-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: marketplace-service, order-service, venue-service
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Notification channel types
 */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

/**
 * Notification priority levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification status values
 */
export type NotificationStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced';

/**
 * Request to send a single notification
 */
export interface SendNotificationRequest {
  /** User ID to notify */
  userId: string;
  /** Notification template ID or type */
  templateId: string;
  /** Channels to send on (defaults to user preferences) */
  channels?: NotificationChannel[];
  /** Priority level */
  priority?: NotificationPriority;
  /** Template variables */
  data: Record<string, string | number | boolean>;
  /** Subject line (for email) */
  subject?: string;
  /** Optional scheduling */
  scheduledFor?: string;
  /** Idempotency key */
  idempotencyKey?: string;
  /** Metadata for tracking */
  metadata?: Record<string, string>;
}

/**
 * Response from sending notification
 */
export interface SendNotificationResponse {
  /** Whether send was queued successfully */
  success: boolean;
  /** Notification ID for tracking */
  notificationId: string;
  /** Status per channel */
  channelStatus: Array<{
    channel: NotificationChannel;
    status: NotificationStatus;
    messageId?: string;
  }>;
  /** Message */
  message?: string;
}

/**
 * Single notification in batch
 */
export interface BatchNotificationItem {
  /** User ID to notify */
  userId: string;
  /** Template ID */
  templateId: string;
  /** Template variables */
  data: Record<string, string | number | boolean>;
  /** Channels (optional, defaults to user prefs) */
  channels?: NotificationChannel[];
  /** Subject for email */
  subject?: string;
}

/**
 * Request to send batch notifications
 */
export interface SendBatchNotificationRequest {
  /** Array of notifications to send */
  notifications: BatchNotificationItem[];
  /** Priority for entire batch */
  priority?: NotificationPriority;
  /** Batch idempotency key */
  idempotencyKey?: string;
}

/**
 * Response from batch notification
 */
export interface SendBatchNotificationResponse {
  /** Whether batch was queued */
  success: boolean;
  /** Batch job ID */
  batchId: string;
  /** Number successfully queued */
  queuedCount: number;
  /** Number failed to queue */
  failedCount: number;
  /** Individual notification IDs */
  notificationIds: string[];
  /** Any failures */
  failures?: Array<{
    userId: string;
    error: string;
  }>;
}

/**
 * User notification record
 */
export interface UserNotification {
  /** Notification ID */
  notificationId: string;
  /** Template used */
  templateId: string;
  /** Subject */
  subject?: string;
  /** Preview text */
  preview: string;
  /** Channel sent on */
  channel: NotificationChannel;
  /** Status */
  status: NotificationStatus;
  /** Whether read by user */
  isRead: boolean;
  /** Sent timestamp */
  sentAt: string;
  /** Read timestamp */
  readAt?: string;
  /** Metadata */
  metadata?: Record<string, string>;
}

/**
 * Response from getting user notifications
 */
export interface GetUserNotificationsResponse {
  /** User ID */
  userId: string;
  /** List of notifications */
  notifications: UserNotification[];
  /** Pagination info */
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  /** Unread count */
  unreadCount: number;
}

/**
 * Options for getting user notifications
 */
export interface GetUserNotificationsOptions {
  /** Maximum number to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by channel */
  channel?: NotificationChannel;
  /** Filter by read status */
  isRead?: boolean;
  /** Filter by status */
  status?: NotificationStatus;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for notification-service internal APIs
 *
 * @example
 * ```typescript
 * const client = new NotificationServiceClient();
 *
 * // Send a notification
 * await client.sendNotification({
 *   userId: 'user-123',
 *   templateId: 'order_confirmation',
 *   data: { orderNumber: 'ORD-456', total: '$50.00' }
 * }, ctx);
 *
 * // Send batch notifications
 * await client.sendBatchNotification({
 *   notifications: [
 *     { userId: 'user-1', templateId: 'event_reminder', data: { eventName: 'Concert' } },
 *     { userId: 'user-2', templateId: 'event_reminder', data: { eventName: 'Concert' } }
 *   ]
 * }, ctx);
 * ```
 */
export class NotificationServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008',
      serviceName: 'notification-service',
      timeout: 10000,
    });
  }

  /**
   * Send a single notification to a user
   *
   * @param request - Notification request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Send result with notification ID
   */
  async sendNotification(
    request: SendNotificationRequest,
    ctx: RequestContext
  ): Promise<SendNotificationResponse> {
    const response = await this.post<SendNotificationResponse>(
      '/internal/notifications',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Send notifications to multiple users in batch
   *
   * @param request - Batch notification request
   * @param ctx - Request context with tenant/user IDs
   * @returns Batch result with individual notification IDs
   */
  async sendBatchNotification(
    request: SendBatchNotificationRequest,
    ctx: RequestContext
  ): Promise<SendBatchNotificationResponse> {
    const response = await this.post<SendBatchNotificationResponse>(
      '/internal/notifications/batch',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Get notifications for a user
   *
   * @param userId - The user ID
   * @param ctx - Request context with tenant/user IDs
   * @param options - Query options for filtering and pagination
   * @returns User's notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    ctx: RequestContext,
    options?: GetUserNotificationsOptions
  ): Promise<GetUserNotificationsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.channel) params.append('channel', options.channel);
    if (options?.isRead !== undefined) params.append('isRead', options.isRead.toString());
    if (options?.status) params.append('status', options.status);

    const queryString = params.toString();
    const path = `/internal/notifications/${userId}${queryString ? `?${queryString}` : ''}`;

    const response = await this.get<GetUserNotificationsResponse>(path, ctx);
    return response.data;
  }

  /**
   * Send order confirmation notification (helper method)
   *
   * @param userId - User ID
   * @param orderData - Order details for template
   * @param ctx - Request context
   * @returns Send result
   */
  async sendOrderConfirmation(
    userId: string,
    orderData: {
      orderId: string;
      orderNumber: string;
      total: string;
      eventName: string;
      eventDate: string;
      ticketCount: number;
    },
    ctx: RequestContext
  ): Promise<SendNotificationResponse> {
    return this.sendNotification(
      {
        userId,
        templateId: 'order_confirmation',
        priority: 'high',
        data: orderData,
        subject: `Order Confirmation - ${orderData.orderNumber}`,
      },
      ctx
    );
  }

  /**
   * Send transfer notification (helper method)
   *
   * @param userId - User ID to notify
   * @param transferData - Transfer details
   * @param ctx - Request context
   * @returns Send result
   */
  async sendTransferNotification(
    userId: string,
    transferData: {
      transferId: string;
      ticketName: string;
      eventName: string;
      senderName?: string;
      recipientName?: string;
      type: 'sent' | 'received';
    },
    ctx: RequestContext
  ): Promise<SendNotificationResponse> {
    const templateId =
      transferData.type === 'sent' ? 'ticket_transfer_sent' : 'ticket_transfer_received';
    const subject =
      transferData.type === 'sent'
        ? `Ticket Transferred - ${transferData.eventName}`
        : `You Received a Ticket - ${transferData.eventName}`;

    return this.sendNotification(
      {
        userId,
        templateId,
        priority: 'high',
        data: transferData,
        subject,
      },
      ctx
    );
  }

  /**
   * Get unread notification count (helper method)
   *
   * @param userId - User ID
   * @param ctx - Request context
   * @returns Unread count
   */
  async getUnreadCount(userId: string, ctx: RequestContext): Promise<number> {
    const result = await this.getUserNotifications(userId, ctx, { limit: 1 });
    return result.unreadCount;
  }
}

/** Singleton instance of NotificationServiceClient */
export const notificationServiceClient = new NotificationServiceClient();
