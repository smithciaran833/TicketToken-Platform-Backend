// Fee percentages
export const FEES = {
  PLATFORM_FEE_PERCENTAGE: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '5.00'),
  DEFAULT_VENUE_FEE_PERCENTAGE: parseFloat(process.env.DEFAULT_VENUE_FEE_PERCENTAGE || '5.00'),
  MAX_TOTAL_FEE_PERCENTAGE: 20.00, // Platform + Venue combined max
  MIN_SELLER_PERCENTAGE: 80.00, // Seller gets at least 80%
} as const;

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_VENUE_ROYALTY_SPLIT: process.env.ENABLE_VENUE_ROYALTY_SPLIT === 'true',
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
  FEATURE_FLAGS,
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
