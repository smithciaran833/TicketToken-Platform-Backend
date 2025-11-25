# COMPLETE DATABASE ANALYSIS: marketplace-service
Generated: Thu Oct  2 15:07:51 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/venue.routes.ts
```typescript
import { Router } from 'express';
import { venueSettingsController } from '../controllers/venue-settings.controller';
import { authMiddleware, requireVenueOwner } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const updateSettingsSchema = Joi.object({
  allowResale: Joi.boolean().optional(),
  maxMarkupPercentage: Joi.number().min(0).max(500).optional(),
  minPricePercentage: Joi.number().min(0).max(100).optional(),
  royaltyPercentage: Joi.number().min(0).max(50).optional(),
});

// All venue routes require authentication and venue owner role
router.use(authMiddleware);
router.use(requireVenueOwner);

// Get venue marketplace settings - SECURED
router.get(
  '/:venueId/settings',
  venueSettingsController.getSettings.bind(venueSettingsController)
);

// Update venue marketplace settings - SECURED
router.put(
  '/:venueId/settings',
  validate(updateSettingsSchema),
  venueSettingsController.updateSettings.bind(venueSettingsController)
);

// Get venue listings - SECURED
router.get(
  '/:venueId/listings',
  venueSettingsController.getVenueListings.bind(venueSettingsController)
);

// Get venue sales report - SECURED
router.get(
  '/:venueId/sales-report',
  venueSettingsController.getSalesReport.bind(venueSettingsController)
);

export default router;
```

### FILE: src/routes/listings.routes.ts
```typescript
import { Router } from 'express';
import { listingController } from '../controllers/listing.controller';
import { authMiddleware, verifyListingOwnership } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createListingSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  eventId: Joi.string().uuid().required(),
  venueId: Joi.string().uuid().required(),
  price: Joi.number().positive().required(),
  originalFaceValue: Joi.number().positive().required(),
  eventStartTime: Joi.date().iso().required(),
});

const updatePriceSchema = Joi.object({
  price: Joi.number().positive().required(),
});

// Public routes (still need some level of rate limiting in production)
router.get('/:id', listingController.getListing.bind(listingController));

// All other routes require authentication
router.use(authMiddleware);

// Get user's own listings
router.get('/my-listings', listingController.getMyListings.bind(listingController));

// Routes requiring wallet connection
router.use(walletMiddleware);

// Create listing - SECURED
router.post(
  '/',
  validate(createListingSchema),
  listingController.createListing.bind(listingController)
);

// Update listing price - SECURED with ownership check
router.put(
  '/:id/price',
  verifyListingOwnership,
  validate(updatePriceSchema),
  listingController.updateListingPrice.bind(listingController)
);

// Cancel listing - SECURED with ownership check
router.delete(
  '/:id',
  verifyListingOwnership,
  listingController.cancelListing.bind(listingController)
);

export default router;
```

### FILE: src/routes/transfers.routes.ts
```typescript
import { Router } from 'express';
import { transferController } from '../controllers/transfer.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const purchaseListingSchema = Joi.object({
  listingId: Joi.string().uuid().required(),
  paymentMethodId: Joi.string().optional(),
});

const directTransferSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  recipientWallet: Joi.string().required(),
});

// All transfer routes require authentication
router.use(authMiddleware);
router.use(walletMiddleware);

// Purchase listing - SECURED
router.post(
  '/purchase',
  validate(purchaseListingSchema),
  transferController.purchaseListing.bind(transferController)
);

// Direct transfer - SECURED
router.post(
  '/direct',
  validate(directTransferSchema),
  transferController.directTransfer.bind(transferController)
);

// Get transfer history - SECURED
router.get(
  '/history',
  transferController.getTransferHistory.bind(transferController)
);

// Get transfer by ID - SECURED
router.get(
  '/:id',
  transferController.getTransfer.bind(transferController)
);

// Cancel pending transfer - SECURED
router.post(
  '/:id/cancel',
  transferController.cancelTransfer.bind(transferController)
);

export default router;
```

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'marketplace-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'marketplace-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'marketplace-service'
    });
  }
});

export default router;
```

### FILE: src/routes/search.routes.ts
```typescript
import { Router } from 'express';
import { searchController } from '../controllers/search.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const searchSchema = Joi.object({
  eventId: Joi.string().uuid().optional(),
  venueId: Joi.string().uuid().optional(),
  minPrice: Joi.number().positive().optional(),
  maxPrice: Joi.number().positive().optional(),
  date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

// Public search (rate limited in production)
router.get(
  '/',
  validate(searchSchema),
  searchController.searchListings.bind(searchController)
);

// Authenticated search with personalized results
router.use(authMiddleware);

router.get(
  '/recommended',
  searchController.getRecommended.bind(searchController)
);

router.get(
  '/watchlist',
  searchController.getWatchlist.bind(searchController)
);

export default router;
```

### FILE: src/config/rabbitmq.ts
```typescript
import { logger } from '../utils/logger';

interface RabbitMQConfig {
  url: string;
  exchanges: {
    marketplace: string;
    events: string;
  };
  queues: {
    listings: string;
    transfers: string;
    disputes: string;
    notifications: string;
  };
  routingKeys: {
    listingCreated: string;
    listingSold: string;
    transferComplete: string;
    disputeCreated: string;
  };
}

export const rabbitmqConfig: RabbitMQConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
  exchanges: {
    marketplace: 'marketplace.exchange',
    events: 'events.exchange'
  },
  queues: {
    listings: 'marketplace.listings.queue',
    transfers: 'marketplace.transfers.queue',
    disputes: 'marketplace.disputes.queue',
    notifications: 'marketplace.notifications.queue'
  },
  routingKeys: {
    listingCreated: 'listing.created',
    listingSold: 'listing.sold',
    transferComplete: 'transfer.complete',
    disputeCreated: 'dispute.created'
  }
};

// Placeholder for RabbitMQ connection
// In production, would use amqplib
class RabbitMQConnection {
  private connected: boolean = false;
  
  async connect(): Promise<void> {
    try {
      // In production: await amqp.connect(rabbitmqConfig.url)
      this.connected = true;
      logger.info('RabbitMQ connection established (simulated)');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }
  
  async publish(exchange: string, routingKey: string, message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    try {
      // In production: channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)))
      logger.debug(`Published to ${exchange}/${routingKey}:`, message);
    } catch (error) {
      logger.error('Failed to publish message:', error);
      throw error;
    }
  }
  
  async subscribe(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    try {
      // In production: channel.consume(queue, handler)
      logger.info(`Subscribed to queue: ${queue}`);
    } catch (error) {
      logger.error('Failed to subscribe to queue:', error);
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.connected) {
      // In production: await connection.close()
      this.connected = false;
      logger.info('RabbitMQ connection closed');
    }
  }
}

export const rabbitmq = new RabbitMQConnection();

export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    await rabbitmq.connect();
    logger.info('RabbitMQ initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ:', error);
    // Don't throw - allow service to run without RabbitMQ
  }
};
```

### FILE: src/config/constants.ts
```typescript
// Fee percentages
export const FEES = {
  PLATFORM_FEE_PERCENTAGE: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '5.00'),
  DEFAULT_VENUE_FEE_PERCENTAGE: parseFloat(process.env.DEFAULT_VENUE_FEE_PERCENTAGE || '5.00'),
  MAX_TOTAL_FEE_PERCENTAGE: 20.00, // Platform + Venue combined max
  MIN_SELLER_PERCENTAGE: 80.00, // Seller gets at least 80%
} as const;

// Listing constraints
export const LISTING_CONSTRAINTS = {
  MIN_PRICE: 1.00, // Minimum listing price in USD
  MAX_PRICE: 10000.00, // Maximum listing price in USD
  MAX_PRICE_MULTIPLIER: 3.0, // Default max 3x face value
  MIN_PRICE_MULTIPLIER: 1.0, // Default min 1x face value
  PRICE_DECIMALS: 2,
} as const;

// Time constraints (in hours)
export const TIME_CONSTRAINTS = {
  DEFAULT_TRANSFER_CUTOFF_HOURS: 4, // No transfers within 4 hours of event
  DEFAULT_LISTING_ADVANCE_HOURS: 720, // Can list 30 days in advance
  LISTING_EXPIRATION_BUFFER_MINUTES: 30, // Expire listings 30 min before cutoff
  TRANSFER_TIMEOUT_MINUTES: 10, // Timeout for transfer completion
} as const;

// Anti-bot limits
export const ANTI_BOT_LIMITS = {
  MAX_LISTINGS_PER_USER_PER_EVENT: 8,
  MAX_LISTINGS_PER_USER_TOTAL: 50,
  MAX_PURCHASES_PER_WALLET: 4,
  PURCHASE_COOLDOWN_MINUTES: 0,
  RAPID_PURCHASE_WINDOW_SECONDS: 60,
  RAPID_PURCHASE_COUNT: 3,
} as const;

// Rate limiting
export const RATE_LIMITS = {
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  LISTING_CREATE_PER_HOUR: 10,
  PRICE_UPDATE_PER_HOUR: 20,
} as const;

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  LISTING_DETAIL: 300, // 5 minutes
  LISTINGS_BY_EVENT: 60, // 1 minute
  USER_LISTINGS: 300, // 5 minutes
  VENUE_SETTINGS: 3600, // 1 hour
  EVENT_STATS: 600, // 10 minutes
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

// Transaction status
export const TRANSACTION_STATUS = {
  INITIATED: 'initiated',
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DISPUTED: 'disputed',
} as const;

// Listing status
export const LISTING_STATUS = {
  ACTIVE: 'active',
  SOLD: 'sold',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PENDING_APPROVAL: 'pending_approval',
} as const;

// Dispute types
export const DISPUTE_TYPES = {
  ENTRY_DENIED: 'entry_denied',
  TECHNICAL_ISSUE: 'technical_issue',
  EVENT_CANCELLED: 'event_cancelled',
  TICKET_INVALID: 'ticket_invalid',
  OTHER: 'other',
} as const;

// Currencies
export const SUPPORTED_CURRENCIES = {
  USDC: 'USDC',
  SOL: 'SOL',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  INVALID_WALLET: 'Invalid wallet address',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  LISTING_NOT_FOUND: 'Listing not found',
  UNAUTHORIZED: 'Unauthorized access',
  TICKET_NOT_OWNED: 'You do not own this ticket',
  PRICE_OUT_OF_RANGE: 'Price is outside allowed range',
  TRANSFER_CUTOFF_PASSED: 'Transfer cutoff time has passed',
  LISTING_LIMIT_EXCEEDED: 'Listing limit exceeded',
  VENUE_BLOCKED: 'You are blocked from this venue',
  TICKET_ALREADY_LISTED: 'Ticket is already listed',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  LISTING_CREATED: 'Listing created successfully',
  LISTING_UPDATED: 'Listing updated successfully',
  LISTING_CANCELLED: 'Listing cancelled successfully',
  TRANSFER_COMPLETED: 'Transfer completed successfully',
} as const;

export default {
  FEES,
  LISTING_CONSTRAINTS,
  TIME_CONSTRAINTS,
  ANTI_BOT_LIMITS,
  RATE_LIMITS,
  CACHE_TTL,
  PAGINATION,
  TRANSACTION_STATUS,
  LISTING_STATUS,
  DISPUTE_TYPES,
  SUPPORTED_CURRENCIES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
```

### FILE: src/config/dependencies.ts
```typescript
import { listingService } from '../services/listing.service';
import { transferService } from '../services/transfer.service';
import { walletService } from '../services/wallet.service';
import { notificationService } from '../services/notification.service';
import { searchService } from '../services/search.service';
import { antiBotService } from '../services/anti-bot.service';
import { disputeService } from '../services/dispute.service';
import { taxReportingService } from '../services/tax-reporting.service';
import { venueRulesService } from '../services/venue-rules.service';
import { validationService } from '../services/validation.service';
import { eventPublisher } from '../events/publishers';
import { eventHandlers } from '../events/handlers';
import { logger } from '../utils/logger';

export interface Dependencies {
  services: {
    listing: typeof listingService;
    transfer: typeof transferService;
    wallet: typeof walletService;
    notification: typeof notificationService;
    search: typeof searchService;
    antiBot: typeof antiBotService;
    dispute: typeof disputeService;
    taxReporting: typeof taxReportingService;
    venueRules: typeof venueRulesService;
    validation: typeof validationService;
  };
  events: {
    publisher: typeof eventPublisher;
    handlers: typeof eventHandlers;
  };
  logger: typeof logger;
}

let dependencies: Dependencies | null = null;

export const initializeDependencies = (): Dependencies => {
  if (dependencies) {
    return dependencies;
  }
  
  dependencies = {
    services: {
      listing: listingService,
      transfer: transferService,
      wallet: walletService,
      notification: notificationService,
      search: searchService,
      antiBot: antiBotService,
      dispute: disputeService,
      taxReporting: taxReportingService,
      venueRules: venueRulesService,
      validation: validationService
    },
    events: {
      publisher: eventPublisher,
      handlers: eventHandlers
    },
    logger
  };
  
  logger.info('Dependencies initialized');
  return dependencies;
};

export const getDependencies = (): Dependencies => {
  if (!dependencies) {
    throw new Error('Dependencies not initialized. Call initializeDependencies() first.');
  }
  return dependencies;
};
```

### FILE: src/config/blockchain.ts
```typescript
import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface BlockchainConfig {
  rpcUrl: string;
  network: string;
  commitment: Commitment;
  programId: string;
  walletPrivateKey?: string;
}

class BlockchainService {
  private connection: Connection;
  private programId: PublicKey;
  private wallet?: Keypair;

  constructor(config: BlockchainConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
    this.programId = new PublicKey(config.programId);
    
    if (config.walletPrivateKey) {
      try {
        // Convert base64 private key to Keypair
        const privateKeyBuffer = Buffer.from(config.walletPrivateKey, 'base64');
        this.wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyBuffer));
        logger.info('Blockchain wallet loaded', { 
          publicKey: this.wallet.publicKey.toBase58() 
        });
      } catch (error) {
        logger.error('Failed to load wallet from private key:', error);
      }
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getWallet(): Keypair | undefined {
    return this.wallet;
  }

  async getBlockHeight(): Promise<number> {
    try {
      return await this.connection.getBlockHeight();
    } catch (error) {
      logger.error('Failed to get block height:', error);
      throw error;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const blockHeight = await this.getBlockHeight();
      logger.info('Blockchain connection successful', { blockHeight });
      return true;
    } catch (error) {
      logger.error('Blockchain connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const blockchain = new BlockchainService({
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  network: process.env.SOLANA_NETWORK || 'devnet',
  commitment: 'confirmed' as Commitment,
  programId: process.env.PROGRAM_ID || '11111111111111111111111111111111',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
});

export default blockchain;
```

### FILE: src/config/database.ts
```typescript
import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';

// Debug: Log the connection details (remove password from logs in production!)
console.log('DB Connection attempt:', {
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD ? '[HIDDEN]' : 'NO PASSWORD SET',
  passwordLength: process.env.DB_PASSWORD?.length || 0
});

const config: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export const db = knex(config);

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await db.destroy();
  logger.info('Database connection closed');
}

export default db;
```

### FILE: src/events/event-types.ts
```typescript
export enum MarketplaceEvents {
  LISTING_CREATED = 'marketplace.listing.created',
  LISTING_UPDATED = 'marketplace.listing.updated',
  LISTING_SOLD = 'marketplace.listing.sold',
  LISTING_CANCELLED = 'marketplace.listing.cancelled',
  LISTING_EXPIRED = 'marketplace.listing.expired',
  TRANSFER_INITIATED = 'marketplace.transfer.initiated',
  TRANSFER_COMPLETED = 'marketplace.transfer.completed',
  TRANSFER_FAILED = 'marketplace.transfer.failed',
  DISPUTE_CREATED = 'marketplace.dispute.created',
  DISPUTE_RESOLVED = 'marketplace.dispute.resolved',
  PRICE_CHANGED = 'marketplace.price.changed'
}

export interface MarketplaceEvent<T = any> {
  type: MarketplaceEvents;
  timestamp: Date;
  payload: T;
  metadata?: Record<string, any>;
}
```

### FILE: src/tests/setup.ts
```typescript
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { db } from '../config/database';

beforeAll(async () => {
  try {
    await db.raw('SELECT 1');
    console.log('Database connected for tests');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}, 30000);

beforeEach(async () => {
  await db.raw('BEGIN');
});

afterEach(async () => {
  await db.raw('ROLLBACK');
});

afterAll(async () => {
  await db.destroy();
});
```

### FILE: src/tests/factories/user.factory.ts
```typescript
import jwt from 'jsonwebtoken';
import { testData } from './test-data';

export interface TestUser {
  id: string;
  email: string;
  wallet: string;
  role: 'user' | 'admin' | 'venue_owner';
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: testData.uuid(),
  email: testData.email(),
  wallet: testData.alphanumeric(44),
  role: 'user',
  ...overrides
});

export const createAuthToken = (user: TestUser): string => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      wallet: user.wallet,
      role: user.role 
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};
```

### FILE: src/tests/factories/listing.factory.ts
```typescript
import { testData } from './test-data';

export interface TestListing {
  id?: string;
  ticket_id: string;
  seller_id: string;
  event_id: string;
  venue_id: string;
  price: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  original_face_value: number;
}

export const createTestListing = (overrides: Partial<TestListing> = {}): TestListing => ({
  id: testData.uuid(),
  ticket_id: testData.uuid(),
  seller_id: testData.uuid(),
  event_id: testData.uuid(),
  venue_id: testData.uuid(),
  price: testData.price(10, 500),
  original_face_value: testData.price(10, 200),
  status: 'active',
  ...overrides
});
```

### FILE: src/migrations/001_create_marketplace_tables.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create marketplace_listings table
  await knex.schema.createTable('marketplace_listings', (table) => {
    table.uuid('id').primary();
    table.uuid('ticket_id').notNullable().unique();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.decimal('price', 10, 2).notNullable();
    table.decimal('original_face_value', 10, 2).notNullable();
    table.decimal('price_multiplier', 5, 2);
    table.enum('status', ['active', 'sold', 'cancelled', 'expired', 'pending_approval']).defaultTo('active');
    table.timestamp('listed_at').defaultTo(knex.fn.now());
    table.timestamp('sold_at');
    table.timestamp('expires_at');
    table.timestamp('cancelled_at');
    table.string('listing_signature');
    table.string('wallet_address').notNullable();
    table.string('program_address');
    table.boolean('requires_approval').defaultTo(false);
    table.timestamp('approved_at');
    table.uuid('approved_by');
    table.text('approval_notes');
    table.integer('view_count').defaultTo(0);
    table.integer('favorite_count').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['event_id', 'status']);
    table.index(['seller_id', 'status']);
    table.index(['status']);
    table.index(['expires_at']);
  });

  // Create marketplace_transfers table
  await knex.schema.createTable('marketplace_transfers', (table) => {
    table.uuid('id').primary();
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('buyer_wallet').notNullable();
    table.string('seller_wallet').notNullable();
    table.string('transfer_signature').notNullable();
    table.integer('block_height');
    table.enum('payment_currency', ['USDC', 'SOL']).notNullable();
    table.decimal('payment_amount', 10, 4);
    table.decimal('usd_value', 10, 2).notNullable();
    table.enum('status', ['initiated', 'pending', 'completed', 'failed', 'disputed']).defaultTo('initiated');
    table.timestamp('initiated_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('failed_at');
    table.text('failure_reason');
    table.decimal('network_fee', 10, 6);
    table.decimal('network_fee_usd', 10, 2);
    table.timestamps(true, true);

    // Indexes
    table.index(['buyer_id', 'status']);
    table.index(['seller_id', 'status']);
    table.index(['listing_id']);
    table.index(['status']);
  });

  // Create platform_fees table
  await knex.schema.createTable('platform_fees', (table) => {
    table.uuid('id').primary();
    table.uuid('transfer_id').notNullable().unique();
    table.decimal('sale_price', 10, 2).notNullable();
    table.decimal('platform_fee_amount', 10, 2).notNullable();
    table.decimal('platform_fee_percentage', 5, 2).notNullable();
    table.decimal('venue_fee_amount', 10, 2).notNullable();
    table.decimal('venue_fee_percentage', 5, 2).notNullable();
    table.decimal('seller_payout', 10, 2).notNullable();
    table.string('platform_fee_wallet');
    table.string('platform_fee_signature');
    table.string('venue_fee_wallet');
    table.string('venue_fee_signature');
    table.boolean('platform_fee_collected').defaultTo(false);
    table.boolean('venue_fee_paid').defaultTo(false);
    table.timestamps(true, true);

    // Indexes
    table.index(['platform_fee_collected']);
    table.index(['venue_fee_paid']);
  });

  // Create venue_marketplace_settings table
  await knex.schema.createTable('venue_marketplace_settings', (table) => {
    table.uuid('venue_id').primary();
    table.decimal('max_resale_multiplier', 5, 2).defaultTo(3.0);
    table.decimal('min_price_multiplier', 5, 2).defaultTo(1.0);
    table.boolean('allow_below_face').defaultTo(false);
    table.integer('transfer_cutoff_hours').defaultTo(4);
    table.integer('listing_advance_hours').defaultTo(720);
    table.boolean('auto_expire_on_event_start').defaultTo(true);
    table.integer('max_listings_per_user_per_event').defaultTo(8);
    table.integer('max_listings_per_user_total').defaultTo(50);
    table.boolean('require_listing_approval').defaultTo(false);
    table.boolean('auto_approve_verified_sellers').defaultTo(false);
    table.decimal('royalty_percentage', 5, 2).defaultTo(5.0);
    table.string('royalty_wallet_address').notNullable();
    table.decimal('minimum_royalty_payout', 10, 2).defaultTo(10.0);
    table.boolean('allow_international_sales').defaultTo(true);
    table.specificType('blocked_countries', 'text[]');
    table.boolean('require_kyc_for_high_value').defaultTo(false);
    table.decimal('high_value_threshold', 10, 2).defaultTo(1000.0);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('platform_fees');
  await knex.schema.dropTableIfExists('marketplace_transfers');
  await knex.schema.dropTableIfExists('marketplace_listings');
  await knex.schema.dropTableIfExists('venue_marketplace_settings');
}
```

### FILE: src/server.ts
```typescript
import app from './app';
import { config, db, redis } from './config';
import { logger } from './utils/logger';

const PORT = config.port;

async function startServer() {
  try {
    // Test database connection
    try {
      await db.raw('SELECT 1');
      logger.info('Database connected');
    } catch (error) {
      logger.error('Database connection failed:', error);
      logger.warn('Starting server without database connection');
    }

    // Test Redis connection but don't fail if it's not available
    try {
      await redis.ping();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis not available - continuing without cache', error);
      // Disable Redis retry attempts
      redis.disconnect();
    }

    // Start server regardless of Redis status
    app.listen(PORT, () => {
      logger.info(`Marketplace service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    await db.destroy();
    redis.disconnect();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  process.exit(0);
});

export { startServer };
```

### FILE: src/controllers/health.controller.ts
```typescript
import { Request, Response } from 'express';
import { db } from '../config/database';
import { cache } from '../services/cache-integration';
import { logger } from '../utils/logger';

export class HealthController {
  async health(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      service: 'marketplace-service',
      timestamp: new Date().toISOString()
    });
  }
  
  async detailed(req: Request, res: Response) {
    const checks = {
      database: false,
      redis: false,
      dependencies: false
    };
    
    // Check database
    try {
      await db.raw('SELECT 1');
      checks.database = true;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }
    
    // Check Redis
    try {
      await cache.set('health_check', 'ok', { ttl: 10 });
      const value = await cache.get('health_check');
      checks.redis = value === 'ok';
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }
    
    // Check dependencies (simplified)
    checks.dependencies = true;
    
    const isHealthy = Object.values(checks).every(v => v === true);
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    });
  }
  
  async readiness(req: Request, res: Response) {
    try {
      await db.raw('SELECT 1');
      res.json({ ready: true });
    } catch (error) {
      res.status(503).json({ ready: false, error: 'Database not ready' });
    }
  }
  
  async liveness(req: Request, res: Response) {
    res.json({ alive: true });
  }
}

export const healthController = new HealthController();
```

### FILE: src/utils/validators.ts
```typescript
import Joi from 'joi';
import { 
  MIN_LISTING_PRICE, 
  MAX_LISTING_PRICE,
  MAX_PRICE_MARKUP_PERCENTAGE 
} from './constants';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: any;
}

// Price validation
export const validatePrice = (price: number, faceValue?: number): ValidationResult => {
  if (price < MIN_LISTING_PRICE) {
    return { isValid: false, error: `Price must be at least $${MIN_LISTING_PRICE}` };
  }
  
  if (price > MAX_LISTING_PRICE) {
    return { isValid: false, error: `Price cannot exceed $${MAX_LISTING_PRICE}` };
  }
  
  if (faceValue) {
    const maxAllowedPrice = faceValue * (1 + MAX_PRICE_MARKUP_PERCENTAGE / 100);
    if (price > maxAllowedPrice) {
      return { 
        isValid: false, 
        error: `Price cannot exceed ${MAX_PRICE_MARKUP_PERCENTAGE}% markup from face value` 
      };
    }
  }
  
  return { isValid: true };
};

// UUID validation
export const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Listing creation schema
export const listingCreationSchema = Joi.object({
  ticket_id: Joi.string().uuid().required(),
  price: Joi.number().min(MIN_LISTING_PRICE).max(MAX_LISTING_PRICE).required(),
  expires_at: Joi.date().optional(),
  notes: Joi.string().max(500).optional()
});

// Transfer request schema
export const transferRequestSchema = Joi.object({
  listing_id: Joi.string().uuid().required(),
  buyer_wallet: Joi.string().required(),
  payment_method: Joi.string().valid('USDC', 'SOL').required()
});

// Pagination schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Validate listing creation
export const validateListingCreation = (data: any): ValidationResult => {
  const { error, value } = listingCreationSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};

// Validate transfer request
export const validateTransferRequest = (data: any): ValidationResult => {
  const { error, value } = transferRequestSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};
```

### FILE: src/utils/solana-helper.ts
```typescript
import { logger } from './logger';

// Mock Solana connection configuration
export interface SolanaConfig {
  endpoint: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

// Get Solana configuration
export const getSolanaConfig = (): SolanaConfig => {
  return {
    endpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
    commitment: 'confirmed'
  };
};

// Confirm transaction on chain
export const confirmTransaction = async (signature: string, maxRetries: number = 3): Promise<boolean> => {
  logger.info(`Confirming transaction ${signature}`);
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // In production, this would use @solana/web3.js to check transaction status
      // For now, simulate confirmation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate 90% success rate
      if (Math.random() > 0.1) {
        logger.info(`Transaction ${signature} confirmed`);
        return true;
      }
      
      retries++;
    } catch (error) {
      logger.error(`Error confirming transaction ${signature}:`, error);
      retries++;
    }
  }
  
  return false;
};

// Get current block height
export const getBlockHeight = async (): Promise<number> => {
  try {
    // In production, would fetch from Solana RPC
    // For now, return mock block height
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    logger.error('Error getting block height:', error);
    return 0;
  }
};

// Calculate transaction fee
export const estimateTransactionFee = async (programId?: string): Promise<number> => {
  try {
    // Base fee in lamports (0.000005 SOL)
    const baseFee = 5000;
    
    // Additional fee for program execution
    const programFee = programId ? 5000 : 0;
    
    return baseFee + programFee;
  } catch (error) {
    logger.error('Error estimating transaction fee:', error);
    return 10000; // Default to 0.00001 SOL
  }
};

// Parse transaction error
export const parseTransactionError = (error: any): string => {
  if (!error) return 'Unknown transaction error';
  
  // Common Solana errors
  if (error.message?.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  }
  
  if (error.message?.includes('account not found')) {
    return 'Account not found on chain';
  }
  
  if (error.message?.includes('signature verification failed')) {
    return 'Invalid transaction signature';
  }
  
  return error.message || 'Transaction failed';
};
```

### FILE: src/models/listing.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceListing {
  id: string;
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  priceMultiplier?: number;   // DECIMAL (e.g., 1.5 = 150%)
  status: 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
  listedAt: Date;
  soldAt?: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  listingSignature?: string;
  walletAddress: string;
  programAddress?: string;
  requiresApproval: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  walletAddress: string;
  expiresAt?: Date;
  requiresApproval?: boolean;
}

export interface UpdateListingInput {
  price?: number;  // INTEGER CENTS
  expiresAt?: Date;
}

export class ListingModel {
  private tableName = 'marketplace_listings';

  async create(input: CreateListingInput): Promise<MarketplaceListing> {
    const id = uuidv4();
    const [listing] = await db(this.tableName)
      .insert({
        id,
        ticket_id: input.ticketId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        price: input.price,
        original_face_value: input.originalFaceValue,
        wallet_address: input.walletAddress,
        expires_at: input.expiresAt,
        requires_approval: input.requiresApproval || false,
        status: input.requiresApproval ? 'pending_approval' : 'active',
      })
      .returning('*');

    return this.mapToListing(listing);
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ id })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByTicketId(ticketId: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ ticket_id: ticketId, status: 'active' })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByEventId(
    eventId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async findBySellerId(
    sellerId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('listed_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async update(
    id: string,
    input: UpdateListingInput
  ): Promise<MarketplaceListing | null> {
    const updateData: any = {};

    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.expiresAt !== undefined) {
      updateData.expires_at = input.expiresAt;
    }

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async updateStatus(
    id: string,
    status: MarketplaceListing['status'],
    additionalData?: any
  ): Promise<MarketplaceListing | null> {
    const updateData: any = { status };

    if (status === 'sold' && !additionalData?.sold_at) {
      updateData.sold_at = new Date();
    }
    if (status === 'cancelled' && !additionalData?.cancelled_at) {
      updateData.cancelled_at = new Date();
    }

    Object.assign(updateData, additionalData);

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db(this.tableName)
      .where({ id })
      .increment('view_count', 1);
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async countByUserId(userId: string, eventId?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ seller_id: userId, status: 'active' })
      .count('* as count');

    if (eventId) {
      query = query.where({ event_id: eventId });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async expireListings(eventId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ event_id: eventId, status: 'active' })
      .update({ status: 'expired' });

    return result;
  }

  private mapToListing(row: any): MarketplaceListing {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      price: parseInt(row.price),  // Ensure integer cents
      originalFaceValue: parseInt(row.original_face_value),  // Ensure integer cents
      priceMultiplier: row.price_multiplier ? parseFloat(row.price_multiplier) : undefined,  // Keep as decimal
      status: row.status,
      listedAt: row.listed_at,
      soldAt: row.sold_at,
      expiresAt: row.expires_at,
      cancelledAt: row.cancelled_at,
      listingSignature: row.listing_signature,
      walletAddress: row.wallet_address,
      programAddress: row.program_address,
      requiresApproval: row.requires_approval,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      approvalNotes: row.approval_notes,
      viewCount: row.view_count,
      favoriteCount: row.favorite_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const listingModel = new ListingModel();
```

