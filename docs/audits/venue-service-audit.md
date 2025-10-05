# DATABASE AUDIT: venue-service
Generated: Thu Oct  2 15:05:56 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.0.1",
    "opossum": "^9.0.0",
    "pg": "^8.11.3",
    "pino": "^8.21.0",
    "pino-pretty": "^10.2.0",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex, { Knex } from 'knex';

export const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db',
    application_name: 'venue-service'
  },
  pool: {
    min: 0,
    max: 10
  },
  acquireConnectionTimeout: 60000,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

// Create database instance
export const db = knex(dbConfig);

// Pool monitoring
export function startPoolMonitoring() {
  console.log('Database pool monitoring started');
}

// Check database connection with retries
export async function checkDatabaseConnection(retries = 10, delay = 3000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting database connection... (attempt ${i + 1}/${retries})`);
      console.log(`DB Config: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`);
      
      await db.raw('SELECT 1');
      console.log('Database connection successful!');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database connection attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
```

### dbCircuitBreaker.ts
```typescript
import { Knex } from 'knex';
import { withCircuitBreaker } from './circuitBreaker';
import { logger } from './logger';

export function wrapDatabaseWithCircuitBreaker(db: Knex): Knex {
  // Create wrapped version of key database methods
  const originalFrom = db.from.bind(db);
  const originalRaw = db.raw.bind(db);
  const originalTransaction = db.transaction.bind(db);

  // Wrap the 'from' method
  const fromWithBreaker = withCircuitBreaker(
    originalFrom,
    { name: 'db-query', timeout: 5000 }
  );

  // Wrap the 'raw' method
  const rawWithBreaker = withCircuitBreaker(
    originalRaw,
    { name: 'db-raw', timeout: 5000 }
  );

  // Wrap the 'transaction' method
  const transactionWithBreaker = withCircuitBreaker(
    originalTransaction,
    { name: 'db-transaction', timeout: 10000 }
  );

  // Override methods
  (db as any).from = fromWithBreaker;
  (db as any).raw = rawWithBreaker;
  (db as any).transaction = transactionWithBreaker;

  return db;
}
export const createDbCircuitBreaker = (db: any) => { return db; };
```

### dbWithRetry.ts
```typescript
import { Knex } from 'knex';
import { withRetry } from './retry';
import { logger } from './logger';

// Add retry logic to specific database operations
export function retryableQuery<T>(
  queryFn: () => Promise<T>,
  operation: string = 'query'
): Promise<T> {
  return withRetry(
    queryFn,
    {
      maxAttempts: 3,
      initialDelay: 50,
      maxDelay: 1000,
      shouldRetry: isRetryableDbError,
      onRetry: (error, attempt) => {
        logger.debug({ 
          operation,
          error: error.message, 
          attempt 
        }, 'Retrying database operation');
      }
    }
  );
}

export function isRetryableDbError(error: any): boolean {
  // Retry on connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Retry on deadlock errors (PostgreSQL)
  if (error.code === '40P01') {
    return true;
  }
  
  // Retry on serialization failures
  if (error.code === '40001') {
    return true;
  }
  
  // Don't retry on constraint violations or other logical errors
  if (error.code === '23505' || error.code === '23503') {
    return false;
  }
  
  return false;
}
```


## 3. MODEL/ENTITY FILES
### backend/services/venue-service//src/models/integration.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IIntegration {
  id?: string;
  venue_id: string;
  integration_type: string;
  integration_name?: string;
  config_data: Record<string, any>;
  is_active?: boolean;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_integrations', db);
  }

  // Override findById to use is_active instead of deleted_at
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .select(columns)
      .first();
  }

  // Override update to not use deleted_at
  async update(id: string, data: any) {
    const mappedUpdates: any = {};
    
    if (data.config !== undefined) mappedUpdates.config_data = data.config;
    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
    if (data.status !== undefined) mappedUpdates.is_active = data.status === 'active';
    if (data.is_active !== undefined) mappedUpdates.is_active = data.is_active;
    
    const [updated] = await this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .update({
        ...mappedUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    return updated;
  }

  // Override delete to use is_active
  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      });
  }

  async findByVenue(venueId: string): Promise<IIntegration[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .where({ is_active: true });
  }

  async findByVenueAndType(venueId: string, type: string): Promise<IIntegration | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, integration_type: type })
      .where({ is_active: true })
      .first();
  }

  async create(data: any): Promise<IIntegration> {
    const integType = data.type || data.integration_type;
    const mappedData = {
      venue_id: data.venue_id,
      integration_type: integType,
      integration_name: data.name || data.integration_name || `${integType} Integration`,
      config_data: data.config || data.config_data || {},
      api_key_encrypted: data.encrypted_credentials?.apiKey || data.api_key_encrypted,
      api_secret_encrypted: data.encrypted_credentials?.secretKey || data.api_secret_encrypted,
      is_active: data.is_active !== undefined ? data.is_active : true
    };

    const [created] = await this.db(this.tableName)
      .insert(mappedData)
      .returning('*');
    
    return created;
  }
}
```

### backend/services/venue-service//src/models/settings.model.ts
```typescript
import { Knex } from "knex";
import { BaseModel } from './base.model';

