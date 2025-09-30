export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'bounced' | 'delivered';
export type ConsentStatus = 'granted' | 'revoked' | 'pending';
export type NotificationType = 'transactional' | 'marketing' | 'system';

export interface NotificationRecipient {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  timezone?: string;
  locale?: string;
}

export interface NotificationData {
  [key: string]: any;
}

export interface NotificationRequest {
  id?: string;
  venueId: string;
  recipientId: string;
  recipient: NotificationRecipient;
  channel: NotificationChannel;
  type: NotificationType;
  template: string;
  data: NotificationData;
  priority: NotificationPriority;
  scheduledFor?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface NotificationResponse {
  id: string;
  status: NotificationStatus;
  channel: NotificationChannel;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  providerMessageId?: string;
  cost?: number;
}

export interface ConsentRecord {
  id: string;
  customerId: string;
  venueId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  status: ConsentStatus;
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SuppressionRecord {
  id: string;
  identifier: string; // email or phone
  channel: NotificationChannel;
  reason: string;
  suppressedAt: Date;
  suppressedBy?: string;
  expiresAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  venueId?: string;
  name: string;
  channel: NotificationChannel;
  type: NotificationType;
  subject?: string;
  content: string;
  htmlContent?: string;
  variables: string[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  venueId: string;
  name: string;
  type: NotificationType;
  channel: NotificationChannel;
  templateId: string;
  audienceFilter?: Record<string, any>;
  scheduledFor?: Date;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  stats?: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    opened?: number;
    clicked?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryTracking {
  id: string;
  notificationId: string;
  status: NotificationStatus;
  attempts: number;
  lastAttemptAt: Date;
  nextRetryAt?: Date;
  providerResponse?: any;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
}

export interface VenueNotificationSettings {
  id: string;
  venueId: string;
  dailyEmailLimit?: number;
  dailySmsLimit?: number;
  monthlyEmailLimit?: number;
  monthlySmsLimit?: number;
  blockedChannels?: NotificationChannel[];
  defaultTimezone: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  replyToEmail?: string;
  smsCallbackNumber?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  customBranding?: {
    logoUrl?: string;
    primaryColor?: string;
    footerText?: string;
  };
}

export interface NotificationCost {
  id: string;
  notificationId: string;
  venueId: string;
  channel: NotificationChannel;
  provider: string;
  cost: number;
  currency: string;
  billingPeriod: string;
  isPlatformCost: boolean;
  createdAt: Date;
}