### FILE: src/models/tax-reporting.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface TaxReport {
  id: string;
  seller_id: string;
  year: number;
  total_sales: number;
  total_transactions: number;
  total_fees_paid: number;
  net_proceeds: number;
  generated_at: Date;
  report_data?: Record<string, any>;
}

export interface TaxableTransaction {
  id: string;
  seller_id: string;
  transfer_id: string;
  sale_amount: number;
  platform_fee: number;
  net_amount: number;
  transaction_date: Date;
  buyer_wallet: string;
  ticket_id: string;
  reported: boolean;
}

export class TaxReportingModel {
  private readonly reportsTable = 'tax_reports';
  private readonly transactionsTable = 'taxable_transactions';
  
  async recordSale(
    sellerId: string,
    transferId: string,
    saleAmount: number,
    platformFee: number,
    buyerWallet: string,
    ticketId: string
  ): Promise<void> {
    try {
      const transaction: TaxableTransaction = {
        id: uuidv4(),
        seller_id: sellerId,
        transfer_id: transferId,
        sale_amount: saleAmount,
        platform_fee: platformFee,
        net_amount: saleAmount - platformFee,
        transaction_date: new Date(),
        buyer_wallet: buyerWallet,
        ticket_id: ticketId,
        reported: false
      };
      
      await db(this.transactionsTable).insert(transaction);
      
      logger.info(`Taxable transaction recorded for seller ${sellerId}`);
    } catch (error) {
      logger.error('Error recording taxable transaction:', error);
      throw error;
    }
  }
  
  async getYearlyReport(sellerId: string, year: number): Promise<TaxReport | null> {
    try {
      // Check if report already exists
      const existingReport = await db(this.reportsTable)
        .where('seller_id', sellerId)
        .where('year', year)
        .first();
      
      if (existingReport) {
        return {
          ...existingReport,
          report_data: existingReport.report_data ? 
            JSON.parse(existingReport.report_data) : undefined
        };
      }
      
      // Generate new report
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      const transactions = await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .select('*');
      
      if (transactions.length === 0) {
        return null;
      }
      
      const totalSales = transactions.reduce((sum, t) => sum + t.sale_amount, 0);
      const totalFees = transactions.reduce((sum, t) => sum + t.platform_fee, 0);
      const netProceeds = transactions.reduce((sum, t) => sum + t.net_amount, 0);
      
      const report: TaxReport = {
        id: uuidv4(),
        seller_id: sellerId,
        year,
        total_sales: totalSales,
        total_transactions: transactions.length,
        total_fees_paid: totalFees,
        net_proceeds: netProceeds,
        generated_at: new Date(),
        report_data: {
          transactions_by_month: this.groupTransactionsByMonth(transactions),
          largest_sale: Math.max(...transactions.map(t => t.sale_amount)),
          average_sale: totalSales / transactions.length
        }
      };
      
      await db(this.reportsTable).insert({
        ...report,
        report_data: JSON.stringify(report.report_data)
      });
      
      // Mark transactions as reported
      await db(this.transactionsTable)
        .whereIn('id', transactions.map(t => t.id))
        .update({ reported: true });
      
      return report;
    } catch (error) {
      logger.error('Error generating yearly report:', error);
      return null;
    }
  }
  
  async generate1099K(sellerId: string, year: number): Promise<any> {
    try {
      const report = await this.getYearlyReport(sellerId, year);
      
      if (!report) {
        return null;
      }
      
      // Check if meets IRS threshold ($600)
      const irsThreshold = 600;
      if (report.net_proceeds < irsThreshold) {
        return {
          required: false,
          reason: `Net proceeds ($${report.net_proceeds}) below IRS threshold ($${irsThreshold})`
        };
      }
      
      // Generate 1099-K data structure
      return {
        required: true,
        form_type: '1099-K',
        tax_year: year,
        payer: {
          name: 'TicketToken Platform',
          tin: process.env.PLATFORM_TIN || 'XX-XXXXXXX'
        },
        payee: {
          id: sellerId,
          // Additional payee info would be fetched from user service
        },
        gross_amount: report.total_sales,
        transactions_count: report.total_transactions,
        fees_deducted: report.total_fees_paid,
        net_proceeds: report.net_proceeds,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return null;
    }
  }
  
  private groupTransactionsByMonth(transactions: TaxableTransaction[]): Record<string, any> {
    const grouped: Record<string, any> = {};
    
    transactions.forEach(t => {
      const month = new Date(t.transaction_date).toISOString().slice(0, 7);
      if (!grouped[month]) {
        grouped[month] = {
          count: 0,
          total: 0,
          fees: 0,
          net: 0
        };
      }
      grouped[month].count++;
      grouped[month].total += t.sale_amount;
      grouped[month].fees += t.platform_fee;
      grouped[month].net += t.net_amount;
    });
    
    return grouped;
  }
  
  async getReportableTransactions(
    sellerId: string,
    year: number
  ): Promise<TaxableTransaction[]> {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      return await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .orderBy('transaction_date', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting reportable transactions:', error);
      return [];
    }
  }
}

export const taxReportingModel = new TaxReportingModel();
```

### FILE: src/models/dispute.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { DisputeStatus } from '../types/common.types';

export interface Dispute {
  id: string;
  transfer_id: string;
  listing_id: string;
  initiator_id: string;
  respondent_id: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  resolution?: string;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  evidence_type: 'text' | 'image' | 'document' | 'blockchain_tx';
  content: string;
  metadata?: Record<string, any>;
  submitted_at: Date;
}

export class DisputeModel {
  private readonly tableName = 'marketplace_disputes';
  private readonly evidenceTable = 'dispute_evidence';
  
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    respondentId: string,
    reason: string,
    description?: string
  ): Promise<Dispute> {
    try {
      const dispute: Partial<Dispute> = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db(this.tableName).insert(dispute);
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute as Dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(
    disputeId: string,
    submittedBy: string,
    evidenceType: 'text' | 'image' | 'document' | 'blockchain_tx',
    content: string,
    metadata?: Record<string, any>
  ): Promise<DisputeEvidence> {
    try {
      const evidence: Partial<DisputeEvidence> = {
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: submittedBy,
        evidence_type: evidenceType,
        content,
        metadata,
        submitted_at: new Date()
      };
      
      await db(this.evidenceTable).insert({
        ...evidence,
        metadata: evidence.metadata ? JSON.stringify(evidence.metadata) : null
      });
      
      logger.info(`Evidence added to dispute ${disputeId}`);
      return evidence as DisputeEvidence;
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    resolution?: string,
    resolvedBy?: string
  ): Promise<void> {
    try {
      const updates: Partial<Dispute> = {
        status,
        updated_at: new Date()
      };
      
      if (status === 'resolved' || status === 'cancelled') {
        updates.resolution = resolution;
        updates.resolved_by = resolvedBy;
        updates.resolved_at = new Date();
      }
      
      await db(this.tableName)
        .where('id', disputeId)
        .update(updates);
      
      logger.info(`Dispute ${disputeId} updated to status: ${status}`);
    } catch (error) {
      logger.error('Error updating dispute status:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      const dispute = await db(this.tableName)
        .where('id', disputeId)
        .first();
      
      return dispute || null;
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
    try {
      const evidence = await db(this.evidenceTable)
        .where('dispute_id', disputeId)
        .orderBy('submitted_at', 'asc')
        .select('*');
      
      return evidence.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : undefined
      }));
    } catch (error) {
      logger.error('Error getting dispute evidence:', error);
      return [];
    }
  }
  
  async getActiveDisputes(userId?: string): Promise<Dispute[]> {
    try {
      const query = db(this.tableName)
        .whereIn('status', ['open', 'investigating']);
      
      if (userId) {
        query.where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        });
      }
      
      return await query.orderBy('created_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting active disputes:', error);
      return [];
    }
  }
}

export const disputeModel = new DisputeModel();
```

### FILE: src/models/fee.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { percentOfCents } from '@tickettoken/shared/utils/money';

export interface PlatformFee {
  id: string;
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeeAmount: number;      // INTEGER CENTS
  platformFeePercentage: number;  // DECIMAL (5.00 = 5%)
  venueFeeAmount: number;         // INTEGER CENTS
  venueFeePercentage: number;     // DECIMAL (5.00 = 5%)
  sellerPayout: number;           // INTEGER CENTS
  platformFeeWallet?: string;
  platformFeeSignature?: string;
  venueFeeWallet?: string;
  venueFeeSignature?: string;
  platformFeeCollected: boolean;
  venueFeeCollected: boolean;
  createdAt: Date;
}

export interface CreateFeeInput {
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeePercentage?: number; // DECIMAL (5.00 = 5%)
  venueFeePercentage?: number;    // DECIMAL (5.00 = 5%)
}

export class FeeModel {
  private tableName = 'platform_fees';

  async create(input: CreateFeeInput): Promise<PlatformFee> {
    const id = uuidv4();

    // Calculate fees using basis points
    const platformFeePercentage = input.platformFeePercentage || 5.00;
    const venueFeePercentage = input.venueFeePercentage || 5.00;
    
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);
    
    const platformFeeAmountCents = percentOfCents(input.salePrice, platformFeeBps);
    const venueFeeAmountCents = percentOfCents(input.salePrice, venueFeeBps);
    const sellerPayoutCents = input.salePrice - platformFeeAmountCents - venueFeeAmountCents;

    const [fee] = await db(this.tableName)
      .insert({
        id,
        transfer_id: input.transferId,
        sale_price: input.salePrice,
        platform_fee_amount: platformFeeAmountCents,
        platform_fee_percentage: platformFeePercentage,
        venue_fee_amount: venueFeeAmountCents,
        venue_fee_percentage: venueFeePercentage,
        seller_payout: sellerPayoutCents,
        platform_fee_collected: false,
        venue_fee_paid: false,
      })
      .returning('*');

    return this.mapToFee(fee);
  }

  async findById(id: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ id })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async findByTransferId(transferId: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ transfer_id: transferId })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async updateFeeCollection(
    id: string,
    platformCollected?: boolean,
    venueCollected?: boolean,
    platformSignature?: string,
    venueSignature?: string
  ): Promise<PlatformFee | null> {
    const updateData: any = {};

    if (platformCollected !== undefined) {
      updateData.platform_fee_collected = platformCollected;
    }
    if (venueCollected !== undefined) {
      updateData.venue_fee_paid = venueCollected;
    }
    if (platformSignature) {
      updateData.platform_fee_signature = platformSignature;
    }
    if (venueSignature) {
      updateData.venue_fee_signature = venueSignature;
    }

    const [fee] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return fee ? this.mapToFee(fee) : null;
  }

  async getTotalPlatformFees(startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .where({ platform_fee_collected: true })
      .sum('platform_fee_amount as total');

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  async getTotalVenueFees(venueId: string, startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
      .where({
        'marketplace_transfers.venue_id': venueId,
        'platform_fees.venue_fee_paid': true
      })
      .sum('platform_fees.venue_fee_amount as total');

    if (startDate) {
      query = query.where('platform_fees.created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_fees.created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToFee(row: any): PlatformFee {
    return {
      id: row.id,
      transferId: row.transfer_id,
      salePrice: parseInt(row.sale_price),                       // INTEGER CENTS
      platformFeeAmount: parseInt(row.platform_fee_amount),      // INTEGER CENTS
      platformFeePercentage: parseFloat(row.platform_fee_percentage), // DECIMAL %
      venueFeeAmount: parseInt(row.venue_fee_amount),            // INTEGER CENTS
      venueFeePercentage: parseFloat(row.venue_fee_percentage),  // DECIMAL %
      sellerPayout: parseInt(row.seller_payout),                 // INTEGER CENTS
      platformFeeWallet: row.platform_fee_wallet,
      platformFeeSignature: row.platform_fee_signature,
      venueFeeWallet: row.venue_fee_wallet,
      venueFeeSignature: row.venue_fee_signature,
      platformFeeCollected: row.platform_fee_collected,
      venueFeeCollected: row.venue_fee_paid,
      createdAt: row.created_at,
    };
  }
}

export const feeModel = new FeeModel();
```

### FILE: src/models/price-history.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface PriceHistoryEntry {
  id: string;
  listing_id: string;
  old_price: number;        // INTEGER CENTS
  new_price: number;        // INTEGER CENTS
  price_change: number;     // INTEGER CENTS
  percentage_change: number; // DECIMAL (e.g., 5.5 = 5.5%)
  changed_by: string;
  reason?: string;
  changed_at: Date;
}

export interface PriceTrend {
  period: string;
  average_price: number;    // INTEGER CENTS
  min_price: number;        // INTEGER CENTS
  max_price: number;        // INTEGER CENTS
  total_changes: number;
  trend_direction: 'up' | 'down' | 'stable';
}

export class PriceHistoryModel {
  private readonly tableName = 'price_history';

  async recordPriceChange(
    listingId: string,
    oldPriceCents: number,
    newPriceCents: number,
    changedBy: string,
    reason?: string
  ): Promise<PriceHistoryEntry> {
    try {
      const priceChangeCents = newPriceCents - oldPriceCents;
      // Calculate percentage with precision, store as decimal
      const percentageChange = (priceChangeCents / oldPriceCents) * 100;

      const entry: PriceHistoryEntry = {
        id: uuidv4(),
        listing_id: listingId,
        old_price: oldPriceCents,
        new_price: newPriceCents,
        price_change: priceChangeCents,
        percentage_change: percentageChange,
        changed_by: changedBy,
        reason,
        changed_at: new Date()
      };

      await db(this.tableName).insert(entry);

      logger.info(`Price change recorded for listing ${listingId}: $${oldPriceCents/100} -> $${newPriceCents/100}`);
      return entry;
    } catch (error) {
      logger.error('Error recording price change:', error);
      throw error;
    }
  }

  async getPriceHistory(listingId: string): Promise<PriceHistoryEntry[]> {
    try {
      return await db(this.tableName)
        .where('listing_id', listingId)
        .orderBy('changed_at', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting price history:', error);
      return [];
    }
  }

  async getAveragePrice(
    eventId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    try {
      const query = db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId);

      if (startDate) {
        query.where('ph.changed_at', '>=', startDate);
      }
      if (endDate) {
        query.where('ph.changed_at', '<=', endDate);
      }

      const result = await query.avg('ph.new_price as average');

      // Return average as integer cents
      return Math.round(parseFloat(result[0]?.average || '0'));
    } catch (error) {
      logger.error('Error calculating average price:', error);
      return 0;
    }
  }

  async getPriceTrends(
    eventId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<PriceTrend> {
    try {
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const stats = await db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId)
        .where('ph.changed_at', '>=', startDate)
        .select(
          db.raw('AVG(ph.new_price) as average_price'),
          db.raw('MIN(ph.new_price) as min_price'),
          db.raw('MAX(ph.new_price) as max_price'),
          db.raw('COUNT(*) as total_changes'),
          db.raw('AVG(ph.percentage_change) as avg_change')
        )
        .first();

      const avgChange = parseFloat(stats?.avg_change || '0');
      const trendDirection = avgChange > 1 ? 'up' : avgChange < -1 ? 'down' : 'stable';

      return {
        period,
        average_price: Math.round(parseFloat(stats?.average_price || '0')),  // INTEGER CENTS
        min_price: Math.round(parseFloat(stats?.min_price || '0')),          // INTEGER CENTS
        max_price: Math.round(parseFloat(stats?.max_price || '0')),          // INTEGER CENTS
        total_changes: parseInt(stats?.total_changes || '0', 10),
        trend_direction: trendDirection
      };
    } catch (error) {
      logger.error('Error getting price trends:', error);
      return {
        period,
        average_price: 0,
        min_price: 0,
        max_price: 0,
        total_changes: 0,
        trend_direction: 'stable'
      };
    }
  }
}

export const priceHistoryModel = new PriceHistoryModel();
```

### FILE: src/models/blacklist.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface BlacklistEntry {
  id: string;
  user_id?: string;
  wallet_address?: string;
  reason: string;
  banned_by: string;
  banned_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export class BlacklistModel {
  private readonly tableName = 'marketplace_blacklist';
  
  async addToBlacklist(
    identifier: { user_id?: string; wallet_address?: string },
    reason: string,
    bannedBy: string,
    duration?: number // Duration in days
  ): Promise<BlacklistEntry> {
    try {
      const entry: Partial<BlacklistEntry> = {
        id: uuidv4(),
        ...identifier,
        reason,
        banned_by: bannedBy,
        banned_at: new Date(),
        is_active: true
      };
      
      if (duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);
        entry.expires_at = expiresAt;
      }
      
      await db(this.tableName).insert(entry);
      
      logger.info(`Added to blacklist: ${JSON.stringify(identifier)}`);
      return entry as BlacklistEntry;
    } catch (error) {
      logger.error('Error adding to blacklist:', error);
      throw error;
    }
  }
  
  async removeFromBlacklist(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<void> {
    try {
      const query = db(this.tableName).where('is_active', true);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      await query.update({ is_active: false });
      
      logger.info(`Removed from blacklist: ${JSON.stringify(identifier)}`);
    } catch (error) {
      logger.error('Error removing from blacklist:', error);
      throw error;
    }
  }
  
  async isBlacklisted(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<boolean> {
    try {
      const query = db(this.tableName)
        .where('is_active', true)
        .where(function() {
          if (identifier.user_id) {
            this.orWhere('user_id', identifier.user_id);
          }
          if (identifier.wallet_address) {
            this.orWhere('wallet_address', identifier.wallet_address);
          }
        });
      
      const entries = await query.select('*');
      
      // Check for expired entries and deactivate them
      const now = new Date();
      for (const entry of entries) {
        if (entry.expires_at && new Date(entry.expires_at) < now) {
          await db(this.tableName)
            .where('id', entry.id)
            .update({ is_active: false });
          continue;
        }
        return true; // Found active, non-expired entry
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking blacklist:', error);
      return false;
    }
  }
  
  async getBlacklistHistory(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<BlacklistEntry[]> {
    try {
      const query = db(this.tableName);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      return await query.orderBy('banned_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting blacklist history:', error);
      return [];
    }
  }
}

export const blacklistModel = new BlacklistModel();
```

### FILE: src/models/anti-bot.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VELOCITY_CHECK_WINDOW_SECONDS, BOT_SCORE_THRESHOLD } from '../utils/constants';

export interface AntiBotActivity {
  id: string;
  user_id: string;
  action_type: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BotScore {
  user_id: string;
  score: number;
  factors: {
    velocity_score: number;
    pattern_score: number;
    reputation_score: number;
  };
  is_bot: boolean;
  checked_at: Date;
}

export class AntiBotModel {
  private readonly tableName = 'anti_bot_activities';
  
  async recordActivity(
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await db(this.tableName).insert({
        id: uuidv4(),
        user_id: userId,
        action_type: action,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
        timestamp: new Date(),
        metadata: JSON.stringify(metadata)
      });
    } catch (error) {
      logger.error('Error recording anti-bot activity:', error);
      throw error;
    }
  }
  
  async checkVelocity(
    userId: string,
    action: string,
    windowSeconds: number = VELOCITY_CHECK_WINDOW_SECONDS
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000);
      
      const result = await db(this.tableName)
        .where('user_id', userId)
        .where('action_type', action)
        .where('timestamp', '>=', cutoff)
        .count('* as count');
      
      return parseInt(result[0].count as string, 10);
    } catch (error) {
      logger.error('Error checking velocity:', error);
      return 0;
    }
  }
  
  async calculateBotScore(userId: string): Promise<BotScore> {
    try {
      // Get recent activity patterns
      const recentActivity = await db(this.tableName)
        .where('user_id', userId)
        .where('timestamp', '>=', new Date(Date.now() - 3600000)) // Last hour
        .select('*');
      
      // Calculate velocity score (actions per minute)
      const velocityScore = Math.min(recentActivity.length / 60, 1);
      
      // Calculate pattern score (repetitive actions)
      const actionCounts = recentActivity.reduce((acc, act) => {
        acc[act.action_type] = (acc[act.action_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const maxActions = Math.max(...Object.values(actionCounts).map(v => Number(v)), 0);
      const patternScore = maxActions > 10 ? Math.min(maxActions / 20, 1) : 0;
      
      // Calculate reputation score (previous violations)
      const violations = await db('anti_bot_violations')
        .where('user_id', userId)
        .count('* as count');
      
      const reputationScore = Math.min(parseInt(violations[0]?.count as string || '0', 10) / 5, 1);
      
      // Calculate overall score
      const overallScore = (velocityScore * 0.4 + patternScore * 0.3 + reputationScore * 0.3);
      
      return {
        user_id: userId,
        score: overallScore,
        factors: {
          velocity_score: velocityScore,
          pattern_score: patternScore,
          reputation_score: reputationScore
        },
        is_bot: overallScore > BOT_SCORE_THRESHOLD,
        checked_at: new Date()
      };
    } catch (error) {
      logger.error('Error calculating bot score:', error);
      return {
        user_id: userId,
        score: 0,
        factors: {
          velocity_score: 0,
          pattern_score: 0,
          reputation_score: 0
        },
        is_bot: false,
        checked_at: new Date()
      };
    }
  }
  
  async flagSuspiciousActivity(
    userId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high'
  ): Promise<void> {
    try {
      await db('anti_bot_violations').insert({
        id: uuidv4(),
        user_id: userId,
        reason,
        severity,
        flagged_at: new Date()
      });
    } catch (error) {
      logger.error('Error flagging suspicious activity:', error);
      throw error;
    }
  }
}

export const antiBotModel = new AntiBotModel();
```

### FILE: src/models/transfer.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceTransfer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  transferSignature: string;
  blockHeight?: number;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount?: number;     // Amount in smallest unit (lamports/microUSDC)
  usdValue: number;           // INTEGER CENTS
  status: 'initiated' | 'pending' | 'completed' | 'failed' | 'disputed';
  initiatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  networkFee?: number;        // Blockchain fee in smallest unit
  networkFeeUsd?: number;     // INTEGER CENTS
  createdAt: Date;
}

export interface CreateTransferInput {
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount: number;
  usdValue: number;           // INTEGER CENTS
}

export class TransferModel {
  private tableName = 'marketplace_transfers';

  async create(input: CreateTransferInput): Promise<MarketplaceTransfer> {
    const id = uuidv4();
    const [transfer] = await db(this.tableName)
      .insert({
        id,
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        buyer_wallet: input.buyerWallet,
        seller_wallet: input.sellerWallet,
        payment_currency: input.paymentCurrency,
        payment_amount: input.paymentAmount,
        usd_value: input.usdValue,
        status: 'initiated',
        transfer_signature: '',
      })
      .returning('*');

    return this.mapToTransfer(transfer);
  }

  async findById(id: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ id })
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByListingId(listingId: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByBuyerId(
    buyerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async findBySellerId(
    sellerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async updateStatus(
    id: string,
    status: MarketplaceTransfer['status'],
    additionalData?: any
  ): Promise<MarketplaceTransfer | null> {
    const updateData: any = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date();
    } else if (status === 'failed') {
      updateData.failed_at = new Date();
      if (additionalData?.failureReason) {
        updateData.failure_reason = additionalData.failureReason;
      }
    }

    Object.assign(updateData, additionalData);

    const [transfer] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async updateBlockchainData(
    id: string,
    transferSignature: string,
    blockHeight: number,
    networkFee?: number,
    networkFeeUsd?: number
  ): Promise<MarketplaceTransfer | null> {
    const [transfer] = await db(this.tableName)
      .where({ id })
      .update({
        transfer_signature: transferSignature,
        block_height: blockHeight,
        network_fee: networkFee,
        network_fee_usd: networkFeeUsd,
      })
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async getTotalVolumeByVenueId(venueId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ venue_id: venueId, status: 'completed' })
      .sum('usd_value as total')
      .first();

    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToTransfer(row: any): MarketplaceTransfer {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      buyerWallet: row.buyer_wallet,
      sellerWallet: row.seller_wallet,
      transferSignature: row.transfer_signature,
      blockHeight: row.block_height,
      paymentCurrency: row.payment_currency,
      paymentAmount: row.payment_amount ? parseInt(row.payment_amount) : undefined,
      usdValue: parseInt(row.usd_value),  // INTEGER CENTS
      status: row.status,
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      networkFee: row.network_fee ? parseInt(row.network_fee) : undefined,
      networkFeeUsd: row.network_fee_usd ? parseInt(row.network_fee_usd) : undefined,  // INTEGER CENTS
      createdAt: row.created_at,
    };
  }
}

export const transferModel = new TransferModel();
```

### FILE: src/models/venue-settings.model.ts
```typescript
import { db } from '../config/database';

export interface VenueMarketplaceSettings {
  venueId: string;
  maxResaleMultiplier: number;      // DECIMAL (3.0 = 300%)
  minPriceMultiplier: number;       // DECIMAL (1.0 = 100%)
  allowBelowFace: boolean;
  transferCutoffHours: number;
  listingAdvanceHours: number;
  autoExpireOnEventStart: boolean;
  maxListingsPerUserPerEvent: number;
  maxListingsPerUserTotal: number;
  requireListingApproval: boolean;
  autoApproveVerifiedSellers: boolean;
  royaltyPercentage: number;        // DECIMAL (5.00 = 5%)
  royaltyWalletAddress: string;
  minimumRoyaltyPayout: number;     // INTEGER CENTS
  allowInternationalSales: boolean;
  blockedCountries: string[];
  requireKycForHighValue: boolean;
  highValueThreshold: number;       // INTEGER CENTS
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVenueSettingsInput {
  venueId: string;
  royaltyWalletAddress: string;
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
}

export interface UpdateVenueSettingsInput {
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
  royaltyWalletAddress?: string;
  allowInternationalSales?: boolean;
  blockedCountries?: string[];
  requireKycForHighValue?: boolean;
  highValueThreshold?: number;
}

export class VenueSettingsModel {
  private tableName = 'venue_marketplace_settings';

  async create(input: CreateVenueSettingsInput): Promise<VenueMarketplaceSettings> {
    const [settings] = await db(this.tableName)
      .insert({
        venue_id: input.venueId,
        royalty_wallet_address: input.royaltyWalletAddress,
        max_resale_multiplier: input.maxResaleMultiplier || 3.0,
        min_price_multiplier: input.minPriceMultiplier || 1.0,
        allow_below_face: input.allowBelowFace || false,
        transfer_cutoff_hours: input.transferCutoffHours || 4,
        listing_advance_hours: input.listingAdvanceHours || 720,
        max_listings_per_user_per_event: input.maxListingsPerUserPerEvent || 8,
        max_listings_per_user_total: input.maxListingsPerUserTotal || 50,
        require_listing_approval: input.requireListingApproval || false,
        royalty_percentage: input.royaltyPercentage || 5.00,
      })
      .returning('*');

    return this.mapToSettings(settings);
  }

  async findByVenueId(venueId: string): Promise<VenueMarketplaceSettings | null> {
    const settings = await db(this.tableName)
      .where({ venue_id: venueId })
      .first();

    return settings ? this.mapToSettings(settings) : null;
  }

  async findOrCreateDefault(venueId: string, walletAddress: string): Promise<VenueMarketplaceSettings> {
    const existing = await this.findByVenueId(venueId);
    if (existing) return existing;

    return this.create({
      venueId,
      royaltyWalletAddress: walletAddress,
    });
  }

  async update(
    venueId: string,
    input: UpdateVenueSettingsInput
  ): Promise<VenueMarketplaceSettings | null> {
    const updateData: any = {};

    if (input.maxResaleMultiplier !== undefined) {
      updateData.max_resale_multiplier = input.maxResaleMultiplier;
    }
    if (input.minPriceMultiplier !== undefined) {
      updateData.min_price_multiplier = input.minPriceMultiplier;
    }
    if (input.allowBelowFace !== undefined) {
      updateData.allow_below_face = input.allowBelowFace;
    }
    if (input.transferCutoffHours !== undefined) {
      updateData.transfer_cutoff_hours = input.transferCutoffHours;
    }
    if (input.listingAdvanceHours !== undefined) {
      updateData.listing_advance_hours = input.listingAdvanceHours;
    }
    if (input.maxListingsPerUserPerEvent !== undefined) {
      updateData.max_listings_per_user_per_event = input.maxListingsPerUserPerEvent;
    }
    if (input.maxListingsPerUserTotal !== undefined) {
      updateData.max_listings_per_user_total = input.maxListingsPerUserTotal;
    }
    if (input.requireListingApproval !== undefined) {
      updateData.require_listing_approval = input.requireListingApproval;
    }
    if (input.royaltyPercentage !== undefined) {
      updateData.royalty_percentage = input.royaltyPercentage;
    }
    if (input.royaltyWalletAddress !== undefined) {
      updateData.royalty_wallet_address = input.royaltyWalletAddress;
    }
    if (input.allowInternationalSales !== undefined) {
      updateData.allow_international_sales = input.allowInternationalSales;
    }
    if (input.blockedCountries !== undefined) {
      updateData.blocked_countries = input.blockedCountries;
    }
    if (input.requireKycForHighValue !== undefined) {
      updateData.require_kyc_for_high_value = input.requireKycForHighValue;
    }
    if (input.highValueThreshold !== undefined) {
      updateData.high_value_threshold = input.highValueThreshold;
    }

    updateData.updated_at = new Date();

    const [settings] = await db(this.tableName)
      .where({ venue_id: venueId })
      .update(updateData)
      .returning('*');

    return settings ? this.mapToSettings(settings) : null;
  }

  async getAllSettings(limit = 100, offset = 0): Promise<VenueMarketplaceSettings[]> {
    const settings = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return settings.map(this.mapToSettings);
  }

  private mapToSettings(row: any): VenueMarketplaceSettings {
    return {
      venueId: row.venue_id,
      maxResaleMultiplier: parseFloat(row.max_resale_multiplier),      // DECIMAL multiplier
      minPriceMultiplier: parseFloat(row.min_price_multiplier),        // DECIMAL multiplier
      allowBelowFace: row.allow_below_face,
      transferCutoffHours: row.transfer_cutoff_hours,
      listingAdvanceHours: row.listing_advance_hours,
      autoExpireOnEventStart: row.auto_expire_on_event_start,
      maxListingsPerUserPerEvent: row.max_listings_per_user_per_event,
      maxListingsPerUserTotal: row.max_listings_per_user_total,
      requireListingApproval: row.require_listing_approval,
      autoApproveVerifiedSellers: row.auto_approve_verified_sellers,
      royaltyPercentage: parseFloat(row.royalty_percentage),           // DECIMAL percentage
      royaltyWalletAddress: row.royalty_wallet_address,
      minimumRoyaltyPayout: parseInt(row.minimum_royalty_payout || 0), // INTEGER CENTS
      allowInternationalSales: row.allow_international_sales,
      blockedCountries: row.blocked_countries || [],
      requireKycForHighValue: row.require_kyc_for_high_value,
      highValueThreshold: parseInt(row.high_value_threshold || 0),     // INTEGER CENTS
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const venueSettingsModel = new VenueSettingsModel();
```

### FILE: src/middleware/cache.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { cache } from '../services/cache-integration';

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ttl = options.ttl || 300; // Default 5 minutes
      const cacheKey = options.key || `cache:${req.method}:${req.originalUrl}`;
      
      // Skip cache for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit: ${cacheKey}`);
        return res.json(JSON.parse(cached as string));
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data: any) {
        cache.set(cacheKey, JSON.stringify(data), { ttl })
          .catch((err: Error) => logger.error('Cache set error:', err));
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

export const clearCache = async (pattern: string): Promise<void> => {
  try {
    await cache.delete(pattern);
    logger.info(`Cache cleared for pattern: ${pattern}`);
  } catch (error) {
    logger.error('Error clearing cache:', error);
  }
};
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  venueRole?: string;
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return;
}

// Admin middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.roles?.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
  return;
}

// Venue owner middleware
export function requireVenueOwner(req: AuthRequest, res: Response, next: NextFunction) {
  const validRoles = ['admin', 'venue_owner', 'venue_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    return res.status(403).json({ error: 'Venue owner access required' });
  }
  next();
  return;
}

// Verify listing ownership
export async function verifyListingOwnership(req: AuthRequest, _res: Response, next: NextFunction) {
  const listingId = req.params.id;
  const userId = req.user?.id;
  
  // This would normally check the database
  // For now, we'll pass through but log the check
  console.log(`Verifying ownership of listing ${listingId} for user ${userId}`);
  next();
}
```

### FILE: src/middleware/wallet.middleware.ts
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { BadRequestError } from '../utils/errors';
import { validationService } from '../services/validation.service';

export interface WalletRequest extends AuthRequest {
  wallet?: {
    address: string;
    signature?: string;
  };
}

export const walletMiddleware = (req: WalletRequest, _res: Response, next: NextFunction) => {
  const walletAddress = req.headers['x-wallet-address'] as string;
  const walletSignature = req.headers['x-wallet-signature'] as string;

  if (!walletAddress) {
    return next(new BadRequestError('Wallet address required'));
  }

  if (!validationService.validateWalletAddress(walletAddress)) {
    return next(new BadRequestError('Invalid wallet address'));
  }

  // In production, verify the signature
  // For now, just attach wallet info
  req.wallet = {
    address: walletAddress,
    signature: walletSignature,
  };

  next();
};

export const requireWallet = walletMiddleware;
```

### FILE: src/middleware/validation.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { BadRequestError } from '../utils/errors';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(new BadRequestError(JSON.stringify(errors)));
    }

    req.body = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(new BadRequestError(JSON.stringify(errors)));
    }

    req.query = value;
    next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(new BadRequestError(JSON.stringify(errors)));
    }

    req.params = value;
    next();
  };
};
```

### FILE: src/services/blockchain.service.ts
```typescript
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import blockchain from '../config/blockchain';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

// Import the IDL (you'll need to copy this from your deployed-idl.json)
const IDL = require('../idl/marketplace.json');

interface TransferNFTParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  listingId: string;
  price: number;
}