export interface IVenueSettings {
  general?: {
    timezone?: string;
    currency?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
  };
  ticketing?: {
    allowRefunds?: boolean;
    refundWindow?: number; // hours
    maxTicketsPerOrder?: number;
    requirePhoneNumber?: boolean;
    enableWaitlist?: boolean;
    transferDeadline?: number; // hours before event
  };
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    notifyOnPurchase?: boolean;
    notifyOnRefund?: boolean;
    dailyReportEnabled?: boolean;
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logo?: string;
    emailFooter?: string;
    customDomain?: string;
  };
  payment?: {
    currency?: string;
    taxRate?: number;
    includeTaxInPrice?: boolean;
    paymentMethods?: string[];
  };
  features?: {
    nftEnabled?: boolean;
    qrCodeEnabled?: boolean;
    seasonPassEnabled?: boolean;
    groupDiscountsEnabled?: boolean;
  };
}

export class SettingsModel {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getVenueSettings(venueId: string): Promise<IVenueSettings> {
    const venue = await this.db('venues')
      .where({ id: venueId })
      .whereNull('deleted_at')
      .select('settings')
      .first();

    return venue?.settings || this.getDefaultSettings();
  }

  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    const newSettings = this.mergeSettings(currentSettings, settings);

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: newSettings,
        updated_at: new Date(),
      });

    return newSettings;
  }

  async updateSettingSection(
    venueId: string, 
    section: keyof IVenueSettings, 
    sectionSettings: any
  ): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    currentSettings[section] = {
      ...currentSettings[section],
      ...sectionSettings,
    };

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: currentSettings,
        updated_at: new Date(),
      });

    return currentSettings;
  }

  getDefaultSettings(): IVenueSettings {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
        enableWaitlist: false,
        transferDeadline: 2,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookUrl: undefined,
        notifyOnPurchase: true,
        notifyOnRefund: true,
        dailyReportEnabled: false,
      },
      branding: {
        primaryColor: '#000000',
        secondaryColor: '#666666',
        logo: undefined,
        emailFooter: undefined,
        customDomain: undefined,
      },
      payment: {
        currency: 'USD',
        taxRate: 0,
        includeTaxInPrice: false,
        paymentMethods: ['card'],
      },
      features: {
        nftEnabled: true,
        qrCodeEnabled: true,
        seasonPassEnabled: false,
        groupDiscountsEnabled: false,
      },
    };
  }

  private mergeSettings(current: IVenueSettings, updates: Partial<IVenueSettings>): IVenueSettings {
    const merged = { ...current };

    for (const [section, sectionUpdates] of Object.entries(updates)) {
      if (sectionUpdates && typeof sectionUpdates === 'object') {
        merged[section as keyof IVenueSettings] = {
          ...current[section as keyof IVenueSettings],
          ...sectionUpdates,
        };
      }
    }

    return merged;
  }

  async validateSettings(settings: IVenueSettings): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate timezone
    if (settings.general?.timezone) {
      // TODO: Validate against timezone list
    }

    // Validate currency
    if (settings.general?.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    // Validate colors
    if (settings.branding?.primaryColor) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(settings.branding.primaryColor)) {
        errors.push('Invalid primary color format');
      }
    }

    // Validate webhook URL
    if (settings.notifications?.webhookUrl) {
      try {
        new URL(settings.notifications.webhookUrl);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

### backend/services/venue-service//src/models/staff.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  is_active?: boolean;
  last_login_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export interface IStaffWithUser extends IStaffMember {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
}

export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  async findByVenueAndUser(venueId: string, userId: string): Promise<IStaffMember | null> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async getVenueStaff(venueId: string, includeInactive = false): Promise<IStaffMember[]> {
    let query = this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at');

    if (!includeInactive) {
      query = query.where({ is_active: true });
    }

    return query.orderBy('created_at', 'asc');
  }

  async getStaffByRole(venueId: string, role: IStaffMember['role']): Promise<IStaffMember[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, role, is_active: true })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async addStaffMember(staffData: Partial<IStaffMember>): Promise<IStaffMember> {
    const existing = await this.findByVenueAndUser(staffData.venue_id!, staffData.user_id!);
    if (existing) {
      throw new Error('Staff member already exists for this venue');
    }

    const permissions = staffData.permissions || this.getDefaultPermissions(staffData.role!);

    return this.create({
      ...staffData,
      permissions: JSON.stringify(permissions),
      is_active: true,
    });
  }

  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
    const updateData: any = { role };

    if (permissions) {
      updateData.permissions = JSON.stringify(permissions);
    } else {
      updateData.permissions = JSON.stringify(this.getDefaultPermissions(role));
    }

    return this.update(id, updateData);
  }

  async deactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: false });
    return !!result;
  }

  async reactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: true });
    return !!result;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.update(id, { last_login_at: new Date() });
  }

  async getUserVenues(userId: string): Promise<Array<{ venue_id: string; role: string }>> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .select('venue_id', 'role');
  }

  async hasPermission(venueId: string, userId: string, permission: string): Promise<boolean> {
    const staff = await this.findByVenueAndUser(venueId, userId);

    if (!staff || !staff.is_active) {
      return false;
    }

    if (staff.role === 'owner') {
      return true;
    }

    return staff.permissions?.includes(permission) || false;
  }

  private getDefaultPermissions(role: IStaffMember['role']): string[] {
    const permissionMap = {
      owner: ['*'],
      manager: [
        'events:create',
        'events:update',
        'events:delete',
        'tickets:view',
        'tickets:validate',
        'reports:view',
        'reports:export',
        'staff:view',
        'settings:view',
      ],
      box_office: [
        'tickets:sell',
        'tickets:view',
        'tickets:validate',
        'payments:process',
        'reports:daily',
        'customers:view',
      ],
      door_staff: [
        'tickets:validate',
        'tickets:view',
        'events:view',
      ],
      viewer: [
        'events:view',
        'reports:view',
      ],
    };

    return permissionMap[role] || [];
  }

  async validateStaffLimit(venueId: string): Promise<{ canAdd: boolean; limit: number; current: number }> {
    const currentStaff = await this.count({ venue_id: venueId, is_active: true });
    const limit = 50;

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}
```

### backend/services/venue-service//src/models/layout.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

export interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class LayoutModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_layouts', db);
  }

  async findByVenue(venueId: string): Promise<ILayout[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc');
  }

  async getDefaultLayout(venueId: string): Promise<ILayout | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, is_default: true })
      .whereNull('deleted_at')
      .first();
  }

  async setAsDefault(layoutId: string, venueId: string): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx(this.tableName)
        .where({ venue_id: venueId })
        .update({ is_default: false });

      await trx(this.tableName)
        .where({ id: layoutId, venue_id: venueId })
        .update({ is_default: true });
    });
  }
}
```

