export enum NotificationType {
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  ORDER_RESERVED = 'ORDER_RESERVED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_REFUNDED = 'ORDER_REFUNDED',
  ORDER_EXPIRED = 'ORDER_EXPIRED',
  EVENT_REMINDER = 'EVENT_REMINDER',
  RESERVATION_EXPIRY_WARNING = 'RESERVATION_EXPIRY_WARNING',
  PAYMENT_FAILURE = 'PAYMENT_FAILURE',
  RE_ENGAGEMENT = 'RE_ENGAGEMENT',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
  WEBHOOK = 'WEBHOOK',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED',
  CANCELLED = 'CANCELLED',
}

export enum NotificationFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY_DIGEST = 'DAILY_DIGEST',
  WEEKLY_DIGEST = 'WEEKLY_DIGEST',
}

export interface EmailTemplate {
  id: string;
  tenantId: string;
  templateName: string;
  templateType: NotificationType;
  subjectTemplate: string;
  bodyHtml: string;
  bodyText: string;
  languageCode: string;
  variables: string[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationLog {
  id: string;
  tenantId: string;
  orderId?: string;
  userId: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  recipient: string;
  subject?: string;
  body?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledNotification {
  id: string;
  tenantId: string;
  orderId: string;
  userId: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  scheduledFor: Date;
  retryCount: number;
  maxRetries: number;
  lastAttemptedAt?: Date;
  sentAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  tenantId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  orderConfirmation: boolean;
  statusUpdates: boolean;
  reminders: boolean;
  marketing: boolean;
  frequency: NotificationFrequency;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  languagePreference: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments?: EmailAttachment[];
  metadata?: Record<string, any>;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface SendSMSRequest {
  to: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface SendPushRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface SendWebhookRequest {
  url: string;
  payload: Record<string, any>;
  signature?: string;
  metadata?: Record<string, any>;
}

export interface NotificationContext {
  tenantId: string;
  userId: string;
  orderId?: string;
  order?: any;
  event?: any;
  user?: any;
  languageCode?: string;
}

export interface TemplateVariables {
  [key: string]: string | number | boolean | Date;
}

export interface RenderTemplateResult {
  subject: string;
  htmlBody: string;
  textBody: string;
}