interface TransferResult {
  signature: string;
  blockHeight: number;
  fee: number;
}

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;
  private log = logger.child({ component: 'RealBlockchainService' });

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  private initializeProgram() {
    try {
      // Get the marketplace program ID from your deployed contract
      const programId = new PublicKey(process.env.MARKETPLACE_PROGRAM_ID || 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv');

      // Create a dummy provider for reading
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // We'll add wallet when needed for transactions
        { commitment: 'confirmed' }
      );

      this.program = new Program(IDL as any, provider);
      this.log.info('Marketplace program initialized', { programId: programId.toString() });
    } catch (error) {
      this.log.error('Failed to initialize program', { error });
    }
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { tokenId, fromWallet, toWallet, listingId, price } = params;

      // Get the payer wallet (marketplace service wallet)
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create the necessary PDAs and accounts
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
        this.program.programId
      );

      const [marketplacePDA] = await PublicKey.findProgramAddress(
        [Buffer.from('marketplace')],
        this.program.programId
      );

      const [reentrancyGuardPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
        this.program.programId
      );

      // Build the buy_listing instruction
      const instruction = await this.program.methods
        .buyListing()
        .accounts({
          buyer: new PublicKey(toWallet),
          listing: listingPDA,
          marketplace: marketplacePDA,
          seller: new PublicKey(fromWallet),
          marketplaceTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          reentrancyGuard: reentrancyGuardPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      const blockHeight = await this.connection.getBlockHeight();
      const fee = 0.00025; // Estimated SOL transaction fee

      this.log.info('NFT transfer completed on-chain', {
        signature,
        blockHeight,
        fromWallet,
        toWallet,
        tokenId
      });

      return {
        signature,
        blockHeight,
        fee,
      };
    } catch (error) {
      this.log.error('NFT transfer failed', { error, params });
      throw new InternalServerError('Blockchain transfer failed: ' + (error as Error).message || 'Unknown error');
    }
  }

  async verifyNFTOwnership(walletAddress: string, tokenId: string): Promise<boolean> {
    try {
      if (!this.program) return false;

      // Query the on-chain listing account
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(tokenId).toBuffer()],
        this.program.programId
      );

      const listing = await (this.program.account as any).listing.fetch(listingPDA);
      return listing.seller.toString() === walletAddress;
    } catch (error) {
      this.log.error('Failed to verify NFT ownership', { error, walletAddress, tokenId });
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      this.log.error('Failed to get wallet balance', { error, walletAddress });
      throw new InternalServerError('Failed to get wallet balance');
    }
  }

  /**
   * Validate transaction signature
   */
  async validateTransaction(signature: string): Promise<boolean> {
    try {
      const result = await this.connection.getTransaction(signature);
      return result !== null && result.meta?.err === null;
    } catch (error) {
      this.log.error('Failed to validate transaction', { error, signature });
      return false;
    }
  }

  /**
   * Get the blockchain connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Calculate network fees
   */
  calculateNetworkFee(): number {
    // Solana base fee is 5000 lamports (0.000005 SOL)
    // NFT transfer might require 2-3 transactions
    return 0.00025; // SOL
  }
}

// Export singleton instance to match current usage
export const blockchainService = new RealBlockchainService();
```

### FILE: src/services/notification.service.ts
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { config } from '../config';

interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

class NotificationServiceClass {
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Notification service error: ${response.statusText}`);
      }
      
      logger.info(`Notification sent to user ${payload.user_id}: ${payload.type}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
      // Don't throw - notifications should not block main flow
    }
  }
  
  async notifyListingSold(
    listingId: string,
    buyerId: string,
    sellerId: string,
    price: number
  ): Promise<void> {
    try {
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_sold',
        title: 'Your ticket has been sold!',
        body: `Your listing has been purchased for $${price}`,
        data: { listing_id: listingId, buyer_id: buyerId },
        priority: 'high'
      });
      
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'purchase_confirmed',
        title: 'Purchase confirmed!',
        body: `You have successfully purchased a ticket for $${price}`,
        data: { listing_id: listingId, seller_id: sellerId },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending listing sold notifications:', error);
    }
  }
  
  async notifyPriceChange(
    listingId: string,
    watchers: string[],
    oldPrice: number,
    newPrice: number
  ): Promise<void> {
    try {
      const priceDirection = newPrice < oldPrice ? 'decreased' : 'increased';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      for (const watcherId of watchers) {
        await this.sendNotification({
          user_id: watcherId,
          type: 'price_change',
          title: 'Price alert!',
          body: `A ticket you're watching has ${priceDirection} by $${priceDiff}`,
          data: { 
            listing_id: listingId,
            old_price: oldPrice,
            new_price: newPrice
          },
          priority: 'normal'
        });
      }
    } catch (error) {
      logger.error('Error sending price change notifications:', error);
    }
  }
  
  async notifyDisputeUpdate(
    disputeId: string,
    parties: string[],
    status: string,
    message: string
  ): Promise<void> {
    try {
      for (const userId of parties) {
        await this.sendNotification({
          user_id: userId,
          type: 'dispute_update',
          title: 'Dispute status update',
          body: message,
          data: { 
            dispute_id: disputeId,
            status
          },
          priority: 'high'
        });
      }
    } catch (error) {
      logger.error('Error sending dispute notifications:', error);
    }
  }
  
  async notifyTransferComplete(
    transferId: string,
    buyerId: string,
    sellerId: string,
    ticketId: string
  ): Promise<void> {
    try {
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'transfer_complete',
        title: 'Ticket received!',
        body: 'Your ticket has been successfully transferred to your wallet',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
      
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'payment_received',
        title: 'Payment received!',
        body: 'The payment for your ticket sale has been processed',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending transfer notifications:', error);
    }
  }
  
  async notifyListingExpiring(
    listingId: string,
    sellerId: string,
    hoursRemaining: number
  ): Promise<void> {
    try {
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_expiring',
        title: 'Listing expiring soon',
        body: `Your ticket listing will expire in ${hoursRemaining} hours`,
        data: { 
          listing_id: listingId,
          hours_remaining: hoursRemaining
        },
        priority: 'normal'
      });
    } catch (error) {
      logger.error('Error sending expiry notification:', error);
    }
  }
}

export const NotificationService = NotificationServiceClass;
export const notificationService = new NotificationServiceClass();
```

### FILE: src/services/anti-bot.service.ts
```typescript
import { logger } from '../utils/logger';
import { antiBotModel } from '../models/anti-bot.model';
import { cache } from './cache-integration';
import { 
  MAX_PURCHASES_PER_HOUR,
  MAX_LISTINGS_PER_DAY,
  VELOCITY_CHECK_WINDOW_SECONDS,
  BOT_SCORE_THRESHOLD
} from '../utils/constants';

class AntiBotServiceClass {
  async checkPurchaseVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'purchase',
        3600 // 1 hour in seconds
      );
      
      if (count >= MAX_PURCHASES_PER_HOUR) {
        logger.warn(`User ${userId} exceeded purchase velocity limit: ${count} purchases`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded purchase velocity: ${count} purchases in 1 hour`,
          'high'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking purchase velocity:', error);
      return true; // Allow on error
    }
  }
  
  async checkListingVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'listing_created',
        86400 // 24 hours in seconds
      );
      
      if (count >= MAX_LISTINGS_PER_DAY) {
        logger.warn(`User ${userId} exceeded listing velocity limit: ${count} listings`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded listing velocity: ${count} listings in 24 hours`,
          'medium'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking listing velocity:', error);
      return true;
    }
  }
  
  async analyzeUserPattern(userId: string): Promise<any> {
    try {
      const botScore = await antiBotModel.calculateBotScore(userId);
      
      if (botScore.is_bot) {
        logger.warn(`User ${userId} flagged as potential bot. Score: ${botScore.score}`);
        
        // Cache the bot detection
        await cache.set(
          `bot_detection:${userId}`,
          JSON.stringify(botScore),
          { ttl: 3600 }
        );
      }
      
      return botScore;
    } catch (error) {
      logger.error('Error analyzing user pattern:', error);
      return null;
    }
  }
  
  async enforceRateLimit(userId: string, action: string): Promise<boolean> {
    try {
      const cacheKey = `rate_limit:${userId}:${action}`;
      const current = await cache.get(cacheKey);
      
      if (current) {
        const count = parseInt(current as string, 10);
        const limit = this.getActionLimit(action);
        
        if (count >= limit) {
          logger.warn(`Rate limit exceeded for user ${userId}, action: ${action}`);
          return false;
        }
        
        await cache.set(cacheKey, (count + 1).toString(), { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      } else {
        await cache.set(cacheKey, '1', { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      }
      
      // Record activity
      await antiBotModel.recordActivity(userId, action);
      
      return true;
    } catch (error) {
      logger.error('Error enforcing rate limit:', error);
      return true;
    }
  }
  
  private getActionLimit(action: string): number {
    const limits: Record<string, number> = {
      'api_call': 100,
      'search': 50,
      'listing_view': 200,
      'purchase_attempt': 10,
      'listing_create': 5
    };
    
    return limits[action] || 100;
  }
  
  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = await cache.get(`user_blocked:${userId}`);
      if (cached === 'true') {
        return true;
      }
      
      // Check bot score
      const botScore = await antiBotModel.calculateBotScore(userId);
      if (botScore.score > BOT_SCORE_THRESHOLD) {
        await cache.set(`user_blocked:${userId}`, 'true', { ttl: 3600 });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if user is blocked:', error);
      return false;
    }
  }
}

export const AntiBotService = AntiBotServiceClass;
export const antiBotService = new AntiBotServiceClass();
```

### FILE: src/services/fee.service.ts
```typescript
import { feeModel } from '../models/fee.model';
import { transferModel } from '../models/transfer.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared/utils/money';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { NotFoundError } from '../utils/errors';

export interface FeeCalculation {
  salePrice: number;        // INTEGER CENTS
  platformFee: number;      // INTEGER CENTS
  venueFee: number;         // INTEGER CENTS
  sellerPayout: number;     // INTEGER CENTS
  totalFees: number;        // INTEGER CENTS
}

export interface FeeReport {
  totalVolume: number;           // INTEGER CENTS
  totalPlatformFees: number;     // INTEGER CENTS
  totalVenueFees: number;        // INTEGER CENTS
  transactionCount: number;
  averageTransactionSize: number; // INTEGER CENTS
}

export class FeeService {
  private log = logger.child({ component: 'FeeService' });

  /**
   * Calculate fees for a sale (all amounts in INTEGER CENTS)
   */
  calculateFees(salePriceCents: number, venueRoyaltyPercentage?: number): FeeCalculation {
    const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
    const venueFeePercentage = venueRoyaltyPercentage || constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE;

    // Convert percentages to basis points
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);

    const platformFeeCents = percentOfCents(salePriceCents, platformFeeBps);
    const venueFeeCents = percentOfCents(salePriceCents, venueFeeBps);
    const totalFeesCents = platformFeeCents + venueFeeCents;
    const sellerPayoutCents = salePriceCents - totalFeesCents;

    return {
      salePrice: salePriceCents,
      platformFee: platformFeeCents,
      venueFee: venueFeeCents,
      sellerPayout: sellerPayoutCents,
      totalFees: totalFeesCents,
    };
  }

  /**
   * Get fee breakdown for a transfer
   */
  async getTransferFees(transferId: string) {
    const fee = await feeModel.findByTransferId(transferId);
    if (!fee) {
      throw new NotFoundError('Fee record');
    }

    return {
      transferId,
      salePrice: fee.salePrice,
      platformFee: {
        amount: fee.platformFeeAmount,
        percentage: fee.platformFeePercentage,
        collected: fee.platformFeeCollected,
        signature: fee.platformFeeSignature,
      },
      venueFee: {
        amount: fee.venueFeeAmount,
        percentage: fee.venueFeePercentage,
        collected: fee.venueFeeCollected,
        signature: fee.venueFeeSignature,
      },
      sellerPayout: fee.sellerPayout,
      createdAt: fee.createdAt,
    };
  }

  /**
   * Get platform fee report (amounts in cents)
   */
  async getPlatformFeeReport(startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalPlatformFees(startDate, endDate);

    // Estimate volume based on 5% platform fee
    const estimatedVolumeCents = Math.round(totalFeesCents * 20);

    return {
      totalVolume: estimatedVolumeCents,
      totalPlatformFees: totalFeesCents,
      totalVenueFees: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Get venue fee report (amounts in cents)
   */
  async getVenueFeeReport(venueId: string, startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId, startDate, endDate);
    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);

    return {
      totalVolume: totalVolumeCents,
      totalPlatformFees: 0,
      totalVenueFees: totalFeesCents,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Process fee distribution (called by cron job)
   */
  async processFeeDistributions() {
    this.log.info('Processing fee distributions');
  }

  /**
   * Get fee statistics for a venue (amounts in cents)
   */
  async getVenueStatistics(venueId: string) {
    const settings = await venueSettingsModel.findByVenueId(venueId);
    if (!settings) {
      throw new NotFoundError('Venue settings');
    }

    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId);

    return {
      venueId,
      royaltyPercentage: settings.royaltyPercentage,
      totalVolume: totalVolumeCents,
      totalFeesEarned: totalFeesCents,
      minimumPayout: settings.minimumRoyaltyPayout,
      payoutWallet: settings.royaltyWalletAddress,
    };
  }
}

export const feeService = new FeeService();
```

### FILE: src/services/listing.service.ts
```typescript
import { logger } from '../utils/logger';
import { withLock, LockKeys } from '@tickettoken/shared/utils/distributed-lock';
import { listingModel } from '../models/listing.model';

class ListingServiceClass {
  private log = logger.child({ component: 'ListingService' });

  async updateListingPrice(params: {
    listingId: string;
    newPrice: number;
    userId: string;
  }) {
    const { listingId, newPrice, userId } = params;
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      if (newPrice <= 0) {
        throw new Error('Price must be greater than zero');
      }

      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot update price for listing with status: ${listing.status}`);
      }

      const originalPriceCents = listing.originalFaceValue;
      const maxMarkupPercent = 300;
      const maxAllowedPriceCents = Math.floor(originalPriceCents * (1 + maxMarkupPercent / 100));

      if (newPrice > maxAllowedPriceCents) {
        throw new Error(`Price cannot exceed ${maxMarkupPercent}% markup. Maximum allowed: $${maxAllowedPriceCents / 100}`);
      }

      const updated = await listingModel.update(listingId, { price: newPrice });
      const markupPercent = Math.floor(((newPrice - originalPriceCents) / originalPriceCents) * 10000) / 100;

      this.log.info('Listing price updated with distributed lock', {
        listingId,
        oldPriceCents: listing.price,
        newPriceCents: newPrice,
        markupPercent: `${markupPercent}%`
      });

      return updated;
    });
  }

  async createListing(data: any) {
    const { ticketId, sellerId, walletAddress, eventId, venueId, originalFaceValue } = data;
    const lockKey = LockKeys.ticket(ticketId);

    return await withLock(lockKey, 5000, async () => {
      if (data.price) {
        this.log.warn('Client attempted to set listing price directly', {
          ticketId,
          attemptedPrice: data.price,
          sellerId
        });
      }

      const existingListing = await listingModel.findByTicketId(ticketId);
      
      if (existingListing && existingListing.status === 'active') {
        throw new Error('Ticket already has an active listing');
      }

      const ticketValueCents = originalFaceValue || await this.getTicketMarketValue(ticketId);

      const listing = await listingModel.create({
        ticketId,
        sellerId,
        eventId,
        venueId,
        price: ticketValueCents,
        originalFaceValue: ticketValueCents,
        walletAddress,
        requiresApproval: false
      });

      this.log.info('Listing created with distributed lock', {
        listingId: listing.id,
        ticketId,
        sellerId,
        priceCents: ticketValueCents
      });

      return listing;
    });
  }

  private async getTicketMarketValue(ticketId: string): Promise<number> {
    return 10000;
  }

  async cancelListing(listingId: string, userId: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);
      
      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot cancel listing with status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'cancelled', {
        cancelled_at: new Date()
      });

      this.log.info('Listing cancelled with distributed lock', {
        listingId,
        sellerId: userId
      });

      return updated;
    });
  }

  async getListingById(listingId: string) {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    return listing;
  }

  async searchListings(params: {
    eventId?: string;
    sellerId?: string;
    venueId?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }) {
    if (params.sellerId) {
      return await listingModel.findBySellerId(
        params.sellerId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    if (params.eventId) {
      return await listingModel.findByEventId(
        params.eventId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    return [];
  }

  async markListingAsSold(listingId: string, buyerId?: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.status !== 'active' && listing.status !== 'pending_approval') {
        throw new Error(`Cannot mark listing as sold. Current status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'sold', {
        sold_at: new Date(),
        buyer_id: buyerId || 'unknown'
      });

      if (!updated) {
        throw new Error(`Failed to mark listing as sold: ${listingId}`);
      }

      this.log.info('Listing marked as sold with distributed lock', {
        listingId,
        sellerId: listing.sellerId,
        buyerId: buyerId || 'unknown',
        priceCents: listing.price
      });

      return updated;
    });
  }
}

export const ListingService = ListingServiceClass;
export const listingService = new ListingServiceClass();
```

### FILE: src/services/search.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ListingFilters, ListingWithDetails } from '../types/listing.types';
import { PaginationParams } from '../types/common.types';
import { cache } from './cache-integration';
import { SEARCH_CACHE_TTL } from '../utils/constants';

class SearchServiceClass {
  async searchListings(
    filters: ListingFilters,
    pagination: PaginationParams
  ): Promise<{ listings: ListingWithDetails[]; total: number }> {
    try {
      // Generate cache key
      const cacheKey = `search:${JSON.stringify({ filters, pagination })}`;
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
      
      // Build query
      const query = db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .leftJoin('users as u', 'ml.seller_id', 'u.id')
        .where('ml.status', 'active');
      
      // Apply filters
      if (filters.eventId) {
        query.where('ml.event_id', filters.eventId);
      }
      
      if (filters.venueId) {
        query.where('ml.venue_id', filters.venueId);
      }
      
      if (filters.minPrice !== undefined) {
        query.where('ml.price', '>=', filters.minPrice);
      }
      
      if (filters.maxPrice !== undefined) {
        query.where('ml.price', '<=', filters.maxPrice);
      }
      
      if (filters.sellerId) {
        query.where('ml.seller_id', filters.sellerId);
      }
      
      if (filters.dateFrom) {
        query.where('e.start_date', '>=', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query.where('e.start_date', '<=', filters.dateTo);
      }
      
      // Count total
      const countQuery = query.clone();
      const totalResult = await countQuery.count('* as count');
      const total = parseInt(totalResult[0].count as string, 10);
      
      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query.limit(pagination.limit).offset(offset);
      
      // Apply sorting
      const sortBy = pagination.sortBy || 'ml.listed_at';
      const sortOrder = pagination.sortOrder || 'desc';
      query.orderBy(sortBy, sortOrder);
      
      // Select fields
      const listings = await query.select(
        'ml.*',
        'e.name as event_name',
        'e.start_date as event_date',
        'v.name as venue_name',
        'u.username as seller_username'
      );
      
      // Cache results
      await cache.set(cacheKey, JSON.stringify({ listings, total }), { ttl: SEARCH_CACHE_TTL });
      
      return { listings, total };
    } catch (error) {
      logger.error('Error searching listings:', error);
      return { listings: [], total: 0 };
    }
  }
  
  async searchByEvent(eventId: string): Promise<ListingWithDetails[]> {
    try {
      const result = await this.searchListings(
        { eventId, status: 'active' },
        { page: 1, limit: 100, sortBy: 'price', sortOrder: 'asc' }
      );
      
      return result.listings;
    } catch (error) {
      logger.error('Error searching by event:', error);
      return [];
    }
  }
  
  async getTrending(limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get trending listings based on recent views/activity
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .where('e.start_date', '>', new Date())
        .orderBy('ml.view_count', 'desc')
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting trending listings:', error);
      return [];
    }
  }
  
  async getRecommendations(userId: string, limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get user's purchase history to understand preferences
      const userHistory = await db('marketplace_transfers')
        .where('buyer_id', userId)
        .select('event_id')
        .distinct('event_id');
      
      const eventIds = userHistory.map(h => h.event_id);
      
      if (eventIds.length === 0) {
        // Return trending if no history
        return this.getTrending(limit);
      }
      
      // Find similar events
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .whereIn('ml.venue_id', function() {
          this.select('venue_id')
            .from('events')
            .whereIn('id', eventIds);
        })
        .whereNotIn('ml.event_id', eventIds)
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      return [];
    }
  }
}

export const SearchService = SearchServiceClass;
export const searchService = new SearchServiceClass();
```