### backend/services/venue-service//src/models/base.model.ts
```typescript
import { Knex } from 'knex';

export abstract class BaseModel {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  // Helper to create a new instance with transaction
  withTransaction(trx: Knex.Transaction): this {
    const ModelClass = this.constructor as any;
    return new ModelClass(trx);
  }

  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .select(columns)
      .first();
  }

  async findAll(conditions: any = {}, options: any = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

    let query = this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at');

    if (options.columns) {
      query = query.select(options.columns);
    }

    return query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);
  }

  async create(data: any) {
    const [record] = await this.db(this.tableName)
      .insert(data)
      .returning('*');

    return record;
  }

  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        deleted_at: new Date()
      });
  }

  async count(conditions: any = {}): Promise<number> {
    const result = await this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return parseInt(String(result?.count || '0'), 10);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
  }

  generateId(): string {
    const prefix = this.tableName.substring(0, 3);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### backend/services/venue-service//src/models/venue.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IVenue {
  id?: string;
  created_by?: string;
  name: string;
  slug: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  async findBySlug(slug: string): Promise<IVenue | null> {
    const venue = await this.db('venues')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await super.findById(id);
    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async createWithDefaults(venueData: Partial<IVenue>): Promise<IVenue> {
    // Only generate slug if not provided
    const slug = venueData.slug || this.generateSlug(venueData.name || '');

    const venue: Partial<IVenue> = {
      ...venueData,
      slug,
      settings: {
        general: {
          timezone: 'America/New_York',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
          requirePhoneNumber: false,
        },
        notifications: {
          emailEnabled: true,
          smsEnabled: false,
        },
        ...venueData.settings,
      },
      onboarding_status: 'pending',
      is_active: true,
    };

    const dbData = this.transformForDb(venue);
    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  async updateOnboardingStatus(venueId: string, status: IVenue['onboarding_status']): Promise<boolean> {
    const result = await this.update(venueId, { onboarding_status: status });
    return !!result;
  }

  async getActiveVenues(options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(type: IVenue['type'], options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ type, is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(searchTerm: string, options: any = {}): Promise<IVenue[]> {
    const {
      limit = 20,
      offset = 0,
      type,
      city,
      state,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let query = this.db('venues')
      .whereNull('deleted_at')
      .where('is_active', true);

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('city', 'ilike', `%${searchTerm}%`);
      });
    }

    if (type) {
      query = query.where('type', type);
    }

    if (city) {
      query = query.where('city', 'ilike', city);
    }

    if (state) {
      query = query.where('state', 'ilike', state);
    }

    const sortColumn = sort_by === 'created_at' ? 'created_at' :
                      sort_by === 'capacity' ? 'capacity' : 'name';
    query = query.orderBy(sortColumn, sort_order);

    const venues = await query.limit(limit).offset(offset);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenueStats(venueId: string): Promise<any> {
    const venue = await this.findById(venueId);
    if (!venue) return null;

    return {
      venue,
      stats: {
        totalEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        activeStaff: 0,
      },
    };
  }

  private transformForDb(venueData: Partial<IVenue>): any {
    const { address, ...rest } = venueData;
    const dbData: any = {
      ...rest
    };
    if (address) {
      dbData.address = address;
      dbData.city = address.city;
      dbData.state = address.state;
      dbData.zip_code = address.zipCode;
      dbData.country = address.country || 'US';
    }
    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    const { city, state, zip_code, country, address, ...rest } = dbVenue;

    const venueAddress = address || {
      street: '',
      city: city || '',
      state: state || '',
      zipCode: zip_code || '',
      country: country || 'US'
    };

    if (!venueAddress.city) venueAddress.city = city || '';
    if (!venueAddress.state) venueAddress.state = state || '';
    if (!venueAddress.zipCode) venueAddress.zipCode = zip_code || '';
    if (!venueAddress.country) venueAddress.country = country || 'US';

    return {
      ...rest,
      address: venueAddress
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/venue-service//src/routes/internal-validation.routes.ts:60:        FROM tickets t
backend/services/venue-service//src/routes/internal-validation.routes.ts:61:        JOIN events e ON t.event_id = e.id

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### venue.service.test.ts
First 100 lines:
```typescript
import { VenueService } from '../../services/venue.service';
import { setupTestApp, cleanupDatabase } from '../setup';
import { FastifyInstance } from 'fastify';

