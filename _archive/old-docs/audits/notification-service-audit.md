# DATABASE AUDIT: notification-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^2.5.1",
    "lodash": "^4.17.21",
    "moment-timezone": "^0.5.43",
--
    "pg": "^8.11.3",
    "prom-client": "^15.1.3",
    "qrcode": "^1.5.4",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex from 'knex';
import path from 'path';

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'tickettoken',
    password: process.env.DB_PASSWORD || ''
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.join(__dirname, '../migrations')
  }
});

export async function closeDatabaseConnections(): Promise<void> {
  await db.destroy();
}
```


## 3. MODEL/ENTITY FILES
### backend/services/notification-service//src/models/suppression.model.ts
```typescript
import { db } from '../config/database';
import { SuppressionRecord, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import crypto from 'crypto';

export class SuppressionModel {
  private readonly tableName = 'suppression_list';

  async add(suppression: Omit<SuppressionRecord, 'id'>): Promise<SuppressionRecord> {
    // Hash the identifier for privacy
    const hashedIdentifier = this.hashIdentifier(suppression.identifier);

    const [record] = await db(this.tableName)
      .insert({
        ...suppression,
        id: db.raw('gen_random_uuid()'),
        identifier_hash: hashedIdentifier,
        created_at: new Date(),
      })
      .returning('*');
    
    logger.info('Added to suppression list', { 
      channel: suppression.channel,
      reason: suppression.reason 
    });
    
    return this.mapToSuppressionRecord(record);
  }

  async isSuppressed(identifier: string, channel: NotificationChannel): Promise<boolean> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    const result = await db(this.tableName)
      .where('identifier_hash', hashedIdentifier)
      .andWhere('channel', channel)
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    return !!result;
  }

  async remove(identifier: string, channel?: NotificationChannel): Promise<void> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    let query = db(this.tableName)
      .where('identifier_hash', hashedIdentifier);

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    await query.delete();

    logger.info('Removed from suppression list', { channel });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<SuppressionRecord[]> {
    const records = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return records.map(this.mapToSuppressionRecord);
  }

  private hashIdentifier(identifier: string): string {
    return crypto
      .createHash('sha256')
      .update(identifier.toLowerCase().trim())
      .digest('hex');
  }

  private mapToSuppressionRecord(row: any): SuppressionRecord {
    return {
      id: row.id,
      identifier: row.identifier, // Note: This might be null for privacy
      channel: row.channel,
      reason: row.reason,
      suppressedAt: row.suppressed_at || row.created_at,
      suppressedBy: row.suppressed_by,
      expiresAt: row.expires_at,
    };
  }
}

export const suppressionModel = new SuppressionModel();
```

### backend/services/notification-service//src/models/consent.model.ts
```typescript
import { db } from '../config/database';
import { ConsentRecord, NotificationChannel, NotificationType } from '../types/notification.types';
import { logger } from '../config/logger';

export class ConsentModel {
  private readonly tableName = 'consent_records';

