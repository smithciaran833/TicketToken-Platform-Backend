// Platform configuration constants
export const PLATFORM_FEE_PERCENTAGE = 2.5;
export const MIN_LISTING_PRICE = 1.00;
export const MAX_LISTING_PRICE = 10000.00;

// Listing rules
export const DEFAULT_LISTING_DURATION_DAYS = 30;
export const MAX_PRICE_MARKUP_PERCENTAGE = 300;
export const LISTING_EXPIRY_WARNING_HOURS = 24;

// Transfer rules  
export const TRANSFER_TIMEOUT_MINUTES = 15;
export const BUYER_CONFIRMATION_TIMEOUT_MINUTES = 30;
export const MAX_CONCURRENT_TRANSFERS = 5;

// Anti-bot thresholds
export const MAX_PURCHASES_PER_HOUR = 10;
export const MAX_LISTINGS_PER_DAY = 50;
export const VELOCITY_CHECK_WINDOW_SECONDS = 60;
export const BOT_SCORE_THRESHOLD = 0.7;

// Cache TTLs (in seconds)
export const LISTING_CACHE_TTL = 300;
export const SEARCH_CACHE_TTL = 60;
export const USER_CACHE_TTL = 600;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