describe('VenueService', () => {
  let app: FastifyInstance;
  let venueService: VenueService;
  let db: any;

  beforeAll(async () => {
    app = await setupTestApp();
    const container = app.container.cradle;
    venueService = container.venueService;
    db = container.db;
  });

  afterEach(async () => {
    await cleanupDatabase(db);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createVenue', () => {
    it('should create a venue with owner', async () => {
      const venueData = {
        name: 'Test Comedy Club',
        type: 'comedy_club' as const,
        capacity: 200,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US'
        },
      city: 'New York',
      state: 'NY',
      zip_code: '10001'
      };

      const venue = await venueService.createVenue(venueData, 'user-123');

      expect(venue).toHaveProperty('id');
      expect(venue.name).toBe('Test Comedy Club');
      expect(venue.slug).toBe('test-comedy-club');

      // Check staff was added
      const staff = await db('venue_staff').where({ venue_id: venue.id }).first();
      expect(staff.user_id).toBe('user-123');
      expect(staff.role).toBe('owner');
    });
  });
});
```

### integration.service.ts
First 100 lines:
```typescript
import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: { db: Knex; logger: any }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
  }

  async getIntegration(integrationId: string): Promise<IIntegrationWithCredentials | null> {
    const integration = await this.integrationModel.findById(integrationId);
    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string): Promise<IIntegrationWithCredentials | null> {
    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string): Promise<IIntegration[]> {
    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, data: any): Promise<IIntegration> {
    return this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: data.encrypted_credentials
    });
  }

  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
    return this.integrationModel.update(integrationId, updates);
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    await this.integrationModel.delete(integrationId);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(encrypted_credentials);
      case 'square':
        return this.testSquareIntegration(encrypted_credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Stripe connection
      return { success: true, message: 'Stripe connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Stripe' };
    }
  }

  private testSquareIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Square connection
      return { success: true, message: 'Square connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Square' };
    }
  }

  private encryptCredentials(encrypted_credentials: any): string {
    // Implement encryption
    return JSON.stringify(encrypted_credentials);
  }

  private decryptCredentials(encryptedCredentials: string): any {
    // Implement decryption
    return JSON.parse(encryptedCredentials);
  }

  async syncWithExternalSystem(integrationId: string): Promise<void> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