### FILE: src/services/validation.service.ts
```typescript
import { listingModel } from '../models/listing.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { constants } from '../config';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  ForbiddenError, 
  NotFoundError 
} from '../utils/errors';

export interface ValidateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;
  originalFaceValue: number;
  eventStartTime: Date;
}

export interface ValidateTransferInput {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  eventStartTime: Date;
}

export interface PriceValidationResult {
  valid: boolean;
  reason?: string;
  minPrice?: number;
  maxPrice?: number;
  priceMultiplier?: number;
}

export class ValidationService {
  private log = logger.child({ component: 'ValidationService' });

  /**
   * Validate if a ticket can be listed
   */
  async validateListingCreation(input: ValidateListingInput): Promise<void> {
    // 1. Check if ticket is already listed
    const existingListing = await listingModel.findByTicketId(input.ticketId);
    if (existingListing) {
      throw new ValidationError('Ticket is already listed');
    }

    // 2. Get venue settings
    const venueSettings = await venueSettingsModel.findByVenueId(input.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 3. Validate price
    const priceValidation = this.validatePrice(
      input.price,
      input.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );

    if (!priceValidation.valid) {
      throw new ValidationError(priceValidation.reason || 'Invalid price');
    }

    // 4. Check listing timing
    this.validateListingTiming(
      input.eventStartTime,
      venueSettings.listingAdvanceHours
    );

    // 5. Check user listing limits
    await this.validateUserListingLimits(
      input.sellerId,
      input.eventId,
      venueSettings.maxListingsPerUserPerEvent,
      venueSettings.maxListingsPerUserTotal
    );

    this.log.info('Listing validation passed', {
      ticketId: input.ticketId,
      price: input.price,
      priceMultiplier: priceValidation.priceMultiplier,
    });
  }

  /**
   * Validate if a transfer can proceed
   */
  async validateTransfer(input: ValidateTransferInput): Promise<void> {
    // 1. Get venue settings
    const listing = await listingModel.findById(input.listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.status !== 'active') {
      throw new ValidationError(`Listing is ${listing.status}`);
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 2. Check transfer timing
    this.validateTransferTiming(
      input.eventStartTime,
      venueSettings.transferCutoffHours
    );

    // 3. Validate buyer is not seller
    if (input.buyerId === listing.sellerId) {
      throw new ValidationError('Cannot buy your own listing');
    }

    // 4. Check if listing has expired
    if (listing.expiresAt && new Date() > listing.expiresAt) {
      throw new ValidationError('Listing has expired');
    }

    this.log.info('Transfer validation passed', {
      listingId: input.listingId,
      buyerId: input.buyerId,
    });
  }

  /**
   * Validate listing price
   */
  validatePrice(
    price: number,
    originalFaceValue: number,
    minMultiplier: number,
    maxMultiplier: number,
    allowBelowFace: boolean
  ): PriceValidationResult {
    const priceMultiplier = price / originalFaceValue;
    const minPrice = originalFaceValue * minMultiplier;
    const maxPrice = originalFaceValue * maxMultiplier;

    // Check minimum price
    if (!allowBelowFace && price < originalFaceValue) {
      return {
        valid: false,
        reason: 'Price cannot be below face value',
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price < minPrice) {
      return {
        valid: false,
        reason: `Price must be at least ${minMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check maximum price
    if (price > maxPrice) {
      return {
        valid: false,
        reason: `Price cannot exceed ${maxMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check absolute limits
    if (price < constants.LISTING_CONSTRAINTS.MIN_PRICE) {
      return {
        valid: false,
        reason: `Price must be at least $${constants.LISTING_CONSTRAINTS.MIN_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price > constants.LISTING_CONSTRAINTS.MAX_PRICE) {
      return {
        valid: false,
        reason: `Price cannot exceed $${constants.LISTING_CONSTRAINTS.MAX_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    return {
      valid: true,
      minPrice,
      maxPrice,
      priceMultiplier,
    };
  }

  /**
   * Validate listing timing
   */
  private validateListingTiming(
    eventStartTime: Date,
    listingAdvanceHours: number
  ): void {
    const now = new Date();
    const maxListingTime = new Date(eventStartTime);
    maxListingTime.setHours(maxListingTime.getHours() - listingAdvanceHours);

    if (now < maxListingTime) {
      throw new ValidationError(
        `Cannot list tickets more than ${listingAdvanceHours} hours before event`
      );
    }

    if (now >= eventStartTime) {
      throw new ValidationError('Cannot list tickets for past events');
    }
  }

  /**
   * Validate transfer timing
   */
  private validateTransferTiming(
    eventStartTime: Date,
    transferCutoffHours: number
  ): void {
    const now = new Date();
    const cutoffTime = new Date(eventStartTime);
    cutoffTime.setHours(cutoffTime.getHours() - transferCutoffHours);

    if (now >= cutoffTime) {
      throw new ValidationError(
        `Transfers are not allowed within ${transferCutoffHours} hours of event start`
      );
    }
  }

  /**
   * Validate user listing limits
   */
  private async validateUserListingLimits(
    userId: string,
    eventId: string,
    maxPerEvent: number,
    maxTotal: number
  ): Promise<void> {
    // Check per-event limit
    const eventListings = await listingModel.countByUserId(userId, eventId);
    if (eventListings >= maxPerEvent) {
      throw new ValidationError(
        `You can only have ${maxPerEvent} active listings per event`
      );
    }

    // Check total limit
    const totalListings = await listingModel.countByUserId(userId);
    if (totalListings >= maxTotal) {
      throw new ValidationError(
        `You can only have ${maxTotal} total active listings`
      );
    }
  }

  /**
   * Validate wallet address
   */
  validateWalletAddress(address: string): boolean {
    // Basic Solana address validation
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  }

  /**
   * Check if price update is valid
   */
  async validatePriceUpdate(
    listingId: string,
    newPrice: number,
    userId: string
  ): Promise<PriceValidationResult> {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    if (listing.status !== 'active') {
      throw new ValidationError('Can only update active listings');
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    return this.validatePrice(
      newPrice,
      listing.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );
  }
}

export const validationService = new ValidationService();
```

### FILE: src/services/transfer.service.ts
```typescript
import { transferModel, CreateTransferInput } from '../models/transfer.model';
import { listingModel } from '../models/listing.model';
import { feeModel } from '../models/fee.model';
import { validationService } from './validation.service';
import { blockchainService } from './blockchain.service';
import { listingService } from './listing.service';
import { logger } from '../utils/logger';
import { constants } from '../config';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';

export interface InitiateTransferDto {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  eventStartTime: Date;
}

export interface CompleteTransferDto {
  transferId: string;
  blockchainSignature: string;
}

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  /**
   * Initiate a transfer
   */
  async initiateTransfer(dto: InitiateTransferDto) {
    // Get listing details
    const listing = await listingModel.findById(dto.listingId);
    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Validate transfer
    await validationService.validateTransfer({
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      buyerWallet: dto.buyerWallet,
      eventStartTime: dto.eventStartTime,
    });

    // Check buyer has sufficient balance
    const balance = await blockchainService.getWalletBalance(dto.buyerWallet);
    const requiredAmount = this.calculateTotalAmount(listing.price, dto.paymentCurrency);

    if (balance < requiredAmount) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Create transfer record
    const transferInput: CreateTransferInput = {
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      sellerId: listing.sellerId,
      eventId: listing.eventId,
      venueId: listing.venueId,
      buyerWallet: dto.buyerWallet,
      sellerWallet: listing.walletAddress,
      paymentCurrency: dto.paymentCurrency,
      paymentAmount: listing.price,
      usdValue: listing.price, // Assuming USD for now
    };

    const transfer = await transferModel.create(transferInput);

    // Create fee record
    await feeModel.create({
      transferId: transfer.id,
      salePrice: listing.price,
      platformFeePercentage: constants.FEES.PLATFORM_FEE_PERCENTAGE,
      venueFeePercentage: constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE,
    });

    this.log.info('Transfer initiated', {
      transferId: transfer.id,
      listingId: dto.listingId,
      buyerId: dto.buyerId,
    });

    return transfer;
  }

  /**
   * Complete a transfer after blockchain confirmation
   */
  async completeTransfer(dto: CompleteTransferDto) {
    const transfer = await transferModel.findById(dto.transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    if (transfer.status !== 'initiated' && transfer.status !== 'pending') {
      throw new ValidationError(`Cannot complete transfer with status: ${transfer.status}`);
    }

    // Validate blockchain transaction
    const isValid = await blockchainService.validateTransaction(dto.blockchainSignature);
    if (!isValid) {
      throw new ValidationError('Invalid blockchain signature');
    }

    // Get current block height
    const blockHeight = await blockchainService.getConnection().getBlockHeight();

    // Update transfer with blockchain data
    await transferModel.updateBlockchainData(
      transfer.id,
      dto.blockchainSignature,
      blockHeight,
      blockchainService.calculateNetworkFee()
    );

    // Mark transfer as completed
    await transferModel.updateStatus(transfer.id, 'completed');

    // Mark listing as sold - FIXED: Added buyerId parameter
    await listingService.markListingAsSold(transfer.listingId, transfer.buyerId);

    // Update fee collection status
    const fee = await feeModel.findByTransferId(transfer.id);
    if (fee) {
      await feeModel.updateFeeCollection(
        fee.id,
        true, // platform fee collected
        true, // venue fee collected
        dto.blockchainSignature,
        dto.blockchainSignature
      );
    }

    this.log.info('Transfer completed', {
      transferId: transfer.id,
      signature: dto.blockchainSignature,
    });

    return transfer;
  }

  /**
   * Handle failed transfer
   */
  async failTransfer(transferId: string, reason: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    await transferModel.updateStatus(transfer.id, 'failed', {
      failureReason: reason,
    });

    // Reactivate the listing
    await listingModel.updateStatus(transfer.listingId, 'active');

    this.log.error('Transfer failed', {
      transferId,
      reason,
    });
  }

  /**
   * Get transfer by ID
   */
  async getTransferById(transferId: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }
    return transfer;
  }

  /**
   * Get transfers for a user
   */
  async getUserTransfers(userId: string, type: 'buyer' | 'seller', limit = 20, offset = 0) {
    if (type === 'buyer') {
      return await transferModel.findByBuyerId(userId, limit, offset);
    } else {
      return await transferModel.findBySellerId(userId, limit, offset);
    }
  }

  /**
   * Calculate total amount including fees
   */
  private calculateTotalAmount(price: number, currency: 'USDC' | 'SOL'): number {
    const networkFee = blockchainService.calculateNetworkFee();

    if (currency === 'USDC') {
      // For USDC, add network fee in SOL equivalent
      return price + (networkFee * 50); // Assuming 1 SOL = $50
    } else {
      // For SOL, convert price to SOL and add network fee
      const priceInSol = price / 50; // Assuming 1 SOL = $50
      return priceInSol + networkFee;
    }
  }
}

export const transferService = new TransferService();
```

### FILE: src/types/listing.types.ts
```typescript
import { UUID, ListingStatus, BaseEntity } from './common.types';

export interface ListingFilters {
  eventId?: UUID;
  venueId?: UUID;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sellerId?: UUID;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface MarketplaceListing extends BaseEntity {
  ticket_id: UUID;
  seller_id: UUID;
  event_id: UUID;
  venue_id: UUID;
  price: number;
  original_face_value: number;
  status: ListingStatus;
  listed_at: Date;
  sold_at?: Date;
  expires_at?: Date;
  cancelled_at?: Date;
  buyer_id?: UUID;
  notes?: string;
}

export interface ListingWithDetails extends MarketplaceListing {
  event_name?: string;
  venue_name?: string;
  event_date?: Date;
  seller_username?: string;
  seller_rating?: number;
  tier_name?: string;
  section?: string;
  row?: string;
  seat?: string;
}

export interface PriceUpdate {
  listing_id: UUID;
  old_price: number;
  new_price: number;
  updated_by: UUID;
  reason?: string;
  timestamp: Date;
}

export interface CreateListingInput {
  ticket_id: UUID;
  price: number;
  expires_at?: Date;
  notes?: string;
}

export interface UpdateListingInput {
  price?: number;
  expires_at?: Date;
  notes?: string;
}
```

### FILE: src/types/common.types.ts
```typescript
export type UUID = string;
export type Timestamp = Date;

export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
export type TransferStatus = 'initiated' | 'pending' | 'completed' | 'failed' | 'refunded';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'cancelled';
export type PaymentCurrency = 'USDC' | 'SOL';
export type UserRole = 'buyer' | 'seller' | 'admin' | 'venue_owner';

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuthUser {
  id: UUID;
  wallet: string;
  email?: string;
  role: UserRole;
  tenant_id?: UUID;
}

export interface IdempotencyContext {
  key: string;
  request_id: string;
  processed?: boolean;
}

export interface BaseEntity {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

### FILE: src/types/transfer.types.ts
```typescript
import { UUID, TransferStatus, PaymentCurrency, BaseEntity } from './common.types';

export interface MarketplaceTransfer extends BaseEntity {
  listing_id: UUID;
  buyer_id: UUID;
  seller_id: UUID;
  ticket_id: UUID;
  amount: number;
  platform_fee: number;
  seller_proceeds: number;
  status: TransferStatus;
  payment_currency: PaymentCurrency;
  blockchain_signature?: string;
  payment_intent_id?: string;
  transferred_at?: Date;
  failed_at?: Date;
  failure_reason?: string;
}

export interface TransferRequest {
  listing_id: UUID;
  buyer_id: UUID;
  buyer_wallet: string;
  payment_currency: PaymentCurrency;
  idempotency_key?: string;
}

export interface TransferValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface BlockchainTransfer {
  signature: string;
  block_height: number;
  fee: number;
  confirmed_at?: Date;
  from_wallet: string;
  to_wallet: string;
  program_address?: string;
}

export interface TransferMetadata {
  initiated_at: Date;
  completed_at?: Date;
  attempts: number;
  last_error?: string;
  blockchain_confirmations?: number;
}
```

### FILE: src/types/wallet.types.ts
```typescript
import { UUID, Timestamp } from './common.types';

export interface WalletInfo {
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  balance?: number;
  is_valid: boolean;
  is_program_wallet?: boolean;
  owner_id?: UUID;
}

export interface WalletTransaction {
  signature: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: Timestamp;
  status: 'pending' | 'confirmed' | 'failed';
  block_height?: number;
}

export interface WalletBalance {
  wallet_address: string;
  sol_balance: number;
  usdc_balance: number;
  token_count?: number;
  last_updated: Timestamp;
}

export interface WalletVerification {
  wallet_address: string;
  message: string;
  signature: string;
  verified: boolean;
  verified_at?: Timestamp;
}
```

### FILE: src/types/venue-settings.types.ts
```typescript
import { UUID, BaseEntity } from './common.types';

export interface VenueRules {
  max_markup_percentage?: number;
  min_markup_percentage?: number;
  requires_approval: boolean;
  blacklist_enabled: boolean;
  allow_international_sales: boolean;
  min_days_before_event?: number;
  max_listings_per_user?: number;
  restricted_sections?: string[];
}

export interface VenueFees {
  percentage: number;
  flat_fee?: number;
  cap_amount?: number;
  currency: 'USD' | 'USDC' | 'SOL';
}

export interface VenueMarketplaceSettings extends BaseEntity {
  venue_id: UUID;
  is_active: boolean;
  rules: VenueRules;
  fees: VenueFees;
  payout_wallet?: string;
  auto_approve_listings: boolean;
  notification_email?: string;
}

export interface VenueRestriction {
  venue_id: UUID;
  restriction_type: 'blacklist' | 'whitelist' | 'geo_restriction';
  restricted_value: string;
  reason?: string;
  active: boolean;
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/config/rabbitmq.ts
```typescript
import { logger } from '../utils/logger';

interface RabbitMQConfig {
  url: string;
  exchanges: {
    marketplace: string;
    events: string;
  };
  queues: {
    listings: string;
    transfers: string;
    disputes: string;
    notifications: string;
  };
  routingKeys: {
    listingCreated: string;
    listingSold: string;
    transferComplete: string;
    disputeCreated: string;
  };
}

export const rabbitmqConfig: RabbitMQConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
  exchanges: {
    marketplace: 'marketplace.exchange',
    events: 'events.exchange'
  },
  queues: {
    listings: 'marketplace.listings.queue',
    transfers: 'marketplace.transfers.queue',
    disputes: 'marketplace.disputes.queue',
    notifications: 'marketplace.notifications.queue'
  },
  routingKeys: {
    listingCreated: 'listing.created',
    listingSold: 'listing.sold',
    transferComplete: 'transfer.complete',
    disputeCreated: 'dispute.created'
  }
};

// Placeholder for RabbitMQ connection
// In production, would use amqplib
class RabbitMQConnection {
  private connected: boolean = false;
  
  async connect(): Promise<void> {
    try {
      // In production: await amqp.connect(rabbitmqConfig.url)
      this.connected = true;
      logger.info('RabbitMQ connection established (simulated)');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }
  
  async publish(exchange: string, routingKey: string, message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    try {
      // In production: channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)))
      logger.debug(`Published to ${exchange}/${routingKey}:`, message);
    } catch (error) {
      logger.error('Failed to publish message:', error);
      throw error;
    }
  }
  
  async subscribe(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    try {
      // In production: channel.consume(queue, handler)
      logger.info(`Subscribed to queue: ${queue}`);
    } catch (error) {
      logger.error('Failed to subscribe to queue:', error);
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.connected) {
      // In production: await connection.close()
      this.connected = false;
      logger.info('RabbitMQ connection closed');
    }
  }
}

export const rabbitmq = new RabbitMQConnection();

export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    await rabbitmq.connect();
    logger.info('RabbitMQ initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ:', error);
    // Don't throw - allow service to run without RabbitMQ
  }
};
```

### FILE: src/config/dependencies.ts
```typescript
import { listingService } from '../services/listing.service';
import { transferService } from '../services/transfer.service';
import { walletService } from '../services/wallet.service';
import { notificationService } from '../services/notification.service';
import { searchService } from '../services/search.service';
import { antiBotService } from '../services/anti-bot.service';
import { disputeService } from '../services/dispute.service';
import { taxReportingService } from '../services/tax-reporting.service';
import { venueRulesService } from '../services/venue-rules.service';
import { validationService } from '../services/validation.service';
import { eventPublisher } from '../events/publishers';
import { eventHandlers } from '../events/handlers';
import { logger } from '../utils/logger';

export interface Dependencies {
  services: {
    listing: typeof listingService;
    transfer: typeof transferService;
    wallet: typeof walletService;
    notification: typeof notificationService;
    search: typeof searchService;
    antiBot: typeof antiBotService;
    dispute: typeof disputeService;
    taxReporting: typeof taxReportingService;
    venueRules: typeof venueRulesService;
    validation: typeof validationService;
  };
  events: {
    publisher: typeof eventPublisher;
    handlers: typeof eventHandlers;
  };
  logger: typeof logger;
}

let dependencies: Dependencies | null = null;

export const initializeDependencies = (): Dependencies => {
  if (dependencies) {
    return dependencies;
  }
  
  dependencies = {
    services: {
      listing: listingService,
      transfer: transferService,
      wallet: walletService,
      notification: notificationService,
      search: searchService,
      antiBot: antiBotService,
      dispute: disputeService,
      taxReporting: taxReportingService,
      venueRules: venueRulesService,
      validation: validationService
    },
    events: {
      publisher: eventPublisher,
      handlers: eventHandlers
    },
    logger
  };
  
  logger.info('Dependencies initialized');
  return dependencies;
};

export const getDependencies = (): Dependencies => {
  if (!dependencies) {
    throw new Error('Dependencies not initialized. Call initializeDependencies() first.');
  }
  return dependencies;
};
```

### FILE: src/config/blockchain.ts
```typescript
import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface BlockchainConfig {
  rpcUrl: string;
  network: string;
  commitment: Commitment;
  programId: string;
  walletPrivateKey?: string;
}

class BlockchainService {
  private connection: Connection;
  private programId: PublicKey;
  private wallet?: Keypair;

  constructor(config: BlockchainConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
    this.programId = new PublicKey(config.programId);
    
    if (config.walletPrivateKey) {
      try {
        // Convert base64 private key to Keypair
        const privateKeyBuffer = Buffer.from(config.walletPrivateKey, 'base64');
        this.wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyBuffer));
        logger.info('Blockchain wallet loaded', { 
          publicKey: this.wallet.publicKey.toBase58() 
        });
      } catch (error) {
        logger.error('Failed to load wallet from private key:', error);
      }
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getWallet(): Keypair | undefined {
    return this.wallet;
  }

  async getBlockHeight(): Promise<number> {
    try {
      return await this.connection.getBlockHeight();
    } catch (error) {
      logger.error('Failed to get block height:', error);
      throw error;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const blockHeight = await this.getBlockHeight();
      logger.info('Blockchain connection successful', { blockHeight });
      return true;
    } catch (error) {
      logger.error('Blockchain connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const blockchain = new BlockchainService({
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  network: process.env.SOLANA_NETWORK || 'devnet',
  commitment: 'confirmed' as Commitment,
  programId: process.env.PROGRAM_ID || '11111111111111111111111111111111',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
});

export default blockchain;
```

### FILE: src/events/event-types.ts
```typescript
export enum MarketplaceEvents {
  LISTING_CREATED = 'marketplace.listing.created',
  LISTING_UPDATED = 'marketplace.listing.updated',
  LISTING_SOLD = 'marketplace.listing.sold',
  LISTING_CANCELLED = 'marketplace.listing.cancelled',
  LISTING_EXPIRED = 'marketplace.listing.expired',
  TRANSFER_INITIATED = 'marketplace.transfer.initiated',
  TRANSFER_COMPLETED = 'marketplace.transfer.completed',
  TRANSFER_FAILED = 'marketplace.transfer.failed',
  DISPUTE_CREATED = 'marketplace.dispute.created',
  DISPUTE_RESOLVED = 'marketplace.dispute.resolved',
  PRICE_CHANGED = 'marketplace.price.changed'
}

export interface MarketplaceEvent<T = any> {
  type: MarketplaceEvents;
  timestamp: Date;
  payload: T;
  metadata?: Record<string, any>;
}
```

### FILE: src/tests/factories/user.factory.ts
```typescript
import jwt from 'jsonwebtoken';
import { testData } from './test-data';

export interface TestUser {
  id: string;
  email: string;
  wallet: string;
  role: 'user' | 'admin' | 'venue_owner';
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: testData.uuid(),
  email: testData.email(),
  wallet: testData.alphanumeric(44),
  role: 'user',
  ...overrides
});

export const createAuthToken = (user: TestUser): string => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      wallet: user.wallet,
      role: user.role 
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};
```

### FILE: src/tests/factories/listing.factory.ts
```typescript
import { testData } from './test-data';

export interface TestListing {
  id?: string;
  ticket_id: string;
  seller_id: string;
  event_id: string;
  venue_id: string;
  price: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  original_face_value: number;
}

export const createTestListing = (overrides: Partial<TestListing> = {}): TestListing => ({
  id: testData.uuid(),
  ticket_id: testData.uuid(),
  seller_id: testData.uuid(),
  event_id: testData.uuid(),
  venue_id: testData.uuid(),
  price: testData.price(10, 500),
  original_face_value: testData.price(10, 200),
  status: 'active',
  ...overrides
});
```

### FILE: src/utils/validators.ts
```typescript
import Joi from 'joi';
import { 
  MIN_LISTING_PRICE, 
  MAX_LISTING_PRICE,
  MAX_PRICE_MARKUP_PERCENTAGE 
} from './constants';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: any;
}

// Price validation
export const validatePrice = (price: number, faceValue?: number): ValidationResult => {
  if (price < MIN_LISTING_PRICE) {
    return { isValid: false, error: `Price must be at least $${MIN_LISTING_PRICE}` };
  }
  
  if (price > MAX_LISTING_PRICE) {
    return { isValid: false, error: `Price cannot exceed $${MAX_LISTING_PRICE}` };
  }
  
  if (faceValue) {
    const maxAllowedPrice = faceValue * (1 + MAX_PRICE_MARKUP_PERCENTAGE / 100);
    if (price > maxAllowedPrice) {
      return { 
        isValid: false, 
        error: `Price cannot exceed ${MAX_PRICE_MARKUP_PERCENTAGE}% markup from face value` 
      };
    }
  }
  
  return { isValid: true };
};

// UUID validation
export const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Listing creation schema
export const listingCreationSchema = Joi.object({
  ticket_id: Joi.string().uuid().required(),
  price: Joi.number().min(MIN_LISTING_PRICE).max(MAX_LISTING_PRICE).required(),
  expires_at: Joi.date().optional(),
  notes: Joi.string().max(500).optional()
});

// Transfer request schema
export const transferRequestSchema = Joi.object({
  listing_id: Joi.string().uuid().required(),
  buyer_wallet: Joi.string().required(),
  payment_method: Joi.string().valid('USDC', 'SOL').required()
});

// Pagination schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Validate listing creation
export const validateListingCreation = (data: any): ValidationResult => {
  const { error, value } = listingCreationSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};

// Validate transfer request
export const validateTransferRequest = (data: any): ValidationResult => {
  const { error, value } = transferRequestSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};
```

### FILE: src/utils/solana-helper.ts
```typescript
import { logger } from './logger';

// Mock Solana connection configuration
export interface SolanaConfig {
  endpoint: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

// Get Solana configuration
export const getSolanaConfig = (): SolanaConfig => {
  return {
    endpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
    commitment: 'confirmed'
  };
};

// Confirm transaction on chain
export const confirmTransaction = async (signature: string, maxRetries: number = 3): Promise<boolean> => {
  logger.info(`Confirming transaction ${signature}`);
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // In production, this would use @solana/web3.js to check transaction status
      // For now, simulate confirmation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate 90% success rate
      if (Math.random() > 0.1) {
        logger.info(`Transaction ${signature} confirmed`);
        return true;
      }
      
      retries++;
    } catch (error) {
      logger.error(`Error confirming transaction ${signature}:`, error);
      retries++;
    }
  }
  
  return false;
};

// Get current block height
export const getBlockHeight = async (): Promise<number> => {
  try {
    // In production, would fetch from Solana RPC
    // For now, return mock block height
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    logger.error('Error getting block height:', error);
    return 0;
  }
};

// Calculate transaction fee
export const estimateTransactionFee = async (programId?: string): Promise<number> => {
  try {
    // Base fee in lamports (0.000005 SOL)
    const baseFee = 5000;
    
    // Additional fee for program execution
    const programFee = programId ? 5000 : 0;
    
    return baseFee + programFee;
  } catch (error) {
    logger.error('Error estimating transaction fee:', error);
    return 10000; // Default to 0.00001 SOL
  }
};

// Parse transaction error
export const parseTransactionError = (error: any): string => {
  if (!error) return 'Unknown transaction error';
  
  // Common Solana errors
  if (error.message?.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  }
  
  if (error.message?.includes('account not found')) {
    return 'Account not found on chain';
  }
  
  if (error.message?.includes('signature verification failed')) {
    return 'Invalid transaction signature';
  }
  
  return error.message || 'Transaction failed';
};
```

### FILE: src/models/listing.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceListing {
  id: string;
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  priceMultiplier?: number;   // DECIMAL (e.g., 1.5 = 150%)
  status: 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
  listedAt: Date;
  soldAt?: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  listingSignature?: string;
  walletAddress: string;
  programAddress?: string;
  requiresApproval: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  walletAddress: string;
  expiresAt?: Date;
  requiresApproval?: boolean;
}

export interface UpdateListingInput {
  price?: number;  // INTEGER CENTS
  expiresAt?: Date;
}

export class ListingModel {
  private tableName = 'marketplace_listings';

  async create(input: CreateListingInput): Promise<MarketplaceListing> {
    const id = uuidv4();
    const [listing] = await db(this.tableName)
      .insert({
        id,
        ticket_id: input.ticketId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        price: input.price,
        original_face_value: input.originalFaceValue,
        wallet_address: input.walletAddress,
        expires_at: input.expiresAt,
        requires_approval: input.requiresApproval || false,
        status: input.requiresApproval ? 'pending_approval' : 'active',
      })
      .returning('*');

    return this.mapToListing(listing);
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ id })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByTicketId(ticketId: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ ticket_id: ticketId, status: 'active' })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByEventId(
    eventId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async findBySellerId(
    sellerId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('listed_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async update(
    id: string,
    input: UpdateListingInput
  ): Promise<MarketplaceListing | null> {
    const updateData: any = {};

    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.expiresAt !== undefined) {
      updateData.expires_at = input.expiresAt;
    }

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async updateStatus(
    id: string,
    status: MarketplaceListing['status'],
    additionalData?: any
  ): Promise<MarketplaceListing | null> {
    const updateData: any = { status };

    if (status === 'sold' && !additionalData?.sold_at) {
      updateData.sold_at = new Date();
    }
    if (status === 'cancelled' && !additionalData?.cancelled_at) {
      updateData.cancelled_at = new Date();
    }

    Object.assign(updateData, additionalData);

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db(this.tableName)
      .where({ id })
      .increment('view_count', 1);
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async countByUserId(userId: string, eventId?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ seller_id: userId, status: 'active' })
      .count('* as count');

    if (eventId) {
      query = query.where({ event_id: eventId });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async expireListings(eventId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ event_id: eventId, status: 'active' })
      .update({ status: 'expired' });

    return result;
  }

  private mapToListing(row: any): MarketplaceListing {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      price: parseInt(row.price),  // Ensure integer cents
      originalFaceValue: parseInt(row.original_face_value),  // Ensure integer cents
      priceMultiplier: row.price_multiplier ? parseFloat(row.price_multiplier) : undefined,  // Keep as decimal
      status: row.status,
      listedAt: row.listed_at,
      soldAt: row.sold_at,
      expiresAt: row.expires_at,
      cancelledAt: row.cancelled_at,
      listingSignature: row.listing_signature,
      walletAddress: row.wallet_address,
      programAddress: row.program_address,
      requiresApproval: row.requires_approval,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      approvalNotes: row.approval_notes,
      viewCount: row.view_count,
      favoriteCount: row.favorite_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const listingModel = new ListingModel();
```

### FILE: src/models/tax-reporting.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface TaxReport {
  id: string;
  seller_id: string;
  year: number;
  total_sales: number;
  total_transactions: number;
  total_fees_paid: number;
  net_proceeds: number;
  generated_at: Date;
  report_data?: Record<string, any>;
}

export interface TaxableTransaction {
  id: string;
  seller_id: string;
  transfer_id: string;
  sale_amount: number;
  platform_fee: number;
  net_amount: number;
  transaction_date: Date;
  buyer_wallet: string;
  ticket_id: string;
  reported: boolean;
}

export class TaxReportingModel {
  private readonly reportsTable = 'tax_reports';
  private readonly transactionsTable = 'taxable_transactions';
  
  async recordSale(
    sellerId: string,
    transferId: string,
    saleAmount: number,
    platformFee: number,
    buyerWallet: string,
    ticketId: string
  ): Promise<void> {
    try {
      const transaction: TaxableTransaction = {
        id: uuidv4(),
        seller_id: sellerId,
        transfer_id: transferId,
        sale_amount: saleAmount,
        platform_fee: platformFee,
        net_amount: saleAmount - platformFee,
        transaction_date: new Date(),
        buyer_wallet: buyerWallet,
        ticket_id: ticketId,
        reported: false
      };
      
      await db(this.transactionsTable).insert(transaction);
      
      logger.info(`Taxable transaction recorded for seller ${sellerId}`);
    } catch (error) {
      logger.error('Error recording taxable transaction:', error);
      throw error;
    }
  }
  
  async getYearlyReport(sellerId: string, year: number): Promise<TaxReport | null> {
    try {
      // Check if report already exists
      const existingReport = await db(this.reportsTable)
        .where('seller_id', sellerId)
        .where('year', year)
        .first();
      
      if (existingReport) {
        return {
          ...existingReport,
          report_data: existingReport.report_data ? 
            JSON.parse(existingReport.report_data) : undefined
        };
      }
      
      // Generate new report
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      const transactions = await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .select('*');
      
      if (transactions.length === 0) {
        return null;
      }
      
      const totalSales = transactions.reduce((sum, t) => sum + t.sale_amount, 0);
      const totalFees = transactions.reduce((sum, t) => sum + t.platform_fee, 0);
      const netProceeds = transactions.reduce((sum, t) => sum + t.net_amount, 0);
      
      const report: TaxReport = {
        id: uuidv4(),
        seller_id: sellerId,
        year,
        total_sales: totalSales,
        total_transactions: transactions.length,
        total_fees_paid: totalFees,
        net_proceeds: netProceeds,
        generated_at: new Date(),
        report_data: {
          transactions_by_month: this.groupTransactionsByMonth(transactions),
          largest_sale: Math.max(...transactions.map(t => t.sale_amount)),
          average_sale: totalSales / transactions.length
        }
      };
      
      await db(this.reportsTable).insert({
        ...report,
        report_data: JSON.stringify(report.report_data)
      });
      
      // Mark transactions as reported
      await db(this.transactionsTable)
        .whereIn('id', transactions.map(t => t.id))
        .update({ reported: true });
      
      return report;
    } catch (error) {
      logger.error('Error generating yearly report:', error);
      return null;
    }
  }
  
  async generate1099K(sellerId: string, year: number): Promise<any> {
    try {
      const report = await this.getYearlyReport(sellerId, year);
      
      if (!report) {
        return null;
      }
      
      // Check if meets IRS threshold ($600)
      const irsThreshold = 600;
      if (report.net_proceeds < irsThreshold) {
        return {
          required: false,
          reason: `Net proceeds ($${report.net_proceeds}) below IRS threshold ($${irsThreshold})`
        };
      }
      
      // Generate 1099-K data structure
      return {
        required: true,
        form_type: '1099-K',
        tax_year: year,
        payer: {
          name: 'TicketToken Platform',
          tin: process.env.PLATFORM_TIN || 'XX-XXXXXXX'
        },
        payee: {
          id: sellerId,
          // Additional payee info would be fetched from user service
        },
        gross_amount: report.total_sales,
        transactions_count: report.total_transactions,
        fees_deducted: report.total_fees_paid,
        net_proceeds: report.net_proceeds,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return null;
    }
  }
  
  private groupTransactionsByMonth(transactions: TaxableTransaction[]): Record<string, any> {
    const grouped: Record<string, any> = {};
    
    transactions.forEach(t => {
      const month = new Date(t.transaction_date).toISOString().slice(0, 7);
      if (!grouped[month]) {
        grouped[month] = {
          count: 0,
          total: 0,
          fees: 0,
          net: 0
        };
      }
      grouped[month].count++;
      grouped[month].total += t.sale_amount;
      grouped[month].fees += t.platform_fee;
      grouped[month].net += t.net_amount;
    });
    
    return grouped;
  }
  
  async getReportableTransactions(
    sellerId: string,
    year: number
  ): Promise<TaxableTransaction[]> {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      return await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .orderBy('transaction_date', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting reportable transactions:', error);
      return [];
    }
  }
}

export const taxReportingModel = new TaxReportingModel();
```

### FILE: src/models/dispute.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { DisputeStatus } from '../types/common.types';

export interface Dispute {
  id: string;
  transfer_id: string;
  listing_id: string;
  initiator_id: string;
  respondent_id: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  resolution?: string;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  evidence_type: 'text' | 'image' | 'document' | 'blockchain_tx';
  content: string;
  metadata?: Record<string, any>;
  submitted_at: Date;
}

export class DisputeModel {
  private readonly tableName = 'marketplace_disputes';
  private readonly evidenceTable = 'dispute_evidence';
  
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    respondentId: string,
    reason: string,
    description?: string
  ): Promise<Dispute> {
    try {
      const dispute: Partial<Dispute> = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db(this.tableName).insert(dispute);
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute as Dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(
    disputeId: string,
    submittedBy: string,
    evidenceType: 'text' | 'image' | 'document' | 'blockchain_tx',
    content: string,
    metadata?: Record<string, any>
  ): Promise<DisputeEvidence> {
    try {
      const evidence: Partial<DisputeEvidence> = {
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: submittedBy,
        evidence_type: evidenceType,
        content,
        metadata,
        submitted_at: new Date()
      };
      
      await db(this.evidenceTable).insert({
        ...evidence,
        metadata: evidence.metadata ? JSON.stringify(evidence.metadata) : null
      });
      
      logger.info(`Evidence added to dispute ${disputeId}`);
      return evidence as DisputeEvidence;
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    resolution?: string,
    resolvedBy?: string
  ): Promise<void> {
    try {
      const updates: Partial<Dispute> = {
        status,
        updated_at: new Date()
      };
      
      if (status === 'resolved' || status === 'cancelled') {
        updates.resolution = resolution;
        updates.resolved_by = resolvedBy;
        updates.resolved_at = new Date();
      }
      
      await db(this.tableName)
        .where('id', disputeId)
        .update(updates);
      
      logger.info(`Dispute ${disputeId} updated to status: ${status}`);
    } catch (error) {
      logger.error('Error updating dispute status:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      const dispute = await db(this.tableName)
        .where('id', disputeId)
        .first();
      
      return dispute || null;
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
    try {
      const evidence = await db(this.evidenceTable)
        .where('dispute_id', disputeId)
        .orderBy('submitted_at', 'asc')
        .select('*');
      
      return evidence.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : undefined
      }));
    } catch (error) {
      logger.error('Error getting dispute evidence:', error);
      return [];
    }
  }
  
  async getActiveDisputes(userId?: string): Promise<Dispute[]> {
    try {
      const query = db(this.tableName)
        .whereIn('status', ['open', 'investigating']);
      
      if (userId) {
        query.where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        });
      }
      
      return await query.orderBy('created_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting active disputes:', error);
      return [];
    }
  }
}

export const disputeModel = new DisputeModel();
```

### FILE: src/models/fee.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { percentOfCents } from '@tickettoken/shared/utils/money';

export interface PlatformFee {
  id: string;
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeeAmount: number;      // INTEGER CENTS
  platformFeePercentage: number;  // DECIMAL (5.00 = 5%)
  venueFeeAmount: number;         // INTEGER CENTS
  venueFeePercentage: number;     // DECIMAL (5.00 = 5%)
  sellerPayout: number;           // INTEGER CENTS
  platformFeeWallet?: string;
  platformFeeSignature?: string;
  venueFeeWallet?: string;
  venueFeeSignature?: string;
  platformFeeCollected: boolean;
  venueFeeCollected: boolean;
  createdAt: Date;
}

export interface CreateFeeInput {
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeePercentage?: number; // DECIMAL (5.00 = 5%)
  venueFeePercentage?: number;    // DECIMAL (5.00 = 5%)
}

export class FeeModel {
  private tableName = 'platform_fees';

  async create(input: CreateFeeInput): Promise<PlatformFee> {
    const id = uuidv4();

    // Calculate fees using basis points
    const platformFeePercentage = input.platformFeePercentage || 5.00;
    const venueFeePercentage = input.venueFeePercentage || 5.00;
    
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);
    
    const platformFeeAmountCents = percentOfCents(input.salePrice, platformFeeBps);
    const venueFeeAmountCents = percentOfCents(input.salePrice, venueFeeBps);
    const sellerPayoutCents = input.salePrice - platformFeeAmountCents - venueFeeAmountCents;

    const [fee] = await db(this.tableName)
      .insert({
        id,
        transfer_id: input.transferId,
        sale_price: input.salePrice,
        platform_fee_amount: platformFeeAmountCents,
        platform_fee_percentage: platformFeePercentage,
        venue_fee_amount: venueFeeAmountCents,
        venue_fee_percentage: venueFeePercentage,
        seller_payout: sellerPayoutCents,
        platform_fee_collected: false,
        venue_fee_paid: false,
      })
      .returning('*');

    return this.mapToFee(fee);
  }

  async findById(id: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ id })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async findByTransferId(transferId: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ transfer_id: transferId })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async updateFeeCollection(
    id: string,
    platformCollected?: boolean,
    venueCollected?: boolean,
    platformSignature?: string,
    venueSignature?: string
  ): Promise<PlatformFee | null> {
    const updateData: any = {};

    if (platformCollected !== undefined) {
      updateData.platform_fee_collected = platformCollected;
    }
    if (venueCollected !== undefined) {
      updateData.venue_fee_paid = venueCollected;
    }
    if (platformSignature) {
      updateData.platform_fee_signature = platformSignature;
    }
    if (venueSignature) {
      updateData.venue_fee_signature = venueSignature;
    }

    const [fee] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return fee ? this.mapToFee(fee) : null;
  }

  async getTotalPlatformFees(startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .where({ platform_fee_collected: true })
      .sum('platform_fee_amount as total');

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  async getTotalVenueFees(venueId: string, startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
      .where({
        'marketplace_transfers.venue_id': venueId,
        'platform_fees.venue_fee_paid': true
      })
      .sum('platform_fees.venue_fee_amount as total');

    if (startDate) {
      query = query.where('platform_fees.created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_fees.created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToFee(row: any): PlatformFee {
    return {
      id: row.id,
      transferId: row.transfer_id,
      salePrice: parseInt(row.sale_price),                       // INTEGER CENTS
      platformFeeAmount: parseInt(row.platform_fee_amount),      // INTEGER CENTS
      platformFeePercentage: parseFloat(row.platform_fee_percentage), // DECIMAL %
      venueFeeAmount: parseInt(row.venue_fee_amount),            // INTEGER CENTS
      venueFeePercentage: parseFloat(row.venue_fee_percentage),  // DECIMAL %
      sellerPayout: parseInt(row.seller_payout),                 // INTEGER CENTS
      platformFeeWallet: row.platform_fee_wallet,
      platformFeeSignature: row.platform_fee_signature,
      venueFeeWallet: row.venue_fee_wallet,
      venueFeeSignature: row.venue_fee_signature,
      platformFeeCollected: row.platform_fee_collected,
      venueFeeCollected: row.venue_fee_paid,
      createdAt: row.created_at,
    };
  }
}

export const feeModel = new FeeModel();
```

### FILE: src/models/price-history.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface PriceHistoryEntry {
  id: string;
  listing_id: string;
  old_price: number;        // INTEGER CENTS
  new_price: number;        // INTEGER CENTS
  price_change: number;     // INTEGER CENTS
  percentage_change: number; // DECIMAL (e.g., 5.5 = 5.5%)
  changed_by: string;
  reason?: string;
  changed_at: Date;
}

export interface PriceTrend {
  period: string;
  average_price: number;    // INTEGER CENTS
  min_price: number;        // INTEGER CENTS
  max_price: number;        // INTEGER CENTS
  total_changes: number;
  trend_direction: 'up' | 'down' | 'stable';
}

export class PriceHistoryModel {
  private readonly tableName = 'price_history';

  async recordPriceChange(
    listingId: string,
    oldPriceCents: number,
    newPriceCents: number,
    changedBy: string,
    reason?: string
  ): Promise<PriceHistoryEntry> {
    try {
      const priceChangeCents = newPriceCents - oldPriceCents;
      // Calculate percentage with precision, store as decimal
      const percentageChange = (priceChangeCents / oldPriceCents) * 100;

      const entry: PriceHistoryEntry = {
        id: uuidv4(),
        listing_id: listingId,
        old_price: oldPriceCents,
        new_price: newPriceCents,
        price_change: priceChangeCents,
        percentage_change: percentageChange,
        changed_by: changedBy,
        reason,
        changed_at: new Date()
      };

      await db(this.tableName).insert(entry);

      logger.info(`Price change recorded for listing ${listingId}: $${oldPriceCents/100} -> $${newPriceCents/100}`);
      return entry;
    } catch (error) {
      logger.error('Error recording price change:', error);
      throw error;
    }
  }

  async getPriceHistory(listingId: string): Promise<PriceHistoryEntry[]> {
    try {
      return await db(this.tableName)
        .where('listing_id', listingId)
        .orderBy('changed_at', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting price history:', error);
      return [];
    }
  }

  async getAveragePrice(
    eventId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    try {
      const query = db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId);

      if (startDate) {
        query.where('ph.changed_at', '>=', startDate);
      }
      if (endDate) {
        query.where('ph.changed_at', '<=', endDate);
      }

      const result = await query.avg('ph.new_price as average');

      // Return average as integer cents
      return Math.round(parseFloat(result[0]?.average || '0'));
    } catch (error) {
      logger.error('Error calculating average price:', error);
      return 0;
    }
  }

  async getPriceTrends(
    eventId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<PriceTrend> {
    try {
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const stats = await db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId)
        .where('ph.changed_at', '>=', startDate)
        .select(
          db.raw('AVG(ph.new_price) as average_price'),
          db.raw('MIN(ph.new_price) as min_price'),
          db.raw('MAX(ph.new_price) as max_price'),
          db.raw('COUNT(*) as total_changes'),
          db.raw('AVG(ph.percentage_change) as avg_change')
        )
        .first();

      const avgChange = parseFloat(stats?.avg_change || '0');
      const trendDirection = avgChange > 1 ? 'up' : avgChange < -1 ? 'down' : 'stable';

      return {
        period,
        average_price: Math.round(parseFloat(stats?.average_price || '0')),  // INTEGER CENTS
        min_price: Math.round(parseFloat(stats?.min_price || '0')),          // INTEGER CENTS
        max_price: Math.round(parseFloat(stats?.max_price || '0')),          // INTEGER CENTS
        total_changes: parseInt(stats?.total_changes || '0', 10),
        trend_direction: trendDirection
      };
    } catch (error) {
      logger.error('Error getting price trends:', error);
      return {
        period,
        average_price: 0,
        min_price: 0,
        max_price: 0,
        total_changes: 0,
        trend_direction: 'stable'
      };
    }
  }
}

export const priceHistoryModel = new PriceHistoryModel();
```

### FILE: src/models/blacklist.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface BlacklistEntry {
  id: string;
  user_id?: string;
  wallet_address?: string;
  reason: string;
  banned_by: string;
  banned_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export class BlacklistModel {
  private readonly tableName = 'marketplace_blacklist';
  
  async addToBlacklist(
    identifier: { user_id?: string; wallet_address?: string },
    reason: string,
    bannedBy: string,
    duration?: number // Duration in days
  ): Promise<BlacklistEntry> {
    try {
      const entry: Partial<BlacklistEntry> = {
        id: uuidv4(),
        ...identifier,
        reason,
        banned_by: bannedBy,
        banned_at: new Date(),
        is_active: true
      };
      
      if (duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);
        entry.expires_at = expiresAt;
      }
      
      await db(this.tableName).insert(entry);
      
      logger.info(`Added to blacklist: ${JSON.stringify(identifier)}`);
      return entry as BlacklistEntry;
    } catch (error) {
      logger.error('Error adding to blacklist:', error);
      throw error;
    }
  }
  
  async removeFromBlacklist(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<void> {
    try {
      const query = db(this.tableName).where('is_active', true);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      await query.update({ is_active: false });
      
      logger.info(`Removed from blacklist: ${JSON.stringify(identifier)}`);
    } catch (error) {
      logger.error('Error removing from blacklist:', error);
      throw error;
    }
  }
  
  async isBlacklisted(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<boolean> {
    try {
      const query = db(this.tableName)
        .where('is_active', true)
        .where(function() {
          if (identifier.user_id) {
            this.orWhere('user_id', identifier.user_id);
          }
          if (identifier.wallet_address) {
            this.orWhere('wallet_address', identifier.wallet_address);
          }
        });
      
      const entries = await query.select('*');
      
      // Check for expired entries and deactivate them
      const now = new Date();
      for (const entry of entries) {
        if (entry.expires_at && new Date(entry.expires_at) < now) {
          await db(this.tableName)
            .where('id', entry.id)
            .update({ is_active: false });
          continue;
        }
        return true; // Found active, non-expired entry
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking blacklist:', error);
      return false;
    }
  }
  
  async getBlacklistHistory(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<BlacklistEntry[]> {
    try {
      const query = db(this.tableName);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      return await query.orderBy('banned_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting blacklist history:', error);
      return [];
    }
  }
}

export const blacklistModel = new BlacklistModel();
```

### FILE: src/models/anti-bot.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VELOCITY_CHECK_WINDOW_SECONDS, BOT_SCORE_THRESHOLD } from '../utils/constants';

export interface AntiBotActivity {
  id: string;
  user_id: string;
  action_type: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BotScore {
  user_id: string;
  score: number;
  factors: {
    velocity_score: number;
    pattern_score: number;
    reputation_score: number;
  };
  is_bot: boolean;
  checked_at: Date;
}

export class AntiBotModel {
  private readonly tableName = 'anti_bot_activities';
  
  async recordActivity(
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await db(this.tableName).insert({
        id: uuidv4(),
        user_id: userId,
        action_type: action,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
        timestamp: new Date(),
        metadata: JSON.stringify(metadata)
      });
    } catch (error) {
      logger.error('Error recording anti-bot activity:', error);
      throw error;
    }
  }
  
  async checkVelocity(
    userId: string,
    action: string,
    windowSeconds: number = VELOCITY_CHECK_WINDOW_SECONDS
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000);
      
      const result = await db(this.tableName)
        .where('user_id', userId)
        .where('action_type', action)
        .where('timestamp', '>=', cutoff)
        .count('* as count');
      
      return parseInt(result[0].count as string, 10);
    } catch (error) {
      logger.error('Error checking velocity:', error);
      return 0;
    }
  }
  
  async calculateBotScore(userId: string): Promise<BotScore> {
    try {
      // Get recent activity patterns
      const recentActivity = await db(this.tableName)
        .where('user_id', userId)
        .where('timestamp', '>=', new Date(Date.now() - 3600000)) // Last hour
        .select('*');
      
      // Calculate velocity score (actions per minute)
      const velocityScore = Math.min(recentActivity.length / 60, 1);
      
      // Calculate pattern score (repetitive actions)
      const actionCounts = recentActivity.reduce((acc, act) => {
        acc[act.action_type] = (acc[act.action_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const maxActions = Math.max(...Object.values(actionCounts).map(v => Number(v)), 0);
      const patternScore = maxActions > 10 ? Math.min(maxActions / 20, 1) : 0;
      
      // Calculate reputation score (previous violations)
      const violations = await db('anti_bot_violations')
        .where('user_id', userId)
        .count('* as count');
      
      const reputationScore = Math.min(parseInt(violations[0]?.count as string || '0', 10) / 5, 1);
      
      // Calculate overall score
      const overallScore = (velocityScore * 0.4 + patternScore * 0.3 + reputationScore * 0.3);
      
      return {
        user_id: userId,
        score: overallScore,
        factors: {
          velocity_score: velocityScore,
          pattern_score: patternScore,
          reputation_score: reputationScore
        },
        is_bot: overallScore > BOT_SCORE_THRESHOLD,
        checked_at: new Date()
      };
    } catch (error) {
      logger.error('Error calculating bot score:', error);
      return {
        user_id: userId,
        score: 0,
        factors: {
          velocity_score: 0,
          pattern_score: 0,
          reputation_score: 0
        },
        is_bot: false,
        checked_at: new Date()
      };
    }
  }
  
  async flagSuspiciousActivity(
    userId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high'
  ): Promise<void> {
    try {
      await db('anti_bot_violations').insert({
        id: uuidv4(),
        user_id: userId,
        reason,
        severity,
        flagged_at: new Date()
      });
    } catch (error) {
      logger.error('Error flagging suspicious activity:', error);
      throw error;
    }
  }
}

export const antiBotModel = new AntiBotModel();
```

### FILE: src/models/transfer.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceTransfer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  transferSignature: string;
  blockHeight?: number;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount?: number;     // Amount in smallest unit (lamports/microUSDC)
  usdValue: number;           // INTEGER CENTS
  status: 'initiated' | 'pending' | 'completed' | 'failed' | 'disputed';
  initiatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  networkFee?: number;        // Blockchain fee in smallest unit
  networkFeeUsd?: number;     // INTEGER CENTS
  createdAt: Date;
}

export interface CreateTransferInput {
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount: number;
  usdValue: number;           // INTEGER CENTS
}

export class TransferModel {
  private tableName = 'marketplace_transfers';

  async create(input: CreateTransferInput): Promise<MarketplaceTransfer> {
    const id = uuidv4();
    const [transfer] = await db(this.tableName)
      .insert({
        id,
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        buyer_wallet: input.buyerWallet,
        seller_wallet: input.sellerWallet,
        payment_currency: input.paymentCurrency,
        payment_amount: input.paymentAmount,
        usd_value: input.usdValue,
        status: 'initiated',
        transfer_signature: '',
      })
      .returning('*');

    return this.mapToTransfer(transfer);
  }

  async findById(id: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ id })
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByListingId(listingId: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByBuyerId(
    buyerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async findBySellerId(
    sellerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async updateStatus(
    id: string,
    status: MarketplaceTransfer['status'],
    additionalData?: any
  ): Promise<MarketplaceTransfer | null> {
    const updateData: any = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date();
    } else if (status === 'failed') {
      updateData.failed_at = new Date();
      if (additionalData?.failureReason) {
        updateData.failure_reason = additionalData.failureReason;
      }
    }

    Object.assign(updateData, additionalData);

    const [transfer] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async updateBlockchainData(
    id: string,
    transferSignature: string,
    blockHeight: number,
    networkFee?: number,
    networkFeeUsd?: number
  ): Promise<MarketplaceTransfer | null> {
    const [transfer] = await db(this.tableName)
      .where({ id })
      .update({
        transfer_signature: transferSignature,
        block_height: blockHeight,
        network_fee: networkFee,
        network_fee_usd: networkFeeUsd,
      })
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async getTotalVolumeByVenueId(venueId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ venue_id: venueId, status: 'completed' })
      .sum('usd_value as total')
      .first();

    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToTransfer(row: any): MarketplaceTransfer {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      buyerWallet: row.buyer_wallet,
      sellerWallet: row.seller_wallet,
      transferSignature: row.transfer_signature,
      blockHeight: row.block_height,
      paymentCurrency: row.payment_currency,
      paymentAmount: row.payment_amount ? parseInt(row.payment_amount) : undefined,
      usdValue: parseInt(row.usd_value),  // INTEGER CENTS
      status: row.status,
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      networkFee: row.network_fee ? parseInt(row.network_fee) : undefined,
      networkFeeUsd: row.network_fee_usd ? parseInt(row.network_fee_usd) : undefined,  // INTEGER CENTS
      createdAt: row.created_at,
    };
  }
}

export const transferModel = new TransferModel();
```

### FILE: src/models/venue-settings.model.ts
```typescript
import { db } from '../config/database';

export interface VenueMarketplaceSettings {
  venueId: string;
  maxResaleMultiplier: number;      // DECIMAL (3.0 = 300%)
  minPriceMultiplier: number;       // DECIMAL (1.0 = 100%)
  allowBelowFace: boolean;
  transferCutoffHours: number;
  listingAdvanceHours: number;
  autoExpireOnEventStart: boolean;
  maxListingsPerUserPerEvent: number;
  maxListingsPerUserTotal: number;
  requireListingApproval: boolean;
  autoApproveVerifiedSellers: boolean;
  royaltyPercentage: number;        // DECIMAL (5.00 = 5%)
  royaltyWalletAddress: string;
  minimumRoyaltyPayout: number;     // INTEGER CENTS
  allowInternationalSales: boolean;
  blockedCountries: string[];
  requireKycForHighValue: boolean;
  highValueThreshold: number;       // INTEGER CENTS
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVenueSettingsInput {
  venueId: string;
  royaltyWalletAddress: string;
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
}

export interface UpdateVenueSettingsInput {
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
  royaltyWalletAddress?: string;
  allowInternationalSales?: boolean;
  blockedCountries?: string[];
  requireKycForHighValue?: boolean;
  highValueThreshold?: number;
}

export class VenueSettingsModel {
  private tableName = 'venue_marketplace_settings';

  async create(input: CreateVenueSettingsInput): Promise<VenueMarketplaceSettings> {
    const [settings] = await db(this.tableName)
      .insert({
        venue_id: input.venueId,
        royalty_wallet_address: input.royaltyWalletAddress,
        max_resale_multiplier: input.maxResaleMultiplier || 3.0,
        min_price_multiplier: input.minPriceMultiplier || 1.0,
        allow_below_face: input.allowBelowFace || false,
        transfer_cutoff_hours: input.transferCutoffHours || 4,
        listing_advance_hours: input.listingAdvanceHours || 720,
        max_listings_per_user_per_event: input.maxListingsPerUserPerEvent || 8,
        max_listings_per_user_total: input.maxListingsPerUserTotal || 50,
        require_listing_approval: input.requireListingApproval || false,
        royalty_percentage: input.royaltyPercentage || 5.00,
      })
      .returning('*');

    return this.mapToSettings(settings);
  }

  async findByVenueId(venueId: string): Promise<VenueMarketplaceSettings | null> {
    const settings = await db(this.tableName)
      .where({ venue_id: venueId })
      .first();

    return settings ? this.mapToSettings(settings) : null;
  }

  async findOrCreateDefault(venueId: string, walletAddress: string): Promise<VenueMarketplaceSettings> {
    const existing = await this.findByVenueId(venueId);
    if (existing) return existing;

    return this.create({
      venueId,
      royaltyWalletAddress: walletAddress,
    });
  }

  async update(
    venueId: string,
    input: UpdateVenueSettingsInput
  ): Promise<VenueMarketplaceSettings | null> {
    const updateData: any = {};

    if (input.maxResaleMultiplier !== undefined) {
      updateData.max_resale_multiplier = input.maxResaleMultiplier;
    }
    if (input.minPriceMultiplier !== undefined) {
      updateData.min_price_multiplier = input.minPriceMultiplier;
    }
    if (input.allowBelowFace !== undefined) {
      updateData.allow_below_face = input.allowBelowFace;
    }
    if (input.transferCutoffHours !== undefined) {
      updateData.transfer_cutoff_hours = input.transferCutoffHours;
    }
    if (input.listingAdvanceHours !== undefined) {
      updateData.listing_advance_hours = input.listingAdvanceHours;
    }
    if (input.maxListingsPerUserPerEvent !== undefined) {
      updateData.max_listings_per_user_per_event = input.maxListingsPerUserPerEvent;
    }
    if (input.maxListingsPerUserTotal !== undefined) {
      updateData.max_listings_per_user_total = input.maxListingsPerUserTotal;
    }
    if (input.requireListingApproval !== undefined) {
      updateData.require_listing_approval = input.requireListingApproval;
    }
    if (input.royaltyPercentage !== undefined) {
      updateData.royalty_percentage = input.royaltyPercentage;
    }
    if (input.royaltyWalletAddress !== undefined) {
      updateData.royalty_wallet_address = input.royaltyWalletAddress;
    }
    if (input.allowInternationalSales !== undefined) {
      updateData.allow_international_sales = input.allowInternationalSales;
    }
    if (input.blockedCountries !== undefined) {
      updateData.blocked_countries = input.blockedCountries;
    }
    if (input.requireKycForHighValue !== undefined) {
      updateData.require_kyc_for_high_value = input.requireKycForHighValue;
    }
    if (input.highValueThreshold !== undefined) {
      updateData.high_value_threshold = input.highValueThreshold;
    }

    updateData.updated_at = new Date();

    const [settings] = await db(this.tableName)
      .where({ venue_id: venueId })
      .update(updateData)
      .returning('*');

    return settings ? this.mapToSettings(settings) : null;
  }

  async getAllSettings(limit = 100, offset = 0): Promise<VenueMarketplaceSettings[]> {
    const settings = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return settings.map(this.mapToSettings);
  }

  private mapToSettings(row: any): VenueMarketplaceSettings {
    return {
      venueId: row.venue_id,
      maxResaleMultiplier: parseFloat(row.max_resale_multiplier),      // DECIMAL multiplier
      minPriceMultiplier: parseFloat(row.min_price_multiplier),        // DECIMAL multiplier
      allowBelowFace: row.allow_below_face,
      transferCutoffHours: row.transfer_cutoff_hours,
      listingAdvanceHours: row.listing_advance_hours,
      autoExpireOnEventStart: row.auto_expire_on_event_start,
      maxListingsPerUserPerEvent: row.max_listings_per_user_per_event,
      maxListingsPerUserTotal: row.max_listings_per_user_total,
      requireListingApproval: row.require_listing_approval,
      autoApproveVerifiedSellers: row.auto_approve_verified_sellers,
      royaltyPercentage: parseFloat(row.royalty_percentage),           // DECIMAL percentage
      royaltyWalletAddress: row.royalty_wallet_address,
      minimumRoyaltyPayout: parseInt(row.minimum_royalty_payout || 0), // INTEGER CENTS
      allowInternationalSales: row.allow_international_sales,
      blockedCountries: row.blocked_countries || [],
      requireKycForHighValue: row.require_kyc_for_high_value,
      highValueThreshold: parseInt(row.high_value_threshold || 0),     // INTEGER CENTS
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const venueSettingsModel = new VenueSettingsModel();
```

### FILE: src/middleware/cache.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { cache } from '../services/cache-integration';

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ttl = options.ttl || 300; // Default 5 minutes
      const cacheKey = options.key || `cache:${req.method}:${req.originalUrl}`;
      
      // Skip cache for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit: ${cacheKey}`);
        return res.json(JSON.parse(cached as string));
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data: any) {
        cache.set(cacheKey, JSON.stringify(data), { ttl })
          .catch((err: Error) => logger.error('Cache set error:', err));
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

export const clearCache = async (pattern: string): Promise<void> => {
  try {
    await cache.delete(pattern);
    logger.info(`Cache cleared for pattern: ${pattern}`);
  } catch (error) {
    logger.error('Error clearing cache:', error);
  }
};
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  venueRole?: string;
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return;
}

// Admin middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.roles?.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
  return;
}

// Venue owner middleware
export function requireVenueOwner(req: AuthRequest, res: Response, next: NextFunction) {
  const validRoles = ['admin', 'venue_owner', 'venue_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    return res.status(403).json({ error: 'Venue owner access required' });
  }
  next();
  return;
}

// Verify listing ownership
export async function verifyListingOwnership(req: AuthRequest, _res: Response, next: NextFunction) {
  const listingId = req.params.id;
  const userId = req.user?.id;
  
  // This would normally check the database
  // For now, we'll pass through but log the check
  console.log(`Verifying ownership of listing ${listingId} for user ${userId}`);
  next();
}
```

### FILE: src/middleware/wallet.middleware.ts
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { BadRequestError } from '../utils/errors';
import { validationService } from '../services/validation.service';

export interface WalletRequest extends AuthRequest {
  wallet?: {
    address: string;
    signature?: string;
  };
}

export const walletMiddleware = (req: WalletRequest, _res: Response, next: NextFunction) => {
  const walletAddress = req.headers['x-wallet-address'] as string;
  const walletSignature = req.headers['x-wallet-signature'] as string;

  if (!walletAddress) {
    return next(new BadRequestError('Wallet address required'));
  }

  if (!validationService.validateWalletAddress(walletAddress)) {
    return next(new BadRequestError('Invalid wallet address'));
  }

  // In production, verify the signature
  // For now, just attach wallet info
  req.wallet = {
    address: walletAddress,
    signature: walletSignature,
  };

  next();
};

export const requireWallet = walletMiddleware;
```

### FILE: src/services/blockchain.service.ts
```typescript
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import blockchain from '../config/blockchain';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

// Import the IDL (you'll need to copy this from your deployed-idl.json)
const IDL = require('../idl/marketplace.json');

interface TransferNFTParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  listingId: string;
  price: number;
}

interface TransferResult {
  signature: string;
  blockHeight: number;
  fee: number;
}

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;
  private log = logger.child({ component: 'RealBlockchainService' });

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  private initializeProgram() {
    try {
      // Get the marketplace program ID from your deployed contract
      const programId = new PublicKey(process.env.MARKETPLACE_PROGRAM_ID || 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv');

      // Create a dummy provider for reading
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // We'll add wallet when needed for transactions
        { commitment: 'confirmed' }
      );

      this.program = new Program(IDL as any, provider);
      this.log.info('Marketplace program initialized', { programId: programId.toString() });
    } catch (error) {
      this.log.error('Failed to initialize program', { error });
    }
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { tokenId, fromWallet, toWallet, listingId, price } = params;

      // Get the payer wallet (marketplace service wallet)
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create the necessary PDAs and accounts
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
        this.program.programId
      );

      const [marketplacePDA] = await PublicKey.findProgramAddress(
        [Buffer.from('marketplace')],
        this.program.programId
      );

      const [reentrancyGuardPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
        this.program.programId
      );

      // Build the buy_listing instruction
      const instruction = await this.program.methods
        .buyListing()
        .accounts({
          buyer: new PublicKey(toWallet),
          listing: listingPDA,
          marketplace: marketplacePDA,
          seller: new PublicKey(fromWallet),
          marketplaceTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          reentrancyGuard: reentrancyGuardPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      const blockHeight = await this.connection.getBlockHeight();
      const fee = 0.00025; // Estimated SOL transaction fee

      this.log.info('NFT transfer completed on-chain', {
        signature,
        blockHeight,
        fromWallet,
        toWallet,
        tokenId
      });

      return {
        signature,
        blockHeight,
        fee,
      };
    } catch (error) {
      this.log.error('NFT transfer failed', { error, params });
      throw new InternalServerError('Blockchain transfer failed: ' + (error as Error).message || 'Unknown error');
    }
  }

  async verifyNFTOwnership(walletAddress: string, tokenId: string): Promise<boolean> {
    try {
      if (!this.program) return false;

      // Query the on-chain listing account
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(tokenId).toBuffer()],
        this.program.programId
      );

      const listing = await (this.program.account as any).listing.fetch(listingPDA);
      return listing.seller.toString() === walletAddress;
    } catch (error) {
      this.log.error('Failed to verify NFT ownership', { error, walletAddress, tokenId });
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      this.log.error('Failed to get wallet balance', { error, walletAddress });
      throw new InternalServerError('Failed to get wallet balance');
    }
  }

  /**
   * Validate transaction signature
   */
  async validateTransaction(signature: string): Promise<boolean> {
    try {
      const result = await this.connection.getTransaction(signature);
      return result !== null && result.meta?.err === null;
    } catch (error) {
      this.log.error('Failed to validate transaction', { error, signature });
      return false;
    }
  }

  /**
   * Get the blockchain connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Calculate network fees
   */
  calculateNetworkFee(): number {
    // Solana base fee is 5000 lamports (0.000005 SOL)
    // NFT transfer might require 2-3 transactions
    return 0.00025; // SOL
  }
}

// Export singleton instance to match current usage
export const blockchainService = new RealBlockchainService();
```

### FILE: src/services/notification.service.ts
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { config } from '../config';

interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

class NotificationServiceClass {
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Notification service error: ${response.statusText}`);
      }
      
      logger.info(`Notification sent to user ${payload.user_id}: ${payload.type}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
      // Don't throw - notifications should not block main flow
    }
  }
  
  async notifyListingSold(
    listingId: string,
    buyerId: string,
    sellerId: string,
    price: number
  ): Promise<void> {
    try {
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_sold',
        title: 'Your ticket has been sold!',
        body: `Your listing has been purchased for $${price}`,
        data: { listing_id: listingId, buyer_id: buyerId },
        priority: 'high'
      });
      
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'purchase_confirmed',
        title: 'Purchase confirmed!',
        body: `You have successfully purchased a ticket for $${price}`,
        data: { listing_id: listingId, seller_id: sellerId },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending listing sold notifications:', error);
    }
  }
  
  async notifyPriceChange(
    listingId: string,
    watchers: string[],
    oldPrice: number,
    newPrice: number
  ): Promise<void> {
    try {
      const priceDirection = newPrice < oldPrice ? 'decreased' : 'increased';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      for (const watcherId of watchers) {
        await this.sendNotification({
          user_id: watcherId,
          type: 'price_change',
          title: 'Price alert!',
          body: `A ticket you're watching has ${priceDirection} by $${priceDiff}`,
          data: { 
            listing_id: listingId,
            old_price: oldPrice,
            new_price: newPrice
          },
          priority: 'normal'
        });
      }
    } catch (error) {
      logger.error('Error sending price change notifications:', error);
    }
  }
  
  async notifyDisputeUpdate(
    disputeId: string,
    parties: string[],
    status: string,
    message: string
  ): Promise<void> {
    try {
      for (const userId of parties) {
        await this.sendNotification({
          user_id: userId,
          type: 'dispute_update',
          title: 'Dispute status update',
          body: message,
          data: { 
            dispute_id: disputeId,
            status
          },
          priority: 'high'
        });
      }
    } catch (error) {
      logger.error('Error sending dispute notifications:', error);
    }
  }
  
  async notifyTransferComplete(
    transferId: string,
    buyerId: string,
    sellerId: string,
    ticketId: string
  ): Promise<void> {
    try {
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'transfer_complete',
        title: 'Ticket received!',
        body: 'Your ticket has been successfully transferred to your wallet',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
      
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'payment_received',
        title: 'Payment received!',
        body: 'The payment for your ticket sale has been processed',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending transfer notifications:', error);
    }
  }
  
  async notifyListingExpiring(
    listingId: string,
    sellerId: string,
    hoursRemaining: number
  ): Promise<void> {
    try {
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_expiring',
        title: 'Listing expiring soon',
        body: `Your ticket listing will expire in ${hoursRemaining} hours`,
        data: { 
          listing_id: listingId,
          hours_remaining: hoursRemaining
        },
        priority: 'normal'
      });
    } catch (error) {
      logger.error('Error sending expiry notification:', error);
    }
  }
}