  async create(consent: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const [record] = await db(this.tableName)
      .insert({
        customer_id: consent.customerId,
        venue_id: consent.venueId,
        channel: consent.channel,
        type: consent.type,
        status: consent.status,
        granted_at: consent.grantedAt,
        source: consent.source,
        ip_address: consent.ipAddress,
        user_agent: consent.userAgent,
        id: db.raw('gen_random_uuid()'),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    
    logger.info('Consent record created', { 
      customerId: consent.customerId, 
      channel: consent.channel,
      status: consent.status 
    });
    
    return this.mapToConsentRecord(record);
  }

  async findByCustomer(
    customerId: string, 
    channel?: NotificationChannel, 
    type?: NotificationType
  ): Promise<ConsentRecord[]> {
    let query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('status', 'granted');

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    if (type) {
      query = query.andWhere('type', type);
    }

    const records = await query;
    return records.map(this.mapToConsentRecord);
  }

  async hasConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    venueId?: string
  ): Promise<boolean> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('type', type)
      .andWhere('status', 'granted')
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      });

    if (venueId) {
      query.andWhere(function() {
        this.whereNull('venue_id')
          .orWhere('venue_id', venueId);
      });
    }

    const result = await query.first();
    return !!result;
  }

  async revoke(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('status', 'granted');

    if (type) {
      query.andWhere('type', type);
    }

    if (venueId) {
      query.andWhere('venue_id', venueId);
    }

    await query.update({
      status: 'revoked',
      revoked_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Consent revoked', { customerId, channel, type, venueId });
  }

  async getAuditTrail(customerId: string): Promise<ConsentRecord[]> {
    const records = await db(this.tableName)
      .where('customer_id', customerId)
      .orderBy('created_at', 'desc');
    
    return records.map(this.mapToConsentRecord);
  }

  private mapToConsentRecord(row: any): ConsentRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      venueId: row.venue_id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      source: row.source,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

export const consentModel = new ConsentModel();
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/notification-service//src/migrations/009_analytics.sql:83:    INSERT INTO notification_analytics (
backend/services/notification-service//src/migrations/009_analytics.sql:89:        EXTRACT(HOUR FROM created_at) as hour,
backend/services/notification-service//src/migrations/009_analytics.sql:97:    FROM notification_history
backend/services/notification-service//src/migrations/009_analytics.sql:99:    GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at), channel, type, metadata->>'provider'
backend/services/notification-service//src/services/delivery-tracker.ts:177:        INSERT INTO notification_delivery_stats (

### Knex Query Builder
backend/services/notification-service//src/routes/analytics.routes.ts:90:    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
backend/services/notification-service//src/services/automation.service.ts:247:          .from('suppression_list')

## 5. REPOSITORY/SERVICE FILES
### notification.service.ts
First 100 lines:
```typescript
import * as fs from 'fs';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import * as path from 'path';
import * as handlebars from 'handlebars';
import { EmailProvider } from '../providers/email/email.provider';
import { SMSProvider } from '../providers/sms/sms.provider';
import { PushProvider } from '../providers/push/push.provider';
import { NotificationRequest, NotificationResponse } from '../types/notification.types';
import { logger } from '../config/logger';
import { db } from '../config/database';

export class NotificationService {
  async getNotificationStatus(_id: string): Promise<'queued'|'sent'|'failed'|'unknown'> {
    // compile-time stub; replace with real lookup when wired
    return 'queued';
  }

  private emailProvider: EmailProvider;
  private smsProvider: SMSProvider;
  private pushProvider: PushProvider;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.emailProvider = new EmailProvider();
    this.smsProvider = new SMSProvider();
    this.pushProvider = new PushProvider();
    this.loadTemplates();
  }

  private loadTemplates() {
    const templateDir = path.join(__dirname, '../templates/email');
    
    try {
      const files = fs.readdirSync(templateDir);
      
      files.forEach(file => {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templateContent = fs.readFileSync(
            path.join(templateDir, file),
            'utf-8'
          );
          const compiled = handlebars.compile(templateContent);
          this.templates.set(templateName, compiled);
          logger.info(`Loaded template: ${templateName}`);
        }
      });
    } catch (error) {
      logger.error('Failed to load templates:', error);
    }
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    try {
      // Check consent
      const hasConsent = await this.checkConsent(
        request.recipientId,
        request.channel,
        request.type
      );

      if (!hasConsent && request.type === 'marketing') {
        logger.info(`No consent for marketing notification to ${request.recipientId}`);
        return { id: '', status: 'queued', channel: 'email' };
      }

      // Store notification record
      const notificationId = await this.storeNotification(request);

      // Process based on channel
      let result: NotificationResponse;
      
      switch (request.channel) {
        case 'email':
          result = await this.sendEmail(request);
          break;
        case 'sms':
          result = await this.sendSMS(request);
          break;
        case 'push':
          result = await this.sendPush(request);
          break;
        default:
          throw new Error(`Unsupported channel: ${request.channel}`);
      }

      // Update notification status
      await this.updateNotificationStatus(notificationId, result.status);

      return result;
      
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  private async sendEmail(request: NotificationRequest): Promise<NotificationResponse> {
    // Get template
    const template = this.templates.get(request.template);
```

### automation.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

interface AutomationTrigger {
  id: string;
  venueId: string;
  name: string;
  triggerType: 'event' | 'time' | 'behavior' | 'api';
  conditions: any;
  actions: any[];
  enabled: boolean;
}

export class AutomationService {
  private triggers: Map<string, cron.ScheduledTask> = new Map();

  async initializeAutomations() {
    const automations = await db('automation_triggers')
      .where('enabled', true);

    for (const automation of automations) {
      await this.setupTrigger(automation);
    }

    logger.info('Automations initialized', { count: automations.length });
  }

  async createAutomation(automation: {
    venueId: string;
    name: string;
    triggerType: AutomationTrigger['triggerType'];
    conditions: any;
    actions: any[];
  }): Promise<string> {
    const id = uuidv4();

    await db('automation_triggers').insert({
      id,
      venue_id: automation.venueId,
      name: automation.name,
      trigger_type: automation.triggerType,
      conditions: JSON.stringify(automation.conditions),
      actions: JSON.stringify(automation.actions),
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.setupTrigger({
      id,
      ...automation,
      enabled: true,
    });

    logger.info('Automation created', { id, name: automation.name });
    return id;
  }

  private async setupTrigger(trigger: any) {
    switch (trigger.trigger_type || trigger.triggerType) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'event':
        this.setupEventTrigger(trigger);
        break;
      case 'behavior':
        this.setupBehaviorTrigger(trigger);
        break;
    }
  }

  private setupTimeTrigger(trigger: any) {
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    if (conditions.cronExpression) {
      const task = cron.schedule(conditions.cronExpression, async () => {
        await this.executeActions(trigger);
      });

      this.triggers.set(trigger.id, task);
      logger.info('Time trigger scheduled', { 
        id: trigger.id, 
        cron: conditions.cronExpression 
      });
    }
  }

  private setupEventTrigger(trigger: any) {
    // Register event listener for specific events
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // This would integrate with your event system
```

### analytics.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { redisHelper } from '../config/redis';

interface DeliveryMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  bounceRate: number;
  failureRate: number;
}

interface EngagementMetrics {
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

interface CostMetrics {
  totalCost: number;
  emailCost: number;
  smsCost: number;
  costPerRecipient: number;
  costByVenue: Record<string, number>;
}

export class NotificationAnalyticsService {
  async getDeliveryMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DeliveryMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const statusCounts = await query
      .select('status')
      .count('* as count')
      .groupBy('status');

    const metrics: DeliveryMetrics = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      pending: 0,
      deliveryRate: 0,
      bounceRate: 0,
      failureRate: 0,
    };

    let total = 0;
    for (const row of statusCounts) {
      const count = parseInt(row.count as string);
      total += count;

      switch (row.status) {
        case 'sent':
          metrics.sent = count;
          break;
        case 'delivered':
          metrics.delivered = count;
          break;
        case 'bounced':
          metrics.bounced = count;
          break;
        case 'failed':
          metrics.failed = count;
          break;
        case 'pending':
        case 'queued':
          metrics.pending += count;
          break;
      }
    }

    if (total > 0) {
      metrics.deliveryRate = (metrics.delivered / total) * 100;
      metrics.bounceRate = (metrics.bounced / total) * 100;
      metrics.failureRate = (metrics.failed / total) * 100;
    }

    // Cache metrics for dashboard
    await redisHelper.setWithTTL(
      `metrics:delivery:${venueId || 'all'}`,
      metrics,
```

### preference.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomerPreferences {
  customerId: string;
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  timezone: string;
  language: string;
  quietHours: {
    enabled: boolean;
    start: number;
    end: number;
  };
}

export class PreferenceService {
  async getPreferences(customerId: string): Promise<CustomerPreferences> {
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId);
    }

    return {
      customerId: prefs.customer_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>
  ): Promise<void> {
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (existing) {
      await db('customer_preferences')
        .where('customer_id', customerId)
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId);
      const merged = { ...defaults, ...updates };

      await db('customer_preferences').insert({
        id: uuidv4(),
        customer_id: customerId,
        email_preferences: JSON.stringify(merged.email),
        sms_preferences: JSON.stringify(merged.sms),
        timezone: merged.timezone,
        language: merged.language,
        quiet_hours: JSON.stringify(merged.quietHours),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    logger.info('Customer preferences updated', { customerId });
  }

  async getUnsubscribeToken(customerId: string): Promise<string> {
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      })
    ).toString('base64url');

    return token;
  }

  async processUnsubscribe(token: string, channel?: 'email' | 'sms'): Promise<void> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      
```

### wallet-pass.service.ts
First 100 lines:
```typescript
import { logger } from '../config/logger';
import crypto from 'crypto';
import QRCode from 'qrcode';

interface WalletPassData {
  eventName: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  ticketId: string;
  seatInfo?: string;
  customerName: string;
  qrCodeData: string;
}

export class WalletPassService {
  async generateApplePass(data: WalletPassData): Promise<Buffer> {
    try {
      // Apple Wallet pass structure
      const pass = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
        serialNumber: data.ticketId,
        teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
        organizationName: 'TicketToken',
        description: `Ticket for ${data.eventName}`,
        foregroundColor: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(60, 65, 76)',
        labelColor: 'rgb(255, 255, 255)',
        
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'EVENT',
              value: data.eventName,
            },
          ],
          secondaryFields: [
            {
              key: 'loc',
              label: 'VENUE',
              value: data.venueName,
            },
            {
              key: 'date',
              label: 'DATE',
              value: this.formatDate(data.eventDate),
              dateStyle: 'PKDateStyleMedium',
              timeStyle: 'PKDateStyleShort',
            },
          ],
          auxiliaryFields: data.seatInfo ? [
            {
              key: 'seat',
              label: 'SEAT',
              value: data.seatInfo,
            },
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ] : [
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ],
          backFields: [
            {
              key: 'terms',
              label: 'TERMS & CONDITIONS',
              value: 'This ticket is non-transferable. Valid ID required.',
            },
            {
              key: 'venue-address',
              label: 'VENUE ADDRESS',
              value: data.venueAddress,
            },
          ],
        },
        
        barcode: {
          format: 'PKBarcodeFormatQR',
          message: data.qrCodeData,
          messageEncoding: 'iso-8859-1',
        },
        
        relevantDate: data.eventDate.toISOString(),
      };

      // In production, this would:
      // 1. Create pass.json
      // 2. Generate manifest.json with file hashes
      // 3. Sign the manifest
      // 4. Create .pkpass file (zip archive)
      
      // For now, return mock buffer
```

### template.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { NotificationTemplate, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import Handlebars from 'handlebars';
import { redisHelper } from '../config/redis';
import { env } from '../config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TemplateService {
  private readonly tableName = 'notification_templates';
  private compiledTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // Register common Handlebars helpers
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });

    Handlebars.registerHelper('formatTime', (date: Date) => {
      return new Date(date).toLocaleTimeString();
    });

    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('gte', (a: any, b: any) => a >= b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    Handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
  }

  async getTemplate(
    name: string,
    channel: NotificationChannel,
    venueId?: string
  ): Promise<NotificationTemplate | null> {
    // Check cache first
    const cacheKey = `template:${venueId || 'default'}:${channel}:${name}`;
    const cached = await redisHelper.get<NotificationTemplate>(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to find venue-specific template first
    let template = null;
    if (venueId) {
      template = await db(this.tableName)
        .where('venue_id', venueId)
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    // Fall back to default template
    if (!template) {
      template = await db(this.tableName)
        .whereNull('venue_id')
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    if (template) {
      const mapped = this.mapToTemplate(template);
      // Cache for 1 hour
      await redisHelper.setWithTTL(cacheKey, mapped, env.TEMPLATE_CACHE_TTL);
      return mapped;
    }

    return null;
  }

  async renderTemplate(
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{
    subject?: string;
    content: string;
    htmlContent?: string;
  }> {
    try {
      // Compile and cache template
      const contentKey = `${template.id}:content`;
      if (!this.compiledTemplates.has(contentKey)) {
```

### rich-media.service.ts
First 100 lines:
```typescript
import { logger } from '../config/logger';

interface RichMediaOptions {
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    url: string;
    thumbnail?: string;
    duration?: number;
  }>;
  buttons?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  cards?: Array<{
    title: string;
    description: string;
    image?: string;
    link?: string;
  }>;
}

export class RichMediaService {
  async processImages(images: RichMediaOptions['images']): Promise<any[]> {
    if (!images) return [];

    const processed: any[] = [];
    for (const image of images) {
      try {
        // In production, this would:
        // 1. Download image if needed
        // 2. Optimize for email (resize, compress)
        // 3. Upload to CDN
        // 4. Return optimized URL
        
        processed.push({
          ...image,
          optimizedUrl: image.url, // Would be CDN URL
          width: image.width || 600,
          height: image.height || 400,
        });
      } catch (error) {
        logger.error('Failed to process image', { url: image.url, error });
      }
    }

    return processed;
  }

  generateEmailHTML(options: RichMediaOptions): string {
    let html = '';

    // Add images
    if (options.images && options.images.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const image of options.images) {
        html += `
          <img src="${image.url}" 
               alt="${image.alt || ''}" 
               style="max-width: 100%; height: auto; display: block; margin: 10px auto;"
               width="${image.width || 600}">
        `;
      }
      html += '</div>';
    }

    // Add buttons
    if (options.buttons && options.buttons.length > 0) {
      html += '<div style="margin: 20px 0; text-align: center;">';
      for (const button of options.buttons) {
        const bgColor = {
          primary: '#007bff',
          secondary: '#6c757d',
          danger: '#dc3545',
        }[button.style || 'primary'];

        html += `
          <a href="${button.url}" 
             style="display: inline-block; padding: 12px 24px; margin: 5px;
                    background-color: ${bgColor}; color: white; 
                    text-decoration: none; border-radius: 4px;">
            ${button.text}
          </a>
        `;
      }
      html += '</div>';
    }

    // Add cards
    if (options.cards && options.cards.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const card of options.cards) {
        html += `
          <div style="border: 1px solid #ddd; border-radius: 8px; 
                      padding: 15px; margin: 10px 0;">
```

### queue-manager.service.ts
First 100 lines:
```typescript
import Bull from 'bull';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class QueueManager {
  private queues: Map<string, Bull.Queue> = new Map();
  private readonly QUEUE_CONFIGS = {
    CRITICAL: { 
      name: 'critical-notifications',
      concurrency: 10,
      maxDelay: 30000, // 30 seconds
      priority: 1
    },
    HIGH: { 
      name: 'high-notifications',
      concurrency: 5,
      maxDelay: 300000, // 5 minutes
      priority: 2
    },
    NORMAL: { 
      name: 'normal-notifications',
      concurrency: 3,
      maxDelay: 1800000, // 30 minutes
      priority: 3
    },
    BULK: { 
      name: 'bulk-notifications',
      concurrency: 1,
      maxDelay: 14400000, // 4 hours
      priority: 4
    }
  };

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues() {
    Object.entries(this.QUEUE_CONFIGS).forEach(([priority, config]) => {
      const queue = new Bull(config.name, {
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: env.MAX_RETRY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: env.RETRY_DELAY_MS,
          },
        },
      });

      // Add queue event handlers
      queue.on('completed', (job) => {
        logger.info(`${priority} notification completed`, { jobId: job.id });
      });

      queue.on('failed', (job, err) => {
        logger.error(`${priority} notification failed`, { 
          jobId: job.id, 
          error: err.message 
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`${priority} notification stalled`, { jobId: job.id });
      });

      this.queues.set(priority, queue);
    });
  }

  async addToQueue(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BULK',
    data: any
  ): Promise<Bull.Job> {
    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Queue for priority ${priority} not found`);
    }

    const config = this.QUEUE_CONFIGS[priority];
    return await queue.add(data, {
      priority: config.priority,
      delay: this.calculateDelay(priority),
    });
  }

  private calculateDelay(_priority: string): number {
    // Implement rate limiting logic here
    // For now, return 0 for immediate processing
    return 0;
  }

  async getQueueMetrics() {
    const metrics: any = {};
```

### provider-manager.service.ts
First 100 lines:
```typescript
import { logger } from '../config/logger';

interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
}

export class ProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_FAILURES = 3;
  
  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders() {
    // Initialize provider health tracking
    this.providerHealth.set('sendgrid', {
      provider: 'sendgrid',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-ses', {
      provider: 'aws-ses',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('twilio', {
      provider: 'twilio',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-sns', {
      provider: 'aws-sns',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });
  }

  private startHealthChecks() {
    setInterval(() => {
      this.checkProviderHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async checkProviderHealth() {
    for (const [name, health] of this.providerHealth) {
      try {
        // Implement actual health check based on provider
        // For now, using the existing connection status
        health.lastCheck = new Date();
        
        // Mark unhealthy if too many failures
        if (health.failureCount >= this.MAX_FAILURES) {
          health.healthy = false;
          logger.warn(`Provider ${name} marked unhealthy`, {
            failureCount: health.failureCount
          });
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, error);
      }
    }
  }

  async getHealthyEmailProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('sendgrid')?.healthy) {
      return 'sendgrid';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-ses')?.healthy) {
      logger.info('Failing over to AWS SES from SendGrid');
      return 'aws-ses';
    }
    
    throw new Error('No healthy email providers available');
  }

  async getHealthySmsProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('twilio')?.healthy) {
      return 'twilio';
```

### retry.service.ts
First 100 lines:
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    factor: 2,
  };

  async shouldRetry(
    notificationId: string,
    error: Error
  ): Promise<{ retry: boolean; delay: number }> {
    // Get current attempt count
    const notification = await db('notification_tracking')
      .where('id', notificationId)
      .first();

    if (!notification) {
      return { retry: false, delay: 0 };
    }

    const attempts = notification.retry_attempts || 0;

    // Check if we should retry based on error type
    if (!this.isRetryableError(error)) {
      logger.info('Error is not retryable', { 
        notificationId, 
        error: error.message 
      });
      return { retry: false, delay: 0 };
    }

    // Check max attempts
    if (attempts >= this.defaultConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        notificationId, 
        attempts 
      });
      return { retry: false, delay: 0 };
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.defaultConfig.baseDelay * Math.pow(this.defaultConfig.factor, attempts),
      this.defaultConfig.maxDelay
    );

    // Update retry count
    await db('notification_tracking')
      .where('id', notificationId)
      .update({
        retry_attempts: attempts + 1,
        next_retry_at: new Date(Date.now() + delay),
        updated_at: new Date(),
      });

    logger.info('Scheduling retry', { 
      notificationId, 
      attempt: attempts + 1, 
      delay 
    });

    return { retry: true, delay };
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry on permanent failures
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry on temporary failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
```


## 6. ENVIRONMENT VARIABLES
```
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