```

### verification.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface VerificationResult {
  verified: boolean;
  checks: {
    businessInfo: boolean;
    taxInfo: boolean;
    bankAccount: boolean;
    identity: boolean;
  };
  issues: string[];
  verifiedAt?: Date;
}

export class VerificationService {
  async verifyVenue(venueId: string): Promise<VerificationResult> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const result: VerificationResult = {
      verified: false,
      checks: {
        businessInfo: false,
        taxInfo: false,
        bankAccount: false,
        identity: false,
      },
      issues: [],
    };

    // Check business information
    result.checks.businessInfo = await this.verifyBusinessInfo(venue);
    if (!result.checks.businessInfo) {
      result.issues.push('Incomplete business information');
    }

    // Check tax information
    result.checks.taxInfo = await this.verifyTaxInfo(venueId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account
    result.checks.bankAccount = await this.verifyBankAccount(venueId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification
    result.checks.identity = await this.verifyIdentity(venueId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId);
    }

    logger.info({ venueId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(venueId: string, documentType: string, documentData: any): Promise<void> {
    // Store document reference
    await db('venue_documents').insert({
      venue_id: venueId,
      type: documentType,
      status: 'pending',
      submitted_at: new Date(),
      metadata: documentData,
    });

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId);
        break;
    }

```