export const NotificationService = NotificationServiceClass;
export const notificationService = new NotificationServiceClass();
```

### FILE: src/services/fee.service.ts
```typescript
import { feeModel } from '../models/fee.model';
import { transferModel } from '../models/transfer.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared/utils/money';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { NotFoundError } from '../utils/errors';

export interface FeeCalculation {
  salePrice: number;        // INTEGER CENTS
  platformFee: number;      // INTEGER CENTS
  venueFee: number;         // INTEGER CENTS
  sellerPayout: number;     // INTEGER CENTS
  totalFees: number;        // INTEGER CENTS
}

export interface FeeReport {
  totalVolume: number;           // INTEGER CENTS
  totalPlatformFees: number;     // INTEGER CENTS
  totalVenueFees: number;        // INTEGER CENTS
  transactionCount: number;
  averageTransactionSize: number; // INTEGER CENTS
}

export class FeeService {
  private log = logger.child({ component: 'FeeService' });

  /**
   * Calculate fees for a sale (all amounts in INTEGER CENTS)
   */
  calculateFees(salePriceCents: number, venueRoyaltyPercentage?: number): FeeCalculation {
    const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
    const venueFeePercentage = venueRoyaltyPercentage || constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE;

    // Convert percentages to basis points
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);

    const platformFeeCents = percentOfCents(salePriceCents, platformFeeBps);
    const venueFeeCents = percentOfCents(salePriceCents, venueFeeBps);
    const totalFeesCents = platformFeeCents + venueFeeCents;
    const sellerPayoutCents = salePriceCents - totalFeesCents;