### analytics.service.ts
First 100 lines:
```typescript
import { HttpClient } from '../utils/httpClient';

export class AnalyticsService {
  private httpClient: HttpClient;
  private logger: any;

  constructor(dependencies: { logger: any }) {
    this.logger = dependencies.logger;
    this.httpClient = new HttpClient(
      process.env.ANALYTICS_API_URL || 'http://analytics-service:3000',
      this.logger
    );
  }

  async getVenueAnalytics(venueId: string, options: any = {}) {
    try {
      const response: any = await this.httpClient.get(`/venues/${venueId}/analytics`, {
        params: options
      });
      return response.data;
    } catch (error) {
      this.logger.error({ error, venueId }, 'Failed to fetch venue analytics');
      throw error;
    }
  }

  async trackEvent(eventData: any) {
    try {
      const response: any = await this.httpClient.post('/events', eventData);
      return response.data;
    } catch (error) {
      this.logger.error({ error, eventData }, 'Failed to track event');
      throw error;
    }
  }
}
```

### healthCheck.service.ts
First 100 lines:
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

export class HealthCheckService {
  private db: Knex;
  private redis: Redis;
  private startTime: Date;

  constructor(dependencies: { db: Knex; redis: Redis }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
    this.startTime = new Date();
  }

  // Liveness probe - is the service alive?
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness probe - is the service ready to accept traffic?
  async getReadiness(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // Check database
    const dbStart = Date.now();
    try {
      await this.db.raw('SELECT 1');
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      checks.database = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - dbStart
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error: any) {
      checks.redis = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - redisStart
      };
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    
    let status: HealthCheckResult['status'] = 'healthy';
    if (hasErrors) {
      if (checks.database.status === 'error') {
        status = 'unhealthy'; // Database is critical
      } else {
        status = 'degraded'; // Redis failure is degraded
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  // Full health check with business logic
  async getFullHealth(): Promise<HealthCheckResult> {
    const readiness = await this.getReadiness();
```

### cache.service.ts
First 100 lines:
```typescript
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { withCircuitBreaker } from '../utils/circuitBreaker';
import { withRetry } from '../utils/retry';
import { CacheError } from '../utils/errors';

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default
  private keyPrefix: string = 'venue:';

  // Wrapped Redis operations with circuit breakers and retry
  private getWithBreaker: (key: string) => Promise<string | null>;
  private setWithBreaker: (key: string, value: string, ttl?: number) => Promise<string>;
  private delWithBreaker: (key: string) => Promise<number>;
  private existsWithBreaker: (key: string) => Promise<number>;
  private scanWithBreaker: (cursor: string, pattern: string, count: number) => Promise<[string, string[]]>;

  constructor(redis: Redis) {
    this.redis = redis;

    // Wrap Redis operations with retry then circuit breaker
    this.getWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.get(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-get', timeout: 1000 }
    );

    this.setWithBreaker = withCircuitBreaker(
      (key: string, value: string, ttl?: number) => withRetry(
        () => {
          if (ttl) {
            return this.redis.setex(key, ttl, value);
          }
          return this.redis.set(key, value);
        },
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-set', timeout: 1000 }
    );

    this.delWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.del(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-del', timeout: 1000 }
    );

    this.existsWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.exists(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-exists', timeout: 1000 }
    );

    this.scanWithBreaker = withCircuitBreaker(
      (cursor: string, pattern: string, count: number) => withRetry(
        () => this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-scan', timeout: 2000 }
    );
  }

  // Generate cache key with prefix
  private getCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  // Get from cache
  async get(key: string): Promise<any | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = await this.getWithBreaker(cacheKey);
      
      if (data) {
        logger.debug({ key: cacheKey }, 'Cache hit');
        return JSON.parse(data);
      }
      
      logger.debug({ key: cacheKey }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      throw new CacheError('get', error);
    }
  }

  // Set in cache
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = JSON.stringify(value);
      await this.setWithBreaker(cacheKey, data, ttl);
      logger.debug({ key: cacheKey, ttl }, 'Cache set');
    } catch (error) {
```

### onboarding.service.ts
First 100 lines:
```typescript
import { VenueService } from './venue.service';
import { IntegrationModel } from '../models/integration.model';
import { LayoutModel } from '../models/layout.model';
import { StaffModel } from '../models/staff.model';
import { Knex } from 'knex';

export class OnboardingService {
  private venueService: VenueService;
  private integrationModel: IntegrationModel;
  private layoutModel: LayoutModel;
  private staffModel: StaffModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: {
    venueService: VenueService;
    db: Knex;
    logger: any;
  }) {
    this.venueService = dependencies.venueService;
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
    this.layoutModel = new LayoutModel(this.db);
    this.staffModel = new StaffModel(this.db);
  }

  async getOnboardingStatus(venueId: string): Promise<any> {
    const steps = await this.getOnboardingSteps(venueId);
    const completedSteps = steps.filter((s: any) => s.completed).length;
    const totalSteps = steps.length;

    return {
      venueId,
      progress: Math.round((completedSteps / totalSteps) * 100),
      completedSteps,
      totalSteps,
      steps,
      status: completedSteps === totalSteps ? 'completed' : 'in_progress'
    };
  }

  private async getOnboardingSteps(venueId: string): Promise<any[]> {
    return [
      {
        id: 'basic_info',
        name: 'Basic Information',
        description: 'Venue name, type, and capacity',
        completed: await this.hasBasicInfo(venueId),
        required: true
      },
      {
        id: 'address',
        name: 'Address',
        description: 'Venue location details',
        completed: await this.hasAddress(venueId),
        required: true
      },
      {
        id: 'layout',
        name: 'Seating Layout',
        description: 'Configure venue seating arrangement',
        completed: await this.hasLayout(venueId),
        required: false
      },
      {
        id: 'payment',
        name: 'Payment Integration',
        description: 'Connect payment processor',
        completed: await this.hasPaymentIntegration(venueId),
        required: true
      },
      {
        id: 'staff',
        name: 'Staff Members',
        description: 'Add team members',
        completed: await this.hasStaff(venueId),
        required: false
      }
    ];
  }

  private async hasBasicInfo(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    return !!(venue && venue.name && venue.type && venue.capacity);
  }

  private async hasAddress(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    if (!venue || !venue.address) return false;
    const address = venue.address;
    return !!(address.street && address.city && address.state && address.zipCode);
  }

  private async hasLayout(venueId: string): Promise<boolean> {
    const layouts = await this.layoutModel.findByVenue(venueId);
    return layouts.length > 0;
  }

  private async hasPaymentIntegration(venueId: string): Promise<boolean> {
```

### venue.service.ts
First 100 lines:
```typescript
import { createSpan } from '../utils/tracing';
import { VenueModel, IVenue } from '../models/venue.model';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
import { Redis } from 'ioredis';
import { Knex } from 'knex';

import { EventPublisher } from './eventPublisher';
import { CacheService } from './cache.service';

export class VenueService {
  private redis: Redis;
  private auditLogger: VenueAuditLogger;
  private logger: any;
  private db: Knex;
  private cacheService: CacheService;
  private eventPublisher: EventPublisher;

  constructor(dependencies: {
    db: Knex;
    redis: Redis;
    cacheService: CacheService;
    eventPublisher: EventPublisher;
    logger: any
  }) {
    this.redis = dependencies.redis;
    this.logger = dependencies.logger;
    this.auditLogger = new VenueAuditLogger(dependencies.db);
    this.db = dependencies.db;
    this.cacheService = dependencies.cacheService;
    this.eventPublisher = dependencies.eventPublisher;
  }

  // Helper method to get models with proper db connection
  private getModels(dbOrTrx: Knex | Knex.Transaction = this.db) {
    return {
      venueModel: new VenueModel(dbOrTrx),
      staffModel: new StaffModel(dbOrTrx),
      settingsModel: new SettingsModel(dbOrTrx)
    };
  }

  async createVenue(venueData: Partial<IVenue>, ownerId: string, requestInfo?: any): Promise<IVenue> {
    try {
      // Start transaction
      const venue = await this.db.transaction(async (trx) => {
        // Get models with transaction
        const { venueModel, staffModel } = this.getModels(trx);

        // Create venue using transaction
        // Add owner ID to venue data
        venueData.created_by = ownerId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        // Add owner as staff using transaction
        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
        });

        // Initialize default settings using transaction
        await trx('venues').where({ id: newVenue.id }).update({
          settings: this.getDefaultSettings(),
        });

        return newVenue;
      });

      // Log venue creation (outside transaction)
      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      this.logger.info({ venueId: venue.id, ownerId }, 'Venue created successfully');

      // Publish venue created event
      if (venue.id) {
        await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId);
      }

      return venue;
    } catch (error) {
      this.logger.error({ error, venueData }, 'Failed to create venue');
      throw error;
    }
  }

  async getVenue(venueId: string, userId: string): Promise<IVenue | null> {
    // Check cache first
    const cacheKey = `venue:${venueId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      // Still need to check access for cached venues
      const hasAccess = await this.checkVenueAccess(venueId, userId);
      if (!hasAccess) {
        throw new Error('Access denied');
      }
```

### compliance.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface ComplianceReport {
  venueId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'non_compliant' | 'review_needed';
  categories: {
    dataProtection: ComplianceCategory;
    ageVerification: ComplianceCategory;
    accessibility: ComplianceCategory;
    financialReporting: ComplianceCategory;
    licensing: ComplianceCategory;
  };
  recommendations: ComplianceRecommendation[];
  nextReviewDate: Date;
}

interface ComplianceCategory {
  status: 'compliant' | 'non_compliant' | 'review_needed';
  checks: ComplianceCheck[];
  lastReviewDate?: Date;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ComplianceRecommendation {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  dueDate?: Date;
}

export class ComplianceService {
  async generateComplianceReport(venueId: string): Promise<ComplianceReport> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const report: ComplianceReport = {
      venueId,
      generatedAt: new Date(),
      overallStatus: 'compliant',
      categories: {
        dataProtection: await this.checkDataProtection(venueId),
        ageVerification: await this.checkAgeVerification(venueId),
        accessibility: await this.checkAccessibility(venueId),
        financialReporting: await this.checkFinancialReporting(venueId),
        licensing: await this.checkLicensing(venueId),
      },
      recommendations: [],
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Determine overall status
    const statuses = Object.values(report.categories).map(cat => cat.status);
    if (statuses.includes('non_compliant')) {
      report.overallStatus = 'non_compliant';
    } else if (statuses.includes('review_needed')) {
      report.overallStatus = 'review_needed';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.categories);

    // Store report
    await this.storeComplianceReport(report);

    logger.info({ venueId, status: report.overallStatus }, 'Compliance report generated');

    return report;
  }

  async scheduleComplianceReview(venueId: string, reviewDate: Date): Promise<void> {
    await db('venue_compliance_reviews').insert({
      venue_id: venueId,
      scheduled_date: reviewDate,
      status: 'scheduled',
      created_at: new Date(),
    });

    logger.info({ venueId, reviewDate }, 'Compliance review scheduled');
  }

  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
    const existing = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();

    if (existing) {
      await db('venue_compliance')
        .where({ venue_id: venueId })
        .update({
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