    return {
      salePrice: salePriceCents,
      platformFee: platformFeeCents,
      venueFee: venueFeeCents,
      sellerPayout: sellerPayoutCents,
      totalFees: totalFeesCents,
    };
  }

  /**
   * Get fee breakdown for a transfer
   */
  async getTransferFees(transferId: string) {
    const fee = await feeModel.findByTransferId(transferId);
    if (!fee) {
      throw new NotFoundError('Fee record');
    }

    return {
      transferId,
      salePrice: fee.salePrice,
      platformFee: {
        amount: fee.platformFeeAmount,
        percentage: fee.platformFeePercentage,
        collected: fee.platformFeeCollected,
        signature: fee.platformFeeSignature,
      },
      venueFee: {
        amount: fee.venueFeeAmount,
        percentage: fee.venueFeePercentage,
        collected: fee.venueFeeCollected,
        signature: fee.venueFeeSignature,
      },
      sellerPayout: fee.sellerPayout,
      createdAt: fee.createdAt,
    };
  }

  /**
   * Get platform fee report (amounts in cents)
   */
  async getPlatformFeeReport(startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalPlatformFees(startDate, endDate);

    // Estimate volume based on 5% platform fee
    const estimatedVolumeCents = Math.round(totalFeesCents * 20);

    return {
      totalVolume: estimatedVolumeCents,
      totalPlatformFees: totalFeesCents,
      totalVenueFees: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Get venue fee report (amounts in cents)
   */
  async getVenueFeeReport(venueId: string, startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId, startDate, endDate);
    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);

    return {
      totalVolume: totalVolumeCents,
      totalPlatformFees: 0,
      totalVenueFees: totalFeesCents,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Process fee distribution (called by cron job)
   */
  async processFeeDistributions() {
    this.log.info('Processing fee distributions');
  }

  /**
   * Get fee statistics for a venue (amounts in cents)
   */
  async getVenueStatistics(venueId: string) {
    const settings = await venueSettingsModel.findByVenueId(venueId);
    if (!settings) {
      throw new NotFoundError('Venue settings');
    }

    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId);

    return {
      venueId,
      royaltyPercentage: settings.royaltyPercentage,
      totalVolume: totalVolumeCents,
      totalFeesEarned: totalFeesCents,
      minimumPayout: settings.minimumRoyaltyPayout,
      payoutWallet: settings.royaltyWalletAddress,
    };
  }
}

export const feeService = new FeeService();
```

### FILE: src/services/validation.service.ts
```typescript
import { listingModel } from '../models/listing.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { constants } from '../config';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  ForbiddenError, 
  NotFoundError 
} from '../utils/errors';

export interface ValidateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;
  originalFaceValue: number;
  eventStartTime: Date;
}

export interface ValidateTransferInput {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  eventStartTime: Date;
}

export interface PriceValidationResult {
  valid: boolean;
  reason?: string;
  minPrice?: number;
  maxPrice?: number;
  priceMultiplier?: number;
}

export class ValidationService {
  private log = logger.child({ component: 'ValidationService' });

  /**
   * Validate if a ticket can be listed
   */
  async validateListingCreation(input: ValidateListingInput): Promise<void> {
    // 1. Check if ticket is already listed
    const existingListing = await listingModel.findByTicketId(input.ticketId);
    if (existingListing) {
      throw new ValidationError('Ticket is already listed');
    }

    // 2. Get venue settings
    const venueSettings = await venueSettingsModel.findByVenueId(input.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 3. Validate price
    const priceValidation = this.validatePrice(
      input.price,
      input.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );

    if (!priceValidation.valid) {
      throw new ValidationError(priceValidation.reason || 'Invalid price');
    }

    // 4. Check listing timing
    this.validateListingTiming(
      input.eventStartTime,
      venueSettings.listingAdvanceHours
    );

    // 5. Check user listing limits
    await this.validateUserListingLimits(
      input.sellerId,
      input.eventId,
      venueSettings.maxListingsPerUserPerEvent,
      venueSettings.maxListingsPerUserTotal
    );

    this.log.info('Listing validation passed', {
      ticketId: input.ticketId,
      price: input.price,
      priceMultiplier: priceValidation.priceMultiplier,
    });
  }

  /**
   * Validate if a transfer can proceed
   */
  async validateTransfer(input: ValidateTransferInput): Promise<void> {
    // 1. Get venue settings
    const listing = await listingModel.findById(input.listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.status !== 'active') {
      throw new ValidationError(`Listing is ${listing.status}`);
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 2. Check transfer timing
    this.validateTransferTiming(
      input.eventStartTime,
      venueSettings.transferCutoffHours
    );

    // 3. Validate buyer is not seller
    if (input.buyerId === listing.sellerId) {
      throw new ValidationError('Cannot buy your own listing');
    }

    // 4. Check if listing has expired
    if (listing.expiresAt && new Date() > listing.expiresAt) {
      throw new ValidationError('Listing has expired');
    }

    this.log.info('Transfer validation passed', {
      listingId: input.listingId,
      buyerId: input.buyerId,
    });
  }

  /**
   * Validate listing price
   */
  validatePrice(
    price: number,
    originalFaceValue: number,
    minMultiplier: number,
    maxMultiplier: number,
    allowBelowFace: boolean
  ): PriceValidationResult {
    const priceMultiplier = price / originalFaceValue;
    const minPrice = originalFaceValue * minMultiplier;
    const maxPrice = originalFaceValue * maxMultiplier;

    // Check minimum price
    if (!allowBelowFace && price < originalFaceValue) {
      return {
        valid: false,
        reason: 'Price cannot be below face value',
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price < minPrice) {
      return {
        valid: false,
        reason: `Price must be at least ${minMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check maximum price
    if (price > maxPrice) {
      return {
        valid: false,
        reason: `Price cannot exceed ${maxMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check absolute limits
    if (price < constants.LISTING_CONSTRAINTS.MIN_PRICE) {
      return {
        valid: false,
        reason: `Price must be at least $${constants.LISTING_CONSTRAINTS.MIN_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price > constants.LISTING_CONSTRAINTS.MAX_PRICE) {
      return {
        valid: false,
        reason: `Price cannot exceed $${constants.LISTING_CONSTRAINTS.MAX_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    return {
      valid: true,
      minPrice,
      maxPrice,
      priceMultiplier,
    };
  }

  /**
   * Validate listing timing
   */
  private validateListingTiming(
    eventStartTime: Date,
    listingAdvanceHours: number
  ): void {
    const now = new Date();
    const maxListingTime = new Date(eventStartTime);
    maxListingTime.setHours(maxListingTime.getHours() - listingAdvanceHours);

    if (now < maxListingTime) {
      throw new ValidationError(
        `Cannot list tickets more than ${listingAdvanceHours} hours before event`
      );
    }

    if (now >= eventStartTime) {
      throw new ValidationError('Cannot list tickets for past events');
    }
  }

  /**
   * Validate transfer timing
   */
  private validateTransferTiming(
    eventStartTime: Date,
    transferCutoffHours: number
  ): void {
    const now = new Date();
    const cutoffTime = new Date(eventStartTime);
    cutoffTime.setHours(cutoffTime.getHours() - transferCutoffHours);

    if (now >= cutoffTime) {
      throw new ValidationError(
        `Transfers are not allowed within ${transferCutoffHours} hours of event start`
      );
    }
  }

  /**
   * Validate user listing limits
   */
  private async validateUserListingLimits(
    userId: string,
    eventId: string,
    maxPerEvent: number,
    maxTotal: number
  ): Promise<void> {
    // Check per-event limit
    const eventListings = await listingModel.countByUserId(userId, eventId);
    if (eventListings >= maxPerEvent) {
      throw new ValidationError(
        `You can only have ${maxPerEvent} active listings per event`
      );
    }

    // Check total limit
    const totalListings = await listingModel.countByUserId(userId);
    if (totalListings >= maxTotal) {
      throw new ValidationError(
        `You can only have ${maxTotal} total active listings`
      );
    }
  }

  /**
   * Validate wallet address
   */
  validateWalletAddress(address: string): boolean {
    // Basic Solana address validation
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  }

  /**
   * Check if price update is valid
   */
  async validatePriceUpdate(
    listingId: string,
    newPrice: number,
    userId: string
  ): Promise<PriceValidationResult> {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    if (listing.status !== 'active') {
      throw new ValidationError('Can only update active listings');
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    return this.validatePrice(
      newPrice,
      listing.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );
  }
}

export const validationService = new ValidationService();
```

### FILE: src/services/transfer.service.ts
```typescript
import { transferModel, CreateTransferInput } from '../models/transfer.model';
import { listingModel } from '../models/listing.model';
import { feeModel } from '../models/fee.model';
import { validationService } from './validation.service';
import { blockchainService } from './blockchain.service';
import { listingService } from './listing.service';
import { logger } from '../utils/logger';
import { constants } from '../config';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';

export interface InitiateTransferDto {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  eventStartTime: Date;
}

export interface CompleteTransferDto {
  transferId: string;
  blockchainSignature: string;
}

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  /**
   * Initiate a transfer
   */
  async initiateTransfer(dto: InitiateTransferDto) {
    // Get listing details
    const listing = await listingModel.findById(dto.listingId);
    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Validate transfer
    await validationService.validateTransfer({
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      buyerWallet: dto.buyerWallet,
      eventStartTime: dto.eventStartTime,
    });

    // Check buyer has sufficient balance
    const balance = await blockchainService.getWalletBalance(dto.buyerWallet);
    const requiredAmount = this.calculateTotalAmount(listing.price, dto.paymentCurrency);

    if (balance < requiredAmount) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Create transfer record
    const transferInput: CreateTransferInput = {
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      sellerId: listing.sellerId,
      eventId: listing.eventId,
      venueId: listing.venueId,
      buyerWallet: dto.buyerWallet,
      sellerWallet: listing.walletAddress,
      paymentCurrency: dto.paymentCurrency,
      paymentAmount: listing.price,
      usdValue: listing.price, // Assuming USD for now
    };

    const transfer = await transferModel.create(transferInput);

    // Create fee record
    await feeModel.create({
      transferId: transfer.id,
      salePrice: listing.price,
      platformFeePercentage: constants.FEES.PLATFORM_FEE_PERCENTAGE,
      venueFeePercentage: constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE,
    });

    this.log.info('Transfer initiated', {
      transferId: transfer.id,
      listingId: dto.listingId,
      buyerId: dto.buyerId,
    });

    return transfer;
  }

  /**
   * Complete a transfer after blockchain confirmation
   */
  async completeTransfer(dto: CompleteTransferDto) {
    const transfer = await transferModel.findById(dto.transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    if (transfer.status !== 'initiated' && transfer.status !== 'pending') {
      throw new ValidationError(`Cannot complete transfer with status: ${transfer.status}`);
    }

    // Validate blockchain transaction
    const isValid = await blockchainService.validateTransaction(dto.blockchainSignature);
    if (!isValid) {
      throw new ValidationError('Invalid blockchain signature');
    }

    // Get current block height
    const blockHeight = await blockchainService.getConnection().getBlockHeight();

    // Update transfer with blockchain data
    await transferModel.updateBlockchainData(
      transfer.id,
      dto.blockchainSignature,
      blockHeight,
      blockchainService.calculateNetworkFee()
    );

    // Mark transfer as completed
    await transferModel.updateStatus(transfer.id, 'completed');

    // Mark listing as sold - FIXED: Added buyerId parameter
    await listingService.markListingAsSold(transfer.listingId, transfer.buyerId);

    // Update fee collection status
    const fee = await feeModel.findByTransferId(transfer.id);
    if (fee) {
      await feeModel.updateFeeCollection(
        fee.id,
        true, // platform fee collected
        true, // venue fee collected
        dto.blockchainSignature,
        dto.blockchainSignature
      );
    }

    this.log.info('Transfer completed', {
      transferId: transfer.id,
      signature: dto.blockchainSignature,
    });

    return transfer;
  }

  /**
   * Handle failed transfer
   */
  async failTransfer(transferId: string, reason: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    await transferModel.updateStatus(transfer.id, 'failed', {
      failureReason: reason,
    });

    // Reactivate the listing
    await listingModel.updateStatus(transfer.listingId, 'active');

    this.log.error('Transfer failed', {
      transferId,
      reason,
    });
  }

  /**
   * Get transfer by ID
   */
  async getTransferById(transferId: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }
    return transfer;
  }

  /**
   * Get transfers for a user
   */
  async getUserTransfers(userId: string, type: 'buyer' | 'seller', limit = 20, offset = 0) {
    if (type === 'buyer') {
      return await transferModel.findByBuyerId(userId, limit, offset);
    } else {
      return await transferModel.findBySellerId(userId, limit, offset);
    }
  }

  /**
   * Calculate total amount including fees
   */
  private calculateTotalAmount(price: number, currency: 'USDC' | 'SOL'): number {
    const networkFee = blockchainService.calculateNetworkFee();

    if (currency === 'USDC') {
      // For USDC, add network fee in SOL equivalent
      return price + (networkFee * 50); // Assuming 1 SOL = $50
    } else {
      // For SOL, convert price to SOL and add network fee
      const priceInSol = price / 50; // Assuming 1 SOL = $50
      return priceInSol + networkFee;
    }
  }
}

export const transferService = new TransferService();
```

### FILE: src/types/listing.types.ts
```typescript
import { UUID, ListingStatus, BaseEntity } from './common.types';

export interface ListingFilters {
  eventId?: UUID;
  venueId?: UUID;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sellerId?: UUID;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface MarketplaceListing extends BaseEntity {
  ticket_id: UUID;
  seller_id: UUID;
  event_id: UUID;
  venue_id: UUID;
  price: number;
  original_face_value: number;
  status: ListingStatus;
  listed_at: Date;
  sold_at?: Date;
  expires_at?: Date;
  cancelled_at?: Date;
  buyer_id?: UUID;
  notes?: string;
}

export interface ListingWithDetails extends MarketplaceListing {
  event_name?: string;
  venue_name?: string;
  event_date?: Date;
  seller_username?: string;
  seller_rating?: number;
  tier_name?: string;
  section?: string;
  row?: string;
  seat?: string;
}

export interface PriceUpdate {
  listing_id: UUID;
  old_price: number;
  new_price: number;
  updated_by: UUID;
  reason?: string;
  timestamp: Date;
}

export interface CreateListingInput {
  ticket_id: UUID;
  price: number;
  expires_at?: Date;
  notes?: string;
}

export interface UpdateListingInput {
  price?: number;
  expires_at?: Date;
  notes?: string;
}
```

### FILE: src/types/common.types.ts
```typescript
export type UUID = string;
export type Timestamp = Date;

export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
export type TransferStatus = 'initiated' | 'pending' | 'completed' | 'failed' | 'refunded';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'cancelled';
export type PaymentCurrency = 'USDC' | 'SOL';
export type UserRole = 'buyer' | 'seller' | 'admin' | 'venue_owner';

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuthUser {
  id: UUID;
  wallet: string;
  email?: string;
  role: UserRole;
  tenant_id?: UUID;
}

export interface IdempotencyContext {
  key: string;
  request_id: string;
  processed?: boolean;
}

export interface BaseEntity {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

### FILE: src/types/transfer.types.ts
```typescript
import { UUID, TransferStatus, PaymentCurrency, BaseEntity } from './common.types';

export interface MarketplaceTransfer extends BaseEntity {
  listing_id: UUID;
  buyer_id: UUID;
  seller_id: UUID;
  ticket_id: UUID;
  amount: number;
  platform_fee: number;
  seller_proceeds: number;
  status: TransferStatus;
  payment_currency: PaymentCurrency;
  blockchain_signature?: string;
  payment_intent_id?: string;
  transferred_at?: Date;
  failed_at?: Date;
  failure_reason?: string;
}

export interface TransferRequest {
  listing_id: UUID;
  buyer_id: UUID;
  buyer_wallet: string;
  payment_currency: PaymentCurrency;
  idempotency_key?: string;
}

export interface TransferValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface BlockchainTransfer {
  signature: string;
  block_height: number;
  fee: number;
  confirmed_at?: Date;
  from_wallet: string;
  to_wallet: string;
  program_address?: string;
}

export interface TransferMetadata {
  initiated_at: Date;
  completed_at?: Date;
  attempts: number;
  last_error?: string;
  blockchain_confirmations?: number;
}
```

### FILE: src/types/wallet.types.ts
```typescript
import { UUID, Timestamp } from './common.types';

export interface WalletInfo {
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  balance?: number;
  is_valid: boolean;
  is_program_wallet?: boolean;
  owner_id?: UUID;
}

export interface WalletTransaction {
  signature: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: Timestamp;
  status: 'pending' | 'confirmed' | 'failed';
  block_height?: number;
}

export interface WalletBalance {
  wallet_address: string;
  sol_balance: number;
  usdc_balance: number;
  token_count?: number;
  last_updated: Timestamp;
}

export interface WalletVerification {
  wallet_address: string;
  message: string;
  signature: string;
  verified: boolean;
  verified_at?: Timestamp;
}
```

### FILE: src/types/venue-settings.types.ts
```typescript
import { UUID, BaseEntity } from './common.types';

export interface VenueRules {
  max_markup_percentage?: number;
  min_markup_percentage?: number;
  requires_approval: boolean;
  blacklist_enabled: boolean;
  allow_international_sales: boolean;
  min_days_before_event?: number;
  max_listings_per_user?: number;
  restricted_sections?: string[];
}

export interface VenueFees {
  percentage: number;
  flat_fee?: number;
  cap_amount?: number;
  currency: 'USD' | 'USDC' | 'SOL';
}

export interface VenueMarketplaceSettings extends BaseEntity {
  venue_id: UUID;
  is_active: boolean;
  rules: VenueRules;
  fees: VenueFees;
  payout_wallet?: string;
  auto_approve_listings: boolean;
  notification_email?: string;
}

export interface VenueRestriction {
  venue_id: UUID;
  restriction_type: 'blacklist' | 'whitelist' | 'geo_restriction';
  restricted_value: string;
  reason?: string;
  active: boolean;
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/marketplace-service//src/routes/venue.routes.ts:10:const updateSettingsSchema = Joi.object({
backend/services/marketplace-service//src/routes/venue.routes.ts:27:// Update venue marketplace settings - SECURED
backend/services/marketplace-service//src/routes/venue.routes.ts:30:  validate(updateSettingsSchema),
backend/services/marketplace-service//src/routes/venue.routes.ts:31:  venueSettingsController.updateSettings.bind(venueSettingsController)
backend/services/marketplace-service//src/routes/listings.routes.ts:20:const updatePriceSchema = Joi.object({
backend/services/marketplace-service//src/routes/listings.routes.ts:43:// Update listing price - SECURED with ownership check
backend/services/marketplace-service//src/routes/listings.routes.ts:47:  validate(updatePriceSchema),
backend/services/marketplace-service//src/routes/listings.routes.ts:48:  listingController.updateListingPrice.bind(listingController)
backend/services/marketplace-service//src/routes/health.routes.ts:12:    await db.raw('SELECT 1');
backend/services/marketplace-service//src/config/constants.ts:41:  PRICE_UPDATE_PER_HOUR: 20,
backend/services/marketplace-service//src/config/constants.ts:110:  LISTING_UPDATED: 'Listing updated successfully',
backend/services/marketplace-service//src/config/database.ts:47:    await db.raw('SELECT 1');
backend/services/marketplace-service//src/events/event-types.ts:3:  LISTING_UPDATED = 'marketplace.listing.updated',
backend/services/marketplace-service//src/tests/setup.ts:10:    await db.raw('SELECT 1');
backend/services/marketplace-service//src/migrations/marketplace_tables.sql:28:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
backend/services/marketplace-service//src/server.ts:11:      await db.raw('SELECT 1');
backend/services/marketplace-service//src/seeds/test-data.ts:26:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:42:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:57:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:74:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:91:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:113:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:128:        updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:150:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/test-data.ts:170:      updated_at: new Date()
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:10:    const users = await db('users').select('id', 'email').limit(2);
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:19:    const venues = await db('venues').select('id', 'name').limit(1);
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:40:        updated_at: new Date()
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:46:    const events = await db('events').select('id', 'name').where({ venue_id: venueId }).limit(1);
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:62:        updated_at: new Date()
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:73:      .select('id', 'qr_code', 'seat_number')
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:89:        updated_at: new Date()
backend/services/marketplace-service//src/seeds/marketplace-test-data.ts:141:          updated_at: new Date()
backend/services/marketplace-service//src/controllers/listing.controller.ts:23:  async updateListingPrice(req: WalletRequest, res: Response, next: NextFunction) {
backend/services/marketplace-service//src/controllers/listing.controller.ts:28:      const listing = await listingService.updateListingPrice({
backend/services/marketplace-service//src/controllers/admin.controller.ts:10:        .select(
backend/services/marketplace-service//src/controllers/admin.controller.ts:46:        .update({
backend/services/marketplace-service//src/controllers/admin.controller.ts:51:          updated_at: new Date()
backend/services/marketplace-service//src/controllers/admin.controller.ts:64:        .select('user_id', db.raw('COUNT(*) as violation_count'), db.raw('MAX(flagged_at) as last_flagged'))
backend/services/marketplace-service//src/controllers/listings.controller.ts:137:      // Lock and update in one query
backend/services/marketplace-service//src/controllers/listings.controller.ts:138:      const updated = await trx('marketplace_listings')
backend/services/marketplace-service//src/controllers/listings.controller.ts:144:        .update({ 
backend/services/marketplace-service//src/controllers/listings.controller.ts:150:      if (!updated.length) {
backend/services/marketplace-service//src/controllers/buy.controller.ts:22:            .forUpdate()
backend/services/marketplace-service//src/controllers/buy.controller.ts:69:            .update({
backend/services/marketplace-service//src/controllers/health.controller.ts:24:      await db.raw('SELECT 1');
backend/services/marketplace-service//src/controllers/health.controller.ts:53:      await db.raw('SELECT 1');
backend/services/marketplace-service//src/controllers/venue-settings.controller.ts:12:  async updateSettings(_req: Request, res: Response, next: NextFunction) {
backend/services/marketplace-service//src/models/listing.model.ts:28:  updatedAt: Date;
backend/services/marketplace-service//src/models/listing.model.ts:43:export interface UpdateListingInput {
backend/services/marketplace-service//src/models/listing.model.ts:128:  async update(
backend/services/marketplace-service//src/models/listing.model.ts:130:    input: UpdateListingInput
backend/services/marketplace-service//src/models/listing.model.ts:132:    const updateData: any = {};
backend/services/marketplace-service//src/models/listing.model.ts:135:      updateData.price = input.price;
backend/services/marketplace-service//src/models/listing.model.ts:138:      updateData.expires_at = input.expiresAt;
backend/services/marketplace-service//src/models/listing.model.ts:143:      .update(updateData)
backend/services/marketplace-service//src/models/listing.model.ts:149:  async updateStatus(
backend/services/marketplace-service//src/models/listing.model.ts:154:    const updateData: any = { status };
backend/services/marketplace-service//src/models/listing.model.ts:157:      updateData.sold_at = new Date();
backend/services/marketplace-service//src/models/listing.model.ts:160:      updateData.cancelled_at = new Date();
backend/services/marketplace-service//src/models/listing.model.ts:163:    Object.assign(updateData, additionalData);
backend/services/marketplace-service//src/models/listing.model.ts:167:      .update(updateData)
backend/services/marketplace-service//src/models/listing.model.ts:210:      .update({ status: 'expired' });
backend/services/marketplace-service//src/models/listing.model.ts:240:      updatedAt: row.updated_at,
backend/services/marketplace-service//src/models/tax-reporting.model.ts:88:        .select('*');
backend/services/marketplace-service//src/models/tax-reporting.model.ts:122:        .update({ reported: true });
backend/services/marketplace-service//src/models/tax-reporting.model.ts:207:        .select('*');
backend/services/marketplace-service//src/models/dispute.model.ts:18:  updated_at: Date;
backend/services/marketplace-service//src/models/dispute.model.ts:55:        updated_at: new Date()
backend/services/marketplace-service//src/models/dispute.model.ts:99:  async updateDisputeStatus(
backend/services/marketplace-service//src/models/dispute.model.ts:106:      const updates: Partial<Dispute> = {
backend/services/marketplace-service//src/models/dispute.model.ts:108:        updated_at: new Date()
backend/services/marketplace-service//src/models/dispute.model.ts:112:        updates.resolution = resolution;
backend/services/marketplace-service//src/models/dispute.model.ts:113:        updates.resolved_by = resolvedBy;
backend/services/marketplace-service//src/models/dispute.model.ts:114:        updates.resolved_at = new Date();
backend/services/marketplace-service//src/models/dispute.model.ts:119:        .update(updates);
backend/services/marketplace-service//src/models/dispute.model.ts:121:      logger.info(`Dispute ${disputeId} updated to status: ${status}`);
backend/services/marketplace-service//src/models/dispute.model.ts:146:        .select('*');
backend/services/marketplace-service//src/models/dispute.model.ts:170:      return await query.orderBy('created_at', 'desc').select('*');
backend/services/marketplace-service//src/models/fee.model.ts:81:  async updateFeeCollection(
backend/services/marketplace-service//src/models/fee.model.ts:88:    const updateData: any = {};
backend/services/marketplace-service//src/models/fee.model.ts:91:      updateData.platform_fee_collected = platformCollected;
backend/services/marketplace-service//src/models/fee.model.ts:94:      updateData.venue_fee_paid = venueCollected;
backend/services/marketplace-service//src/models/fee.model.ts:97:      updateData.platform_fee_signature = platformSignature;
backend/services/marketplace-service//src/models/fee.model.ts:100:      updateData.venue_fee_signature = venueSignature;
backend/services/marketplace-service//src/models/fee.model.ts:105:      .update(updateData)
backend/services/marketplace-service//src/models/price-history.model.ts:68:        .select('*');
backend/services/marketplace-service//src/models/price-history.model.ts:115:        .select(
backend/services/marketplace-service//src/models/blacklist.model.ts:64:      await query.update({ is_active: false });
backend/services/marketplace-service//src/models/blacklist.model.ts:88:      const entries = await query.select('*');
backend/services/marketplace-service//src/models/blacklist.model.ts:96:            .update({ is_active: false });
backend/services/marketplace-service//src/models/blacklist.model.ts:122:      return await query.orderBy('banned_at', 'desc').select('*');
backend/services/marketplace-service//src/models/anti-bot.model.ts:79:        .select('*');
backend/services/marketplace-service//src/models/transfer.model.ts:112:  async updateStatus(
backend/services/marketplace-service//src/models/transfer.model.ts:117:    const updateData: any = { status };
backend/services/marketplace-service//src/models/transfer.model.ts:120:      updateData.completed_at = new Date();
backend/services/marketplace-service//src/models/transfer.model.ts:122:      updateData.failed_at = new Date();
backend/services/marketplace-service//src/models/transfer.model.ts:124:        updateData.failure_reason = additionalData.failureReason;
backend/services/marketplace-service//src/models/transfer.model.ts:128:    Object.assign(updateData, additionalData);
backend/services/marketplace-service//src/models/transfer.model.ts:132:      .update(updateData)
backend/services/marketplace-service//src/models/transfer.model.ts:138:  async updateBlockchainData(
backend/services/marketplace-service//src/models/transfer.model.ts:147:      .update({
backend/services/marketplace-service//src/models/venue-settings.model.ts:23:  updatedAt: Date;
backend/services/marketplace-service//src/models/venue-settings.model.ts:40:export interface UpdateVenueSettingsInput {
backend/services/marketplace-service//src/models/venue-settings.model.ts:98:  async update(
backend/services/marketplace-service//src/models/venue-settings.model.ts:100:    input: UpdateVenueSettingsInput
backend/services/marketplace-service//src/models/venue-settings.model.ts:102:    const updateData: any = {};
backend/services/marketplace-service//src/models/venue-settings.model.ts:105:      updateData.max_resale_multiplier = input.maxResaleMultiplier;
backend/services/marketplace-service//src/models/venue-settings.model.ts:108:      updateData.min_price_multiplier = input.minPriceMultiplier;
backend/services/marketplace-service//src/models/venue-settings.model.ts:111:      updateData.allow_below_face = input.allowBelowFace;
backend/services/marketplace-service//src/models/venue-settings.model.ts:114:      updateData.transfer_cutoff_hours = input.transferCutoffHours;
backend/services/marketplace-service//src/models/venue-settings.model.ts:117:      updateData.listing_advance_hours = input.listingAdvanceHours;
backend/services/marketplace-service//src/models/venue-settings.model.ts:120:      updateData.max_listings_per_user_per_event = input.maxListingsPerUserPerEvent;
backend/services/marketplace-service//src/models/venue-settings.model.ts:123:      updateData.max_listings_per_user_total = input.maxListingsPerUserTotal;
backend/services/marketplace-service//src/models/venue-settings.model.ts:126:      updateData.require_listing_approval = input.requireListingApproval;
backend/services/marketplace-service//src/models/venue-settings.model.ts:129:      updateData.royalty_percentage = input.royaltyPercentage;
backend/services/marketplace-service//src/models/venue-settings.model.ts:132:      updateData.royalty_wallet_address = input.royaltyWalletAddress;
backend/services/marketplace-service//src/models/venue-settings.model.ts:135:      updateData.allow_international_sales = input.allowInternationalSales;
backend/services/marketplace-service//src/models/venue-settings.model.ts:138:      updateData.blocked_countries = input.blockedCountries;
backend/services/marketplace-service//src/models/venue-settings.model.ts:141:      updateData.require_kyc_for_high_value = input.requireKycForHighValue;
backend/services/marketplace-service//src/models/venue-settings.model.ts:144:      updateData.high_value_threshold = input.highValueThreshold;
backend/services/marketplace-service//src/models/venue-settings.model.ts:147:    updateData.updated_at = new Date();
backend/services/marketplace-service//src/models/venue-settings.model.ts:151:      .update(updateData)
backend/services/marketplace-service//src/models/venue-settings.model.ts:187:      updatedAt: row.updated_at,
backend/services/marketplace-service//src/services/notification.service.ts:96:  async notifyDisputeUpdate(
backend/services/marketplace-service//src/services/notification.service.ts:106:          type: 'dispute_update',
backend/services/marketplace-service//src/services/notification.service.ts:107:          title: 'Dispute status update',
backend/services/marketplace-service//src/services/wallet.service.ts:104:        last_updated: new Date()
backend/services/marketplace-service//src/services/listing.service.ts:8:  async updateListingPrice(params: {
backend/services/marketplace-service//src/services/listing.service.ts:32:        throw new Error(`Cannot update price for listing with status: ${listing.status}`);
backend/services/marketplace-service//src/services/listing.service.ts:43:      const updated = await listingModel.update(listingId, { price: newPrice });
backend/services/marketplace-service//src/services/listing.service.ts:46:      this.log.info('Listing price updated with distributed lock', {
backend/services/marketplace-service//src/services/listing.service.ts:53:      return updated;
backend/services/marketplace-service//src/services/listing.service.ts:122:      const updated = await listingModel.updateStatus(listingId, 'cancelled', {
backend/services/marketplace-service//src/services/listing.service.ts:131:      return updated;
backend/services/marketplace-service//src/services/listing.service.ts:191:      const updated = await listingModel.updateStatus(listingId, 'sold', {
backend/services/marketplace-service//src/services/listing.service.ts:196:      if (!updated) {
backend/services/marketplace-service//src/services/listing.service.ts:207:      return updated;
backend/services/marketplace-service//src/services/search.service.ts:73:      // Select fields
backend/services/marketplace-service//src/services/search.service.ts:74:      const listings = await query.select(
backend/services/marketplace-service//src/services/search.service.ts:116:        .select(
backend/services/marketplace-service//src/services/search.service.ts:135:        .select('event_id')
backend/services/marketplace-service//src/services/search.service.ts:151:          this.select('venue_id')
backend/services/marketplace-service//src/services/search.service.ts:157:        .select(
backend/services/marketplace-service//src/services/listing.service.ts.backup:6:  async updateListingPrice(params: {
backend/services/marketplace-service//src/services/listing.service.ts.backup:18:      SELECT l.*, t.ticket_type_id, tt.price_cents as original_price
backend/services/marketplace-service//src/services/listing.service.ts.backup:36:    this.log.info('Listing price updated', {
backend/services/marketplace-service//src/services/listing.service.ts.backup:134:    const listing = await listingModel.updateStatus(listingId, 'sold', {
backend/services/marketplace-service//src/services/dispute.service.ts:38:        updated_at: new Date()
backend/services/marketplace-service//src/services/tax-reporting.service.ts:39:        .select('*');
backend/services/marketplace-service//src/services/validation.service.ts:281:   * Check if price update is valid
backend/services/marketplace-service//src/services/validation.service.ts:283:  async validatePriceUpdate(
backend/services/marketplace-service//src/services/validation.service.ts:294:      throw new ForbiddenError('You can only update your own listings');
backend/services/marketplace-service//src/services/validation.service.ts:298:      throw new ValidationError('Can only update active listings');
backend/services/marketplace-service//src/services/transfer.service.ts:111:    // Update transfer with blockchain data
backend/services/marketplace-service//src/services/transfer.service.ts:112:    await transferModel.updateBlockchainData(
backend/services/marketplace-service//src/services/transfer.service.ts:120:    await transferModel.updateStatus(transfer.id, 'completed');
backend/services/marketplace-service//src/services/transfer.service.ts:125:    // Update fee collection status
backend/services/marketplace-service//src/services/transfer.service.ts:128:      await feeModel.updateFeeCollection(
backend/services/marketplace-service//src/services/transfer.service.ts:154:    await transferModel.updateStatus(transfer.id, 'failed', {
backend/services/marketplace-service//src/services/transfer.service.ts:159:    await listingModel.updateStatus(transfer.listingId, 'active');
backend/services/marketplace-service//src/types/listing.types.ts:42:export interface PriceUpdate {
backend/services/marketplace-service//src/types/listing.types.ts:46:  updated_by: UUID;
backend/services/marketplace-service//src/types/listing.types.ts:58:export interface UpdateListingInput {
backend/services/marketplace-service//src/types/common.types.ts:41:  updated_at: Timestamp;
backend/services/marketplace-service//src/types/wallet.types.ts:28:  last_updated: Timestamp;

### All JOIN operations:
backend/services/marketplace-service//src/models/fee.model.ts:130:      .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
backend/services/marketplace-service//src/models/price-history.model.ts:82:        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
backend/services/marketplace-service//src/models/price-history.model.ts:112:        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
backend/services/marketplace-service//src/middleware/validation.middleware.ts:14:        field: detail.path.join('.'),
backend/services/marketplace-service//src/middleware/validation.middleware.ts:35:        field: detail.path.join('.'),
backend/services/marketplace-service//src/middleware/validation.middleware.ts:56:        field: detail.path.join('.'),
backend/services/marketplace-service//src/services/search.service.ts:25:        .leftJoin('events as e', 'ml.event_id', 'e.id')
backend/services/marketplace-service//src/services/search.service.ts:26:        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
backend/services/marketplace-service//src/services/search.service.ts:27:        .leftJoin('users as u', 'ml.seller_id', 'u.id')
backend/services/marketplace-service//src/services/search.service.ts:110:        .leftJoin('events as e', 'ml.event_id', 'e.id')
backend/services/marketplace-service//src/services/search.service.ts:111:        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
backend/services/marketplace-service//src/services/search.service.ts:147:        .leftJoin('events as e', 'ml.event_id', 'e.id')
backend/services/marketplace-service//src/services/search.service.ts:148:        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
backend/services/marketplace-service//src/services/listing.service.ts.backup:20:      JOIN tickets t ON l.ticket_id = t.id
backend/services/marketplace-service//src/services/listing.service.ts.backup:21:      JOIN ticket_types tt ON t.ticket_type_id = tt.id

### All WHERE clauses:
backend/services/marketplace-service//src/services/listing.service.ts.backup:22:      WHERE l.id = $1 AND l.seller_id = $2

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';

// Debug: Log the connection details (remove password from logs in production!)
console.log('DB Connection attempt:', {
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD ? '[HIDDEN]' : 'NO PASSWORD SET',
  passwordLength: process.env.DB_PASSWORD?.length || 0
});

const config: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export const db = knex(config);

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await db.destroy();
  logger.info('Database connection closed');
}

export default db;
```
### .env.example
```
# ================================================
# MARKETPLACE-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: marketplace-service
# Port: 3008
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=marketplace-service           # Service identifier

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

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/config/service-urls.ts
```typescript
// Additional service URLs that were missing
export const additionalServiceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};
```

### FILE: src/services/blockchain.service.ts
```typescript
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import blockchain from '../config/blockchain';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

// Import the IDL (you'll need to copy this from your deployed-idl.json)
const IDL = require('../idl/marketplace.json');

interface TransferNFTParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  listingId: string;
  price: number;
}

interface TransferResult {
  signature: string;
  blockHeight: number;
  fee: number;
}

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;
  private log = logger.child({ component: 'RealBlockchainService' });

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  private initializeProgram() {
    try {
      // Get the marketplace program ID from your deployed contract
      const programId = new PublicKey(process.env.MARKETPLACE_PROGRAM_ID || 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv');

      // Create a dummy provider for reading
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // We'll add wallet when needed for transactions
        { commitment: 'confirmed' }
      );

      this.program = new Program(IDL as any, provider);
      this.log.info('Marketplace program initialized', { programId: programId.toString() });
    } catch (error) {
      this.log.error('Failed to initialize program', { error });
    }
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { tokenId, fromWallet, toWallet, listingId, price } = params;

      // Get the payer wallet (marketplace service wallet)
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create the necessary PDAs and accounts
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
        this.program.programId
      );

      const [marketplacePDA] = await PublicKey.findProgramAddress(
        [Buffer.from('marketplace')],
        this.program.programId
      );

      const [reentrancyGuardPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
        this.program.programId
      );

      // Build the buy_listing instruction
      const instruction = await this.program.methods
        .buyListing()
        .accounts({
          buyer: new PublicKey(toWallet),
          listing: listingPDA,
          marketplace: marketplacePDA,
          seller: new PublicKey(fromWallet),
          marketplaceTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          reentrancyGuard: reentrancyGuardPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      const blockHeight = await this.connection.getBlockHeight();
      const fee = 0.00025; // Estimated SOL transaction fee

      this.log.info('NFT transfer completed on-chain', {
        signature,
        blockHeight,
        fromWallet,
        toWallet,
        tokenId
      });

      return {
        signature,
        blockHeight,
        fee,
      };
    } catch (error) {
      this.log.error('NFT transfer failed', { error, params });
      throw new InternalServerError('Blockchain transfer failed: ' + (error as Error).message || 'Unknown error');
    }
  }

  async verifyNFTOwnership(walletAddress: string, tokenId: string): Promise<boolean> {
    try {
      if (!this.program) return false;

      // Query the on-chain listing account
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(tokenId).toBuffer()],
        this.program.programId
      );

      const listing = await (this.program.account as any).listing.fetch(listingPDA);
      return listing.seller.toString() === walletAddress;
    } catch (error) {
      this.log.error('Failed to verify NFT ownership', { error, walletAddress, tokenId });
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      this.log.error('Failed to get wallet balance', { error, walletAddress });
      throw new InternalServerError('Failed to get wallet balance');
    }
  }

  /**
   * Validate transaction signature
   */
  async validateTransaction(signature: string): Promise<boolean> {
    try {
      const result = await this.connection.getTransaction(signature);
      return result !== null && result.meta?.err === null;
    } catch (error) {
      this.log.error('Failed to validate transaction', { error, signature });
      return false;
    }
  }

  /**
   * Get the blockchain connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Calculate network fees
   */
  calculateNetworkFee(): number {
    // Solana base fee is 5000 lamports (0.000005 SOL)
    // NFT transfer might require 2-3 transactions
    return 0.00025; // SOL
  }
}

// Export singleton instance to match current usage
export const blockchainService = new RealBlockchainService();
```

### FILE: src/services/notification.service.ts
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { config } from '../config';

interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

class NotificationServiceClass {
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Notification service error: ${response.statusText}`);
      }
      
      logger.info(`Notification sent to user ${payload.user_id}: ${payload.type}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
      // Don't throw - notifications should not block main flow
    }
  }
  
  async notifyListingSold(
    listingId: string,
    buyerId: string,
    sellerId: string,
    price: number
  ): Promise<void> {
    try {
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_sold',
        title: 'Your ticket has been sold!',
        body: `Your listing has been purchased for $${price}`,
        data: { listing_id: listingId, buyer_id: buyerId },
        priority: 'high'
      });
      
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'purchase_confirmed',
        title: 'Purchase confirmed!',
        body: `You have successfully purchased a ticket for $${price}`,
        data: { listing_id: listingId, seller_id: sellerId },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending listing sold notifications:', error);
    }
  }
  
  async notifyPriceChange(
    listingId: string,
    watchers: string[],
    oldPrice: number,
    newPrice: number
  ): Promise<void> {
    try {
      const priceDirection = newPrice < oldPrice ? 'decreased' : 'increased';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      for (const watcherId of watchers) {
        await this.sendNotification({
          user_id: watcherId,
          type: 'price_change',
          title: 'Price alert!',
          body: `A ticket you're watching has ${priceDirection} by $${priceDiff}`,
          data: { 
            listing_id: listingId,
            old_price: oldPrice,
            new_price: newPrice
          },
          priority: 'normal'
        });
      }
    } catch (error) {
      logger.error('Error sending price change notifications:', error);
    }
  }
  
  async notifyDisputeUpdate(
    disputeId: string,
    parties: string[],
    status: string,
    message: string
  ): Promise<void> {
    try {
      for (const userId of parties) {
        await this.sendNotification({
          user_id: userId,
          type: 'dispute_update',
          title: 'Dispute status update',
          body: message,
          data: { 
            dispute_id: disputeId,
            status
          },
          priority: 'high'
        });
      }
    } catch (error) {
      logger.error('Error sending dispute notifications:', error);
    }
  }
  
  async notifyTransferComplete(
    transferId: string,
    buyerId: string,
    sellerId: string,
    ticketId: string
  ): Promise<void> {
    try {
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'transfer_complete',
        title: 'Ticket received!',
        body: 'Your ticket has been successfully transferred to your wallet',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
      
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'payment_received',
        title: 'Payment received!',
        body: 'The payment for your ticket sale has been processed',
        data: { 
          transfer_id: transferId,
          ticket_id: ticketId
        },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending transfer notifications:', error);
    }
  }
  
  async notifyListingExpiring(
    listingId: string,
    sellerId: string,
    hoursRemaining: number
  ): Promise<void> {
    try {
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_expiring',
        title: 'Listing expiring soon',
        body: `Your ticket listing will expire in ${hoursRemaining} hours`,
        data: { 
          listing_id: listingId,
          hours_remaining: hoursRemaining
        },
        priority: 'normal'
      });
    } catch (error) {
      logger.error('Error sending expiry notification:', error);
    }
  }
}

export const NotificationService = NotificationServiceClass;
export const notificationService = new NotificationServiceClass();
```

### FILE: src/services/venue-rules.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { ValidationError } from '../utils/errors';

class VenueRulesServiceClass {
  async validateListing(listing: any, venueId: string) {
    try {
      const venueSettings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!venueSettings) {
        return { isValid: true };
      }
      
      const rules = venueSettings.rules || {};
      const errors: string[] = [];
      
      // Check max markup
      if (rules.max_markup_percentage) {
        const maxPrice = listing.face_value * (1 + rules.max_markup_percentage / 100);
        if (listing.price > maxPrice) {
          errors.push(`Price exceeds maximum ${rules.max_markup_percentage}% markup`);
        }
      }
      
      // Check min markup
      if (rules.min_markup_percentage) {
        const minPrice = listing.face_value * (1 + rules.min_markup_percentage / 100);
        if (listing.price < minPrice) {
          errors.push(`Price below minimum ${rules.min_markup_percentage}% markup`);
        }
      }
      
      // Check days before event
      if (rules.min_days_before_event) {
        const eventDate = new Date(listing.event_date);
        const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilEvent < rules.min_days_before_event) {
          errors.push(`Cannot list tickets less than ${rules.min_days_before_event} days before event`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error('Error validating listing:', error);
      return { isValid: true };
    }
  }
  
  async checkMaxMarkup(price: number, faceValue: number, venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!settings?.rules?.max_markup_percentage) {
        return true;
      }
      
      const maxPrice = faceValue * (1 + settings.rules.max_markup_percentage / 100);
      return price <= maxPrice;
    } catch (error) {
      logger.error('Error checking max markup:', error);
      return true;
    }
  }
  
  async requiresApproval(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules?.requires_approval || false;
    } catch (error) {
      logger.error('Error checking approval requirement:', error);
      return false;
    }
  }
  
  async getVenueRestrictions(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules || {};
    } catch (error) {
      logger.error('Error getting venue restrictions:', error);
      return {};
    }
  }
}

export const venueRulesService = new VenueRulesServiceClass();
```

### FILE: src/services/wallet.service.ts
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { 
  isValidSolanaAddress, 
  formatWalletAddress,
  verifyWalletOwnership 
} from '../utils/wallet-helper';
import { WalletInfo, WalletBalance, WalletVerification } from '../types/wallet.types';
import { config } from '../config';

class WalletServiceClass {
  async getWalletInfo(walletAddress: string): Promise<WalletInfo | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        logger.warn(`Invalid wallet address: ${walletAddress}`);
        return null;
      }
      
      // In production, would fetch from blockchain
      const walletInfo: WalletInfo = {
        address: walletAddress,
        network: (process.env.SOLANA_NETWORK || 'devnet') as any,
        is_valid: true,
        is_program_wallet: false
      };
      
      // Fetch balance from blockchain service
      try {
        const balanceResponse = await fetch(
          `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance`
        );
        
        if (balanceResponse.ok) {
          const data = await balanceResponse.json();
          walletInfo.balance = data.balance;
        }
      } catch (error) {
        logger.error('Error fetching wallet balance:', error);
      }
      
      return walletInfo;
    } catch (error) {
      logger.error('Error getting wallet info:', error);
      return null;
    }
  }
  
  async verifyWalletOwnership(
    userId: string,
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      // Verify signature
      const isValid = await verifyWalletOwnership(walletAddress, message, signature);
      
      if (!isValid) {
        logger.warn(`Invalid signature for wallet ${formatWalletAddress(walletAddress)}`);
        return false;
      }
      
      // Store verification record
      const verification: WalletVerification = {
        wallet_address: walletAddress,
        message,
        signature,
        verified: true,
        verified_at: new Date()
      };
      
      // In production, would store in database
      logger.info(`Wallet ownership verified for user ${userId}`);
      
      return true;
    } catch (error) {
      logger.error('Error verifying wallet ownership:', error);
      return false;
    }
  }
  
  async getWalletBalance(walletAddress: string): Promise<WalletBalance | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        return null;
      }
      
      // Fetch from blockchain service
      const response = await fetch(
        `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance/detailed`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        wallet_address: walletAddress,
        sol_balance: data.sol_balance || 0,
        usdc_balance: data.usdc_balance || 0,
        token_count: data.token_count || 0,
        last_updated: new Date()
      };
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      return null;
    }
  }
  
  async validateWalletForTransaction(
    walletAddress: string,
    requiredAmount: number,
    currency: 'SOL' | 'USDC'
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check wallet validity
      if (!isValidSolanaAddress(walletAddress)) {
        return { valid: false, error: 'Invalid wallet address format' };
      }
      
      // Check balance
      const balance = await this.getWalletBalance(walletAddress);
      
      if (!balance) {
        return { valid: false, error: 'Could not fetch wallet balance' };
      }
      
      const currentBalance = currency === 'SOL' ? balance.sol_balance : balance.usdc_balance;
      
      if (currentBalance < requiredAmount) {
        return { 
          valid: false, 
          error: `Insufficient ${currency} balance. Required: ${requiredAmount}, Available: ${currentBalance}` 
        };
      }
      
      return { valid: true };
    } catch (error) {
      logger.error('Error validating wallet for transaction:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }
}

export const WalletService = WalletServiceClass;
export const walletService = new WalletServiceClass();
```

### FILE: src/services/anti-bot.service.ts
```typescript
import { logger } from '../utils/logger';
import { antiBotModel } from '../models/anti-bot.model';
import { cache } from './cache-integration';
import { 
  MAX_PURCHASES_PER_HOUR,
  MAX_LISTINGS_PER_DAY,
  VELOCITY_CHECK_WINDOW_SECONDS,
  BOT_SCORE_THRESHOLD
} from '../utils/constants';

class AntiBotServiceClass {
  async checkPurchaseVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'purchase',
        3600 // 1 hour in seconds
      );
      
      if (count >= MAX_PURCHASES_PER_HOUR) {
        logger.warn(`User ${userId} exceeded purchase velocity limit: ${count} purchases`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded purchase velocity: ${count} purchases in 1 hour`,
          'high'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking purchase velocity:', error);
      return true; // Allow on error
    }
  }
  
  async checkListingVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'listing_created',
        86400 // 24 hours in seconds
      );
      
      if (count >= MAX_LISTINGS_PER_DAY) {
        logger.warn(`User ${userId} exceeded listing velocity limit: ${count} listings`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded listing velocity: ${count} listings in 24 hours`,
          'medium'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking listing velocity:', error);
      return true;
    }
  }
  
  async analyzeUserPattern(userId: string): Promise<any> {
    try {
      const botScore = await antiBotModel.calculateBotScore(userId);
      
      if (botScore.is_bot) {
        logger.warn(`User ${userId} flagged as potential bot. Score: ${botScore.score}`);
        
        // Cache the bot detection
        await cache.set(
          `bot_detection:${userId}`,
          JSON.stringify(botScore),
          { ttl: 3600 }
        );
      }
      
      return botScore;
    } catch (error) {
      logger.error('Error analyzing user pattern:', error);
      return null;
    }
  }
  
  async enforceRateLimit(userId: string, action: string): Promise<boolean> {
    try {
      const cacheKey = `rate_limit:${userId}:${action}`;
      const current = await cache.get(cacheKey);
      
      if (current) {
        const count = parseInt(current as string, 10);
        const limit = this.getActionLimit(action);
        
        if (count >= limit) {
          logger.warn(`Rate limit exceeded for user ${userId}, action: ${action}`);
          return false;
        }
        
        await cache.set(cacheKey, (count + 1).toString(), { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      } else {
        await cache.set(cacheKey, '1', { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      }
      
      // Record activity
      await antiBotModel.recordActivity(userId, action);
      
      return true;
    } catch (error) {
      logger.error('Error enforcing rate limit:', error);
      return true;
    }
  }
  
  private getActionLimit(action: string): number {
    const limits: Record<string, number> = {
      'api_call': 100,
      'search': 50,
      'listing_view': 200,
      'purchase_attempt': 10,
      'listing_create': 5
    };
    
    return limits[action] || 100;
  }
  
  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = await cache.get(`user_blocked:${userId}`);
      if (cached === 'true') {
        return true;
      }
      
      // Check bot score
      const botScore = await antiBotModel.calculateBotScore(userId);
      if (botScore.score > BOT_SCORE_THRESHOLD) {
        await cache.set(`user_blocked:${userId}`, 'true', { ttl: 3600 });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if user is blocked:', error);
      return false;
    }
  }
}

export const AntiBotService = AntiBotServiceClass;
export const antiBotService = new AntiBotServiceClass();
```

### FILE: src/services/fee.service.ts
```typescript
import { feeModel } from '../models/fee.model';
import { transferModel } from '../models/transfer.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared/utils/money';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { NotFoundError } from '../utils/errors';

export interface FeeCalculation {
  salePrice: number;        // INTEGER CENTS
  platformFee: number;      // INTEGER CENTS
  venueFee: number;         // INTEGER CENTS
  sellerPayout: number;     // INTEGER CENTS
  totalFees: number;        // INTEGER CENTS
}

export interface FeeReport {
  totalVolume: number;           // INTEGER CENTS
  totalPlatformFees: number;     // INTEGER CENTS
  totalVenueFees: number;        // INTEGER CENTS
  transactionCount: number;
  averageTransactionSize: number; // INTEGER CENTS
}

export class FeeService {
  private log = logger.child({ component: 'FeeService' });

  /**
   * Calculate fees for a sale (all amounts in INTEGER CENTS)
   */
  calculateFees(salePriceCents: number, venueRoyaltyPercentage?: number): FeeCalculation {
    const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
    const venueFeePercentage = venueRoyaltyPercentage || constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE;

    // Convert percentages to basis points
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);

    const platformFeeCents = percentOfCents(salePriceCents, platformFeeBps);
    const venueFeeCents = percentOfCents(salePriceCents, venueFeeBps);
    const totalFeesCents = platformFeeCents + venueFeeCents;
    const sellerPayoutCents = salePriceCents - totalFeesCents;

    return {
      salePrice: salePriceCents,
      platformFee: platformFeeCents,
      venueFee: venueFeeCents,
      sellerPayout: sellerPayoutCents,
      totalFees: totalFeesCents,
    };
  }

  /**
   * Get fee breakdown for a transfer
   */
  async getTransferFees(transferId: string) {
    const fee = await feeModel.findByTransferId(transferId);
    if (!fee) {
      throw new NotFoundError('Fee record');
    }

    return {
      transferId,
      salePrice: fee.salePrice,
      platformFee: {
        amount: fee.platformFeeAmount,
        percentage: fee.platformFeePercentage,
        collected: fee.platformFeeCollected,
        signature: fee.platformFeeSignature,
      },
      venueFee: {
        amount: fee.venueFeeAmount,
        percentage: fee.venueFeePercentage,
        collected: fee.venueFeeCollected,
        signature: fee.venueFeeSignature,
      },
      sellerPayout: fee.sellerPayout,
      createdAt: fee.createdAt,
    };
  }

  /**
   * Get platform fee report (amounts in cents)
   */
  async getPlatformFeeReport(startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalPlatformFees(startDate, endDate);

    // Estimate volume based on 5% platform fee
    const estimatedVolumeCents = Math.round(totalFeesCents * 20);

    return {
      totalVolume: estimatedVolumeCents,
      totalPlatformFees: totalFeesCents,
      totalVenueFees: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Get venue fee report (amounts in cents)
   */
  async getVenueFeeReport(venueId: string, startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId, startDate, endDate);
    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);

    return {
      totalVolume: totalVolumeCents,
      totalPlatformFees: 0,
      totalVenueFees: totalFeesCents,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
   * Process fee distribution (called by cron job)
   */
  async processFeeDistributions() {
    this.log.info('Processing fee distributions');
  }

  /**
   * Get fee statistics for a venue (amounts in cents)
   */
  async getVenueStatistics(venueId: string) {
    const settings = await venueSettingsModel.findByVenueId(venueId);
    if (!settings) {
      throw new NotFoundError('Venue settings');
    }

    const totalVolumeCents = await transferModel.getTotalVolumeByVenueId(venueId);
    const totalFeesCents = await feeModel.getTotalVenueFees(venueId);

    return {
      venueId,
      royaltyPercentage: settings.royaltyPercentage,
      totalVolume: totalVolumeCents,
      totalFeesEarned: totalFeesCents,
      minimumPayout: settings.minimumRoyaltyPayout,
      payoutWallet: settings.royaltyWalletAddress,
    };
  }
}

export const feeService = new FeeService();
```

### FILE: src/services/listing.service.ts
```typescript
import { logger } from '../utils/logger';
import { withLock, LockKeys } from '@tickettoken/shared/utils/distributed-lock';
import { listingModel } from '../models/listing.model';

class ListingServiceClass {
  private log = logger.child({ component: 'ListingService' });

  async updateListingPrice(params: {
    listingId: string;
    newPrice: number;
    userId: string;
  }) {
    const { listingId, newPrice, userId } = params;
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      if (newPrice <= 0) {
        throw new Error('Price must be greater than zero');
      }

      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot update price for listing with status: ${listing.status}`);
      }

      const originalPriceCents = listing.originalFaceValue;
      const maxMarkupPercent = 300;
      const maxAllowedPriceCents = Math.floor(originalPriceCents * (1 + maxMarkupPercent / 100));

      if (newPrice > maxAllowedPriceCents) {
        throw new Error(`Price cannot exceed ${maxMarkupPercent}% markup. Maximum allowed: $${maxAllowedPriceCents / 100}`);
      }

      const updated = await listingModel.update(listingId, { price: newPrice });
      const markupPercent = Math.floor(((newPrice - originalPriceCents) / originalPriceCents) * 10000) / 100;

      this.log.info('Listing price updated with distributed lock', {
        listingId,
        oldPriceCents: listing.price,
        newPriceCents: newPrice,
        markupPercent: `${markupPercent}%`
      });

      return updated;
    });
  }

  async createListing(data: any) {
    const { ticketId, sellerId, walletAddress, eventId, venueId, originalFaceValue } = data;
    const lockKey = LockKeys.ticket(ticketId);

    return await withLock(lockKey, 5000, async () => {
      if (data.price) {
        this.log.warn('Client attempted to set listing price directly', {
          ticketId,
          attemptedPrice: data.price,
          sellerId
        });
      }

      const existingListing = await listingModel.findByTicketId(ticketId);
      
      if (existingListing && existingListing.status === 'active') {
        throw new Error('Ticket already has an active listing');
      }

      const ticketValueCents = originalFaceValue || await this.getTicketMarketValue(ticketId);

      const listing = await listingModel.create({
        ticketId,
        sellerId,
        eventId,
        venueId,
        price: ticketValueCents,
        originalFaceValue: ticketValueCents,
        walletAddress,
        requiresApproval: false
      });

      this.log.info('Listing created with distributed lock', {
        listingId: listing.id,
        ticketId,
        sellerId,
        priceCents: ticketValueCents
      });

      return listing;
    });
  }

  private async getTicketMarketValue(ticketId: string): Promise<number> {
    return 10000;
  }

  async cancelListing(listingId: string, userId: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);
      
      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot cancel listing with status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'cancelled', {
        cancelled_at: new Date()
      });

      this.log.info('Listing cancelled with distributed lock', {
        listingId,
        sellerId: userId
      });

      return updated;
    });
  }

  async getListingById(listingId: string) {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    return listing;
  }

  async searchListings(params: {
    eventId?: string;
    sellerId?: string;
    venueId?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }) {
    if (params.sellerId) {
      return await listingModel.findBySellerId(
        params.sellerId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    if (params.eventId) {
      return await listingModel.findByEventId(
        params.eventId,
        params.status || 'active',
        params.limit || 20,
        params.offset || 0
      );
    }

    return [];
  }

  async markListingAsSold(listingId: string, buyerId?: string) {
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.status !== 'active' && listing.status !== 'pending_approval') {
        throw new Error(`Cannot mark listing as sold. Current status: ${listing.status}`);
      }

      const updated = await listingModel.updateStatus(listingId, 'sold', {
        sold_at: new Date(),
        buyer_id: buyerId || 'unknown'
      });

      if (!updated) {
        throw new Error(`Failed to mark listing as sold: ${listingId}`);
      }

      this.log.info('Listing marked as sold with distributed lock', {
        listingId,
        sellerId: listing.sellerId,
        buyerId: buyerId || 'unknown',
        priceCents: listing.price
      });

      return updated;
    });
  }
}

export const ListingService = ListingServiceClass;
export const listingService = new ListingServiceClass();
```

### FILE: src/services/search.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ListingFilters, ListingWithDetails } from '../types/listing.types';
import { PaginationParams } from '../types/common.types';
import { cache } from './cache-integration';
import { SEARCH_CACHE_TTL } from '../utils/constants';

class SearchServiceClass {
  async searchListings(
    filters: ListingFilters,
    pagination: PaginationParams
  ): Promise<{ listings: ListingWithDetails[]; total: number }> {
    try {
      // Generate cache key
      const cacheKey = `search:${JSON.stringify({ filters, pagination })}`;
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
      
      // Build query
      const query = db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .leftJoin('users as u', 'ml.seller_id', 'u.id')
        .where('ml.status', 'active');
      
      // Apply filters
      if (filters.eventId) {
        query.where('ml.event_id', filters.eventId);
      }
      
      if (filters.venueId) {
        query.where('ml.venue_id', filters.venueId);
      }
      
      if (filters.minPrice !== undefined) {
        query.where('ml.price', '>=', filters.minPrice);
      }
      
      if (filters.maxPrice !== undefined) {
        query.where('ml.price', '<=', filters.maxPrice);
      }
      
      if (filters.sellerId) {
        query.where('ml.seller_id', filters.sellerId);
      }
      
      if (filters.dateFrom) {
        query.where('e.start_date', '>=', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query.where('e.start_date', '<=', filters.dateTo);
      }
      
      // Count total
      const countQuery = query.clone();
      const totalResult = await countQuery.count('* as count');
      const total = parseInt(totalResult[0].count as string, 10);
      
      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query.limit(pagination.limit).offset(offset);
      
      // Apply sorting
      const sortBy = pagination.sortBy || 'ml.listed_at';
      const sortOrder = pagination.sortOrder || 'desc';
      query.orderBy(sortBy, sortOrder);
      
      // Select fields
      const listings = await query.select(
        'ml.*',
        'e.name as event_name',
        'e.start_date as event_date',
        'v.name as venue_name',
        'u.username as seller_username'
      );
      
      // Cache results
      await cache.set(cacheKey, JSON.stringify({ listings, total }), { ttl: SEARCH_CACHE_TTL });
      
      return { listings, total };
    } catch (error) {
      logger.error('Error searching listings:', error);
      return { listings: [], total: 0 };
    }
  }
  
  async searchByEvent(eventId: string): Promise<ListingWithDetails[]> {
    try {
      const result = await this.searchListings(
        { eventId, status: 'active' },
        { page: 1, limit: 100, sortBy: 'price', sortOrder: 'asc' }
      );
      
      return result.listings;
    } catch (error) {
      logger.error('Error searching by event:', error);
      return [];
    }
  }
  
  async getTrending(limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get trending listings based on recent views/activity
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .where('e.start_date', '>', new Date())
        .orderBy('ml.view_count', 'desc')
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting trending listings:', error);
      return [];
    }
  }
  
  async getRecommendations(userId: string, limit: number = 10): Promise<ListingWithDetails[]> {
    try {
      // Get user's purchase history to understand preferences
      const userHistory = await db('marketplace_transfers')
        .where('buyer_id', userId)
        .select('event_id')
        .distinct('event_id');
      
      const eventIds = userHistory.map(h => h.event_id);
      
      if (eventIds.length === 0) {
        // Return trending if no history
        return this.getTrending(limit);
      }
      
      // Find similar events
      const listings = await db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .where('ml.status', 'active')
        .whereIn('ml.venue_id', function() {
          this.select('venue_id')
            .from('events')
            .whereIn('id', eventIds);
        })
        .whereNotIn('ml.event_id', eventIds)
        .limit(limit)
        .select(
          'ml.*',
          'e.name as event_name',
          'e.start_date as event_date',
          'v.name as venue_name'
        );
      
      return listings;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      return [];
    }
  }
}

export const SearchService = SearchServiceClass;
export const searchService = new SearchServiceClass();
```

### FILE: src/services/dispute.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError, NotFoundError } from '../utils/errors';

class DisputeServiceClass {
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    reason: string,
    description?: string,
    evidence?: any
  ) {
    try {
      const transfer = await db('marketplace_transfers')
        .where('id', transferId)
        .first();
      
      if (!transfer) {
        throw new NotFoundError('Transfer not found');
      }
      
      const respondentId = initiatorId === transfer.buyer_id 
        ? transfer.seller_id 
        : transfer.buyer_id;
      
      const dispute = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db('marketplace_disputes').insert(dispute);
      
      if (evidence) {
        await this.addEvidence(dispute.id, initiatorId, 'text', JSON.stringify(evidence));
      }
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(disputeId: string, userId: string, type: string, content: string, metadata?: any) {
    try {
      await db('dispute_evidence').insert({
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: userId,
        evidence_type: type,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        submitted_at: new Date()
      });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string) {
    try {
      return await db('marketplace_disputes')
        .where('id', disputeId)
        .first();
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getUserDisputes(userId: string) {
    try {
      return await db('marketplace_disputes')
        .where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error getting user disputes:', error);
      return [];
    }
  }
}

export const disputeService = new DisputeServiceClass();
```

### FILE: src/services/tax-reporting.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

class TaxReportingServiceClass {
  async recordSale(
    sellerId: string,
    transferId: string,
    saleAmountCents: number,
    platformFeeCents: number
  ) {
    try {
      await db('taxable_transactions').insert({
        id: uuidv4(),
        seller_id: sellerId,
        transfer_id: transferId,
        sale_amount: saleAmountCents,
        platform_fee: platformFeeCents,
        net_amount: saleAmountCents - platformFeeCents,
        transaction_date: new Date(),
        reported: false
      });
      logger.info(`Taxable transaction recorded for seller ${sellerId}`);
    } catch (error) {
      logger.error('Error recording sale:', error);
      throw error;
    }
  }

  async getYearlyReport(sellerId: string, year: number) {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      const transactions = await db('marketplace_transfers')
        .where('seller_id', sellerId)
        .where('status', 'completed')
        .whereBetween('transferred_at', [startDate, endDate])
        .select('*');

      if (transactions.length === 0) {
        return null;
      }

      // Sum amounts (already in cents as integers)
      const totalSalesCents = transactions.reduce((sum: number, t: any) => sum + parseInt(t.amount || 0), 0);
      const totalFeesCents = transactions.reduce((sum: number, t: any) => sum + parseInt(t.platform_fee || 0), 0);

      return {
        id: uuidv4(),
        seller_id: sellerId,
        year,
        total_sales: totalSalesCents,
        total_transactions: transactions.length,
        total_fees_paid: totalFeesCents,
        net_proceeds: totalSalesCents - totalFeesCents,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating yearly report:', error);
      return null;
    }
  }

  async generate1099K(sellerId: string, year: number) {
    try {
      const report = await this.getYearlyReport(sellerId, year);

      if (!report) {
        return null;
      }

      const irsThresholdCents = 60000; // $600 in cents

      if (report.net_proceeds < irsThresholdCents) {
        return {
          required: false,
          reason: `Net proceeds ($${report.net_proceeds / 100}) below IRS threshold ($${irsThresholdCents / 100})`
        };
      }

      return {
        required: true,
        form_type: '1099-K',
        tax_year: year,
        gross_amount: report.total_sales,
        transactions_count: report.total_transactions,
        net_proceeds: report.net_proceeds,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return null;
    }
  }

  async getReportableTransactions(sellerId: string, year: number) {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      return await db('marketplace_transfers')
        .where('seller_id', sellerId)
        .where('status', 'completed')
        .whereBetween('transferred_at', [startDate, endDate])
        .orderBy('transferred_at', 'desc');
    } catch (error) {
      logger.error('Error getting reportable transactions:', error);
      return [];
    }
  }
}

export const taxReportingService = new TaxReportingServiceClass();
```

### FILE: src/services/validation.service.ts
```typescript
import { listingModel } from '../models/listing.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { constants } from '../config';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  ForbiddenError, 
  NotFoundError 
} from '../utils/errors';

export interface ValidateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;
  originalFaceValue: number;
  eventStartTime: Date;
}

export interface ValidateTransferInput {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  eventStartTime: Date;
}

export interface PriceValidationResult {
  valid: boolean;
  reason?: string;
  minPrice?: number;
  maxPrice?: number;
  priceMultiplier?: number;
}

export class ValidationService {
  private log = logger.child({ component: 'ValidationService' });

  /**
   * Validate if a ticket can be listed
   */
  async validateListingCreation(input: ValidateListingInput): Promise<void> {
    // 1. Check if ticket is already listed
    const existingListing = await listingModel.findByTicketId(input.ticketId);
    if (existingListing) {
      throw new ValidationError('Ticket is already listed');
    }

    // 2. Get venue settings
    const venueSettings = await venueSettingsModel.findByVenueId(input.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 3. Validate price
    const priceValidation = this.validatePrice(
      input.price,
      input.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );

    if (!priceValidation.valid) {
      throw new ValidationError(priceValidation.reason || 'Invalid price');
    }

    // 4. Check listing timing
    this.validateListingTiming(
      input.eventStartTime,
      venueSettings.listingAdvanceHours
    );

    // 5. Check user listing limits
    await this.validateUserListingLimits(
      input.sellerId,
      input.eventId,
      venueSettings.maxListingsPerUserPerEvent,
      venueSettings.maxListingsPerUserTotal
    );

    this.log.info('Listing validation passed', {
      ticketId: input.ticketId,
      price: input.price,
      priceMultiplier: priceValidation.priceMultiplier,
    });
  }

  /**
   * Validate if a transfer can proceed
   */
  async validateTransfer(input: ValidateTransferInput): Promise<void> {
    // 1. Get venue settings
    const listing = await listingModel.findById(input.listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.status !== 'active') {
      throw new ValidationError(`Listing is ${listing.status}`);
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 2. Check transfer timing
    this.validateTransferTiming(
      input.eventStartTime,
      venueSettings.transferCutoffHours
    );

    // 3. Validate buyer is not seller
    if (input.buyerId === listing.sellerId) {
      throw new ValidationError('Cannot buy your own listing');
    }

    // 4. Check if listing has expired
    if (listing.expiresAt && new Date() > listing.expiresAt) {
      throw new ValidationError('Listing has expired');
    }

    this.log.info('Transfer validation passed', {
      listingId: input.listingId,
      buyerId: input.buyerId,
    });
  }

  /**
   * Validate listing price
   */
  validatePrice(
    price: number,
    originalFaceValue: number,
    minMultiplier: number,
    maxMultiplier: number,
    allowBelowFace: boolean
  ): PriceValidationResult {
    const priceMultiplier = price / originalFaceValue;
    const minPrice = originalFaceValue * minMultiplier;
    const maxPrice = originalFaceValue * maxMultiplier;

    // Check minimum price
    if (!allowBelowFace && price < originalFaceValue) {
      return {
        valid: false,
        reason: 'Price cannot be below face value',
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price < minPrice) {
      return {
        valid: false,
        reason: `Price must be at least ${minMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check maximum price
    if (price > maxPrice) {
      return {
        valid: false,
        reason: `Price cannot exceed ${maxMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check absolute limits
    if (price < constants.LISTING_CONSTRAINTS.MIN_PRICE) {
      return {
        valid: false,
        reason: `Price must be at least $${constants.LISTING_CONSTRAINTS.MIN_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price > constants.LISTING_CONSTRAINTS.MAX_PRICE) {
      return {
        valid: false,
        reason: `Price cannot exceed $${constants.LISTING_CONSTRAINTS.MAX_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    return {
      valid: true,
      minPrice,
      maxPrice,
      priceMultiplier,
    };
  }

  /**
   * Validate listing timing
   */
  private validateListingTiming(
    eventStartTime: Date,
    listingAdvanceHours: number
  ): void {
    const now = new Date();
    const maxListingTime = new Date(eventStartTime);
    maxListingTime.setHours(maxListingTime.getHours() - listingAdvanceHours);

    if (now < maxListingTime) {
      throw new ValidationError(
        `Cannot list tickets more than ${listingAdvanceHours} hours before event`
      );
    }

    if (now >= eventStartTime) {
      throw new ValidationError('Cannot list tickets for past events');
    }
  }

  /**
   * Validate transfer timing
   */
  private validateTransferTiming(
    eventStartTime: Date,
    transferCutoffHours: number
  ): void {
    const now = new Date();
    const cutoffTime = new Date(eventStartTime);
    cutoffTime.setHours(cutoffTime.getHours() - transferCutoffHours);

    if (now >= cutoffTime) {
      throw new ValidationError(
        `Transfers are not allowed within ${transferCutoffHours} hours of event start`
      );
    }
  }

  /**
   * Validate user listing limits
   */
  private async validateUserListingLimits(
    userId: string,
    eventId: string,
    maxPerEvent: number,
    maxTotal: number
  ): Promise<void> {
    // Check per-event limit
    const eventListings = await listingModel.countByUserId(userId, eventId);
    if (eventListings >= maxPerEvent) {
      throw new ValidationError(
        `You can only have ${maxPerEvent} active listings per event`
      );
    }

    // Check total limit
    const totalListings = await listingModel.countByUserId(userId);
    if (totalListings >= maxTotal) {
      throw new ValidationError(
        `You can only have ${maxTotal} total active listings`
      );
    }
  }

  /**
   * Validate wallet address
   */
  validateWalletAddress(address: string): boolean {
    // Basic Solana address validation
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  }

  /**
   * Check if price update is valid
   */
  async validatePriceUpdate(
    listingId: string,
    newPrice: number,
    userId: string
  ): Promise<PriceValidationResult> {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    if (listing.status !== 'active') {
      throw new ValidationError('Can only update active listings');
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    return this.validatePrice(
      newPrice,
      listing.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );
  }
}

export const validationService = new ValidationService();
```

### FILE: src/services/transfer.service.ts
```typescript
import { transferModel, CreateTransferInput } from '../models/transfer.model';
import { listingModel } from '../models/listing.model';
import { feeModel } from '../models/fee.model';
import { validationService } from './validation.service';
import { blockchainService } from './blockchain.service';
import { listingService } from './listing.service';
import { logger } from '../utils/logger';
import { constants } from '../config';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';

export interface InitiateTransferDto {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  eventStartTime: Date;
}

export interface CompleteTransferDto {
  transferId: string;
  blockchainSignature: string;
}

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  /**
   * Initiate a transfer
   */
  async initiateTransfer(dto: InitiateTransferDto) {
    // Get listing details
    const listing = await listingModel.findById(dto.listingId);
    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Validate transfer
    await validationService.validateTransfer({
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      buyerWallet: dto.buyerWallet,
      eventStartTime: dto.eventStartTime,
    });

    // Check buyer has sufficient balance
    const balance = await blockchainService.getWalletBalance(dto.buyerWallet);
    const requiredAmount = this.calculateTotalAmount(listing.price, dto.paymentCurrency);

    if (balance < requiredAmount) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Create transfer record
    const transferInput: CreateTransferInput = {
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      sellerId: listing.sellerId,
      eventId: listing.eventId,
      venueId: listing.venueId,
      buyerWallet: dto.buyerWallet,
      sellerWallet: listing.walletAddress,
      paymentCurrency: dto.paymentCurrency,
      paymentAmount: listing.price,
      usdValue: listing.price, // Assuming USD for now
    };

    const transfer = await transferModel.create(transferInput);

    // Create fee record
    await feeModel.create({
      transferId: transfer.id,
      salePrice: listing.price,
      platformFeePercentage: constants.FEES.PLATFORM_FEE_PERCENTAGE,
      venueFeePercentage: constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE,
    });

    this.log.info('Transfer initiated', {
      transferId: transfer.id,
      listingId: dto.listingId,
      buyerId: dto.buyerId,
    });

    return transfer;
  }

  /**
   * Complete a transfer after blockchain confirmation
   */
  async completeTransfer(dto: CompleteTransferDto) {
    const transfer = await transferModel.findById(dto.transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    if (transfer.status !== 'initiated' && transfer.status !== 'pending') {
      throw new ValidationError(`Cannot complete transfer with status: ${transfer.status}`);
    }

    // Validate blockchain transaction
    const isValid = await blockchainService.validateTransaction(dto.blockchainSignature);
    if (!isValid) {
      throw new ValidationError('Invalid blockchain signature');
    }

    // Get current block height
    const blockHeight = await blockchainService.getConnection().getBlockHeight();

    // Update transfer with blockchain data
    await transferModel.updateBlockchainData(
      transfer.id,
      dto.blockchainSignature,
      blockHeight,
      blockchainService.calculateNetworkFee()
    );

    // Mark transfer as completed
    await transferModel.updateStatus(transfer.id, 'completed');

    // Mark listing as sold - FIXED: Added buyerId parameter
    await listingService.markListingAsSold(transfer.listingId, transfer.buyerId);

    // Update fee collection status
    const fee = await feeModel.findByTransferId(transfer.id);
    if (fee) {
      await feeModel.updateFeeCollection(
        fee.id,
        true, // platform fee collected
        true, // venue fee collected
        dto.blockchainSignature,
        dto.blockchainSignature
      );
    }

    this.log.info('Transfer completed', {
      transferId: transfer.id,
      signature: dto.blockchainSignature,
    });

    return transfer;
  }

  /**
   * Handle failed transfer
   */
  async failTransfer(transferId: string, reason: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    await transferModel.updateStatus(transfer.id, 'failed', {
      failureReason: reason,
    });

    // Reactivate the listing
    await listingModel.updateStatus(transfer.listingId, 'active');

    this.log.error('Transfer failed', {
      transferId,
      reason,
    });
  }

  /**
   * Get transfer by ID
   */
  async getTransferById(transferId: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }
    return transfer;
  }

  /**
   * Get transfers for a user
   */
  async getUserTransfers(userId: string, type: 'buyer' | 'seller', limit = 20, offset = 0) {
    if (type === 'buyer') {
      return await transferModel.findByBuyerId(userId, limit, offset);
    } else {
      return await transferModel.findBySellerId(userId, limit, offset);
    }
  }

  /**
   * Calculate total amount including fees
   */
  private calculateTotalAmount(price: number, currency: 'USDC' | 'SOL'): number {
    const networkFee = blockchainService.calculateNetworkFee();

    if (currency === 'USDC') {
      // For USDC, add network fee in SOL equivalent
      return price + (networkFee * 50); // Assuming 1 SOL = $50
    } else {
      // For SOL, convert price to SOL and add network fee
      const priceInSol = price / 50; // Assuming 1 SOL = $50
      return priceInSol + networkFee;
    }
  }
}

export const transferService = new TransferService();
```

