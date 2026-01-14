import { getIPFSService, IPFSMetadata } from '../config/ipfs';
import { retryAsync } from '../utils/solana';
import Redis from 'ioredis';
import logger from '../utils/logger';
import crypto from 'crypto';
import { Counter, Histogram } from 'prom-client';
import { EventEmitter } from 'events';

// =============================================================================
// METRICS
// =============================================================================

const ipfsUploadCounter = new Counter({
  name: 'minting_ipfs_uploads_total',
  help: 'Total IPFS uploads',
  labelNames: ['status', 'cached']
});

const ipfsUploadDuration = new Histogram({
  name: 'minting_ipfs_upload_duration_seconds',
  help: 'IPFS upload duration in seconds',
  labelNames: ['cached'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

const cidVerificationCounter = new Counter({
  name: 'minting_cid_verification_total',
  help: 'Total CID verifications',
  labelNames: ['status']
});

const userNotificationCounter = new Counter({
  name: 'minting_user_notifications_total',
  help: 'Total user notification events',
  labelNames: ['event_type', 'status']
});

// =============================================================================
// EVENT EMITTER FOR USER NOTIFICATIONS (#18)
// =============================================================================

/**
 * Event types for mint status notifications
 */
export type MintEventType = 
  | 'mint:queued'
  | 'mint:started'
  | 'mint:metadata_uploaded'
  | 'mint:transaction_sent'
  | 'mint:confirmed'
  | 'mint:completed'
  | 'mint:failed'
  | 'mint:retry';

export interface MintStatusEvent {
  eventType: MintEventType;
  ticketId: string;
  tenantId: string;
  userId?: string;
  orderId?: string;
  eventId?: string;
  timestamp: string;
  data?: {
    assetId?: string;
    signature?: string;
    metadataUri?: string;
    error?: string;
    attempt?: number;
    maxAttempts?: number;
    progress?: number; // 0-100 percentage
  };
}

/**
 * Mint status event emitter
 * Subscribe to receive real-time mint status updates for user notifications
 */
class MintStatusEmitter extends EventEmitter {
  private static instance: MintStatusEmitter;

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many listeners for WebSocket connections
  }

  static getInstance(): MintStatusEmitter {
    if (!MintStatusEmitter.instance) {
      MintStatusEmitter.instance = new MintStatusEmitter();
    }
    return MintStatusEmitter.instance;
  }

  /**
   * Emit a mint status event
   */
  emitMintStatus(event: MintStatusEvent): void {
    try {
      // Emit global event
      this.emit('status', event);

      // Emit tenant-specific event
      this.emit(`tenant:${event.tenantId}`, event);

      // Emit user-specific event if userId provided
      if (event.userId) {
        this.emit(`user:${event.userId}`, event);
      }

      // Emit ticket-specific event
      this.emit(`ticket:${event.ticketId}`, event);

      // Track metrics
      userNotificationCounter.inc({
        event_type: event.eventType,
        status: 'emitted'
      });

      logger.debug('Mint status event emitted', {
        eventType: event.eventType,
        ticketId: event.ticketId,
        tenantId: event.tenantId
      });
    } catch (error) {
      logger.error('Failed to emit mint status event', {
        eventType: event.eventType,
        ticketId: event.ticketId,
        error: (error as Error).message
      });
      userNotificationCounter.inc({
        event_type: event.eventType,
        status: 'error'
      });
    }
  }

  /**
   * Subscribe to all status events for a tenant
   */
  subscribeTenant(tenantId: string, callback: (event: MintStatusEvent) => void): void {
    this.on(`tenant:${tenantId}`, callback);
  }

  /**
   * Unsubscribe from tenant events
   */
  unsubscribeTenant(tenantId: string, callback: (event: MintStatusEvent) => void): void {
    this.off(`tenant:${tenantId}`, callback);
  }

  /**
   * Subscribe to status events for a specific user
   */
  subscribeUser(userId: string, callback: (event: MintStatusEvent) => void): void {
    this.on(`user:${userId}`, callback);
  }

  /**
   * Unsubscribe from user events
   */
  unsubscribeUser(userId: string, callback: (event: MintStatusEvent) => void): void {
    this.off(`user:${userId}`, callback);
  }

  /**
   * Subscribe to status events for a specific ticket
   */
  subscribeTicket(ticketId: string, callback: (event: MintStatusEvent) => void): void {
    this.on(`ticket:${ticketId}`, callback);
  }

  /**
   * Unsubscribe from ticket events
   */
  unsubscribeTicket(ticketId: string, callback: (event: MintStatusEvent) => void): void {
    this.off(`ticket:${ticketId}`, callback);
  }
}

// Export singleton instance
export const mintStatusEmitter = MintStatusEmitter.getInstance();

/**
 * Helper function to emit mint status
 */
export function emitMintStatus(
  eventType: MintEventType,
  ticketId: string,
  tenantId: string,
  options: {
    userId?: string;
    orderId?: string;
    eventId?: string;
    data?: MintStatusEvent['data'];
  } = {}
): void {
  const event: MintStatusEvent = {
    eventType,
    ticketId,
    tenantId,
    userId: options.userId,
    orderId: options.orderId,
    eventId: options.eventId,
    timestamp: new Date().toISOString(),
    data: options.data
  };

  mintStatusEmitter.emitMintStatus(event);
}

// =============================================================================
// CID VERIFICATION (#17)
// =============================================================================

/**
 * IPFS CID format validation patterns
 * CIDv0: Qm... (46 chars, base58btc)
 * CIDv1: b..., f..., etc (base32, base16, etc)
 */
const CID_PATTERNS = {
  v0: /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/,    // CIDv0 (base58btc)
  v1Base32: /^b[a-z2-7]{58}$/i,           // CIDv1 (base32)
  v1Base16: /^f[0-9a-fA-F]+$/,            // CIDv1 (base16)
  v1Base36: /^k[a-z0-9]+$/                // CIDv1 (base36)
};

/**
 * Validate IPFS CID format
 * @param cid - The CID to validate
 * @returns boolean indicating if CID format is valid
 */
export function isValidCidFormat(cid: string): boolean {
  if (!cid || typeof cid !== 'string') {
    return false;
  }

  // Check against known CID patterns
  return (
    CID_PATTERNS.v0.test(cid) ||
    CID_PATTERNS.v1Base32.test(cid) ||
    CID_PATTERNS.v1Base16.test(cid) ||
    CID_PATTERNS.v1Base36.test(cid)
  );
}

/**
 * Extract CID from various IPFS URI formats
 * Supports: ipfs://, /ipfs/, https://gateway.com/ipfs/
 */
export function extractCidFromUri(uri: string): string | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  // Pattern: ipfs://CID or ipfs://CID/path
  const ipfsSchemeMatch = uri.match(/^ipfs:\/\/([^\/\s]+)/);
  if (ipfsSchemeMatch) {
    return ipfsSchemeMatch[1];
  }

  // Pattern: /ipfs/CID or /ipfs/CID/path
  const pathMatch = uri.match(/\/ipfs\/([^\/\s]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Check if it's a raw CID
  if (isValidCidFormat(uri)) {
    return uri;
  }

  return null;
}

/**
 * Verify that an IPFS CID exists and is accessible
 * Attempts to fetch metadata to confirm availability
 */
export async function verifyCidExists(
  cid: string,
  timeoutMs: number = 10000
): Promise<{
  exists: boolean;
  contentType?: string;
  size?: number;
  error?: string;
}> {
  if (!isValidCidFormat(cid)) {
    cidVerificationCounter.inc({ status: 'invalid_format' });
    return {
      exists: false,
      error: 'Invalid CID format'
    };
  }

  try {
    const ipfsService = getIPFSService();
    
    // Try to fetch the content with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Most IPFS services have a way to check if content exists
      // We'll try to fetch just the headers or a small portion
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
      
      const response = await fetch(gatewayUrl, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        cidVerificationCounter.inc({ status: 'verified' });
        return {
          exists: true,
          contentType: response.headers.get('content-type') || undefined,
          size: response.headers.get('content-length') 
            ? parseInt(response.headers.get('content-length')!, 10)
            : undefined
        };
      } else {
        cidVerificationCounter.inc({ status: 'not_found' });
        return {
          exists: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
    
    cidVerificationCounter.inc({ status: isTimeout ? 'timeout' : 'error' });
    
    logger.warn('CID verification failed', {
      cid,
      error: errorMessage,
      timedOut: isTimeout
    });

    return {
      exists: false,
      error: errorMessage
    };
  }
}

/**
 * Verify CID and optionally validate content matches expected hash
 */
export async function verifyCidContent(
  cid: string,
  expectedContentHash?: string
): Promise<{
  valid: boolean;
  cid: string;
  contentHash?: string;
  error?: string;
}> {
  // First verify CID exists
  const existsResult = await verifyCidExists(cid);
  if (!existsResult.exists) {
    return {
      valid: false,
      cid,
      error: existsResult.error || 'CID not found'
    };
  }

  // If no expected hash, just verify existence
  if (!expectedContentHash) {
    return {
      valid: true,
      cid
    };
  }

  // Fetch content and verify hash
  try {
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const response = await fetch(gatewayUrl);
    
    if (!response.ok) {
      return {
        valid: false,
        cid,
        error: `Failed to fetch content: ${response.status}`
      };
    }

    const content = await response.text();
    const hash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    const isValid = hash === expectedContentHash;
    
    cidVerificationCounter.inc({ status: isValid ? 'content_verified' : 'content_mismatch' });

    return {
      valid: isValid,
      cid,
      contentHash: hash,
      error: isValid ? undefined : 'Content hash mismatch'
    };
  } catch (error) {
    return {
      valid: false,
      cid,
      error: (error as Error).message
    };
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// IPFS cache TTL (7 days - metadata doesn't change)
const IPFS_CACHE_TTL_SECONDS = 604800;

// Redis key prefix for IPFS cache
const IPFS_CACHE_PREFIX = 'ipfs:cache:';

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (error) => {
      logger.error('MetadataService Redis error', { error: error.message });
    });
  }
  return redisClient;
}

// =============================================================================
// CACHING UTILITIES
// =============================================================================

/**
 * Generate a deterministic cache key based on ticket and tenant
 */
function generateCacheKey(ticketId: string, tenantId?: string): string {
  const key = tenantId ? `${tenantId}:${ticketId}` : ticketId;
  return `${IPFS_CACHE_PREFIX}${key}`;
}

/**
 * Generate a content-based cache key (for identical metadata)
 */
function generateContentCacheKey(metadata: Record<string, any>): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(metadata))
    .digest('hex')
    .substring(0, 32);
  return `${IPFS_CACHE_PREFIX}content:${hash}`;
}

/**
 * Get cached IPFS URI for a ticket
 */
async function getCachedIPFSUri(cacheKey: string): Promise<string | null> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    return cached;
  } catch (error) {
    logger.warn('Failed to get IPFS cache', {
      cacheKey,
      error: (error as Error).message
    });
    return null;
  }
}

/**
 * Cache IPFS URI for a ticket
 */
async function cacheIPFSUri(cacheKey: string, uri: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(cacheKey, IPFS_CACHE_TTL_SECONDS, uri);
    logger.debug('Cached IPFS URI', { cacheKey, uri });
  } catch (error) {
    // Log but don't throw - caching is optional
    logger.warn('Failed to cache IPFS URI', {
      cacheKey,
      error: (error as Error).message
    });
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface TicketMetadata {
  eventName?: string;
  eventDate?: string;
  venue?: string;
  tier?: string;
  seatNumber?: string;
  image?: string;
  ticketId: string;
  orderId: string;
  eventId: string;
  tenantId?: string;  // Added for caching
}

// =============================================================================
// UPLOAD FUNCTIONS
// =============================================================================

/**
 * Upload ticket metadata to IPFS with caching
 * Returns cached URI if available, otherwise uploads and caches
 */
export async function uploadToIPFS(metadata: TicketMetadata): Promise<string> {
  // Generate cache key based on ticket ID (and tenant if available)
  const cacheKey = generateCacheKey(metadata.ticketId, metadata.tenantId);

  try {
    // Check cache first
    const cachedUri = await getCachedIPFSUri(cacheKey);
    if (cachedUri) {
      logger.info('📦 Using cached IPFS URI', {
        ticketId: metadata.ticketId,
        uri: cachedUri
      });
      return cachedUri;
    }

    logger.info('📤 Uploading metadata to IPFS', {
      ticketId: metadata.ticketId,
      eventName: metadata.eventName
    });

    // Prepare NFT metadata in standard format
    const nftMetadata: IPFSMetadata = {
      name: `Ticket #${metadata.ticketId}`,
      symbol: 'TCKT',
      description: metadata.eventName
        ? `Event ticket for ${metadata.eventName}`
        : 'Event ticket',
      image: metadata.image || 'https://arweave.net/placeholder-ticket-image',
      attributes: [
        {
          trait_type: 'Event ID',
          value: metadata.eventId
        },
        {
          trait_type: 'Order ID',
          value: metadata.orderId
        },
        {
          trait_type: 'Ticket ID',
          value: metadata.ticketId
        },
        {
          trait_type: 'Issue Date',
          value: new Date().toISOString()
        }
      ],
      properties: {
        files: [],
        category: 'ticket'
      }
    };

    // Add optional attributes
    if (metadata.eventName) {
      nftMetadata.attributes.push({
        trait_type: 'Event Name',
        value: metadata.eventName
      });
    }

    if (metadata.eventDate) {
      nftMetadata.attributes.push({
        trait_type: 'Event Date',
        value: metadata.eventDate
      });
    }

    if (metadata.venue) {
      nftMetadata.attributes.push({
        trait_type: 'Venue',
        value: metadata.venue
      });
    }

    if (metadata.tier) {
      nftMetadata.attributes.push({
        trait_type: 'Tier',
        value: metadata.tier
      });
    }

    if (metadata.seatNumber) {
      nftMetadata.attributes.push({
        trait_type: 'Seat',
        value: metadata.seatNumber
      });
    }

    // Upload to IPFS with retry logic
    const ipfsService = getIPFSService();
    const result = await retryAsync(
      () => ipfsService.uploadJSON(nftMetadata),
      3, // max retries
      2000, // initial delay
      2 // backoff multiplier
    );

    const ipfsUri = result.ipfsUrl;

    // Cache the URI for future requests
    await cacheIPFSUri(cacheKey, ipfsUri);
    
    // Also cache by content hash for deduplication
    const contentKey = generateContentCacheKey(nftMetadata);
    await cacheIPFSUri(contentKey, ipfsUri);

    logger.info('✅ Metadata uploaded to IPFS', {
      ticketId: metadata.ticketId,
      ipfsHash: result.ipfsHash,
      ipfsUrl: result.ipfsUrl,
      gatewayUrl: result.pinataUrl,
      cached: true
    });

    return ipfsUri;
  } catch (error) {
    logger.error('❌ Failed to upload metadata to IPFS', {
      ticketId: metadata.ticketId,
      error: (error as Error).message
    });
    throw new Error(`IPFS upload failed: ${(error as Error).message}`);
  }
}

/**
 * Upload raw metadata (generic) with content-based caching
 */
export async function uploadMetadata(
  metadata: Record<string, any>,
  cacheOptions?: { ticketId?: string; tenantId?: string }
): Promise<string> {
  // Generate content-based cache key
  const contentKey = generateContentCacheKey(metadata);
  
  // Also use ticket-based key if provided
  const ticketKey = cacheOptions?.ticketId 
    ? generateCacheKey(cacheOptions.ticketId, cacheOptions.tenantId)
    : null;

  try {
    // Check content cache first
    const contentCached = await getCachedIPFSUri(contentKey);
    if (contentCached) {
      logger.info('📦 Using content-cached IPFS URI', {
        ticketId: cacheOptions?.ticketId,
        uri: contentCached
      });
      return contentCached;
    }

    // Check ticket-based cache
    if (ticketKey) {
      const ticketCached = await getCachedIPFSUri(ticketKey);
      if (ticketCached) {
        logger.info('📦 Using ticket-cached IPFS URI', {
          ticketId: cacheOptions?.ticketId,
          uri: ticketCached
        });
        return ticketCached;
      }
    }

    // Upload to IPFS
    const ipfsService = getIPFSService();
    const result = await retryAsync(
      () => ipfsService.uploadJSON(metadata as IPFSMetadata),
      3,
      2000,
      2
    );

    const ipfsUri = result.ipfsUrl;

    // Cache by content
    await cacheIPFSUri(contentKey, ipfsUri);

    // Cache by ticket if provided
    if (ticketKey) {
      await cacheIPFSUri(ticketKey, ipfsUri);
    }

    return ipfsUri;
  } catch (error) {
    logger.error('Failed to upload metadata', {
      ticketId: cacheOptions?.ticketId,
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Invalidate IPFS cache for a ticket (use carefully)
 */
export async function invalidateIPFSCache(ticketId: string, tenantId?: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const cacheKey = generateCacheKey(ticketId, tenantId);
    await redis.del(cacheKey);
    logger.info('Invalidated IPFS cache', { ticketId, tenantId });
  } catch (error) {
    logger.error('Failed to invalidate IPFS cache', {
      ticketId,
      error: (error as Error).message
    });
  }
}

/**
 * Get cache status for debugging
 */
export async function getIPFSCacheStatus(ticketId: string, tenantId?: string): Promise<{
  cached: boolean;
  uri: string | null;
  ttl: number;
}> {
  try {
    const redis = getRedisClient();
    const cacheKey = generateCacheKey(ticketId, tenantId);
    const [uri, ttl] = await Promise.all([
      redis.get(cacheKey),
      redis.ttl(cacheKey)
    ]);
    
    return {
      cached: uri !== null,
      uri,
      ttl
    };
  } catch (error) {
    return {
      cached: false,
      uri: null,
      ttl: -1
    };
  }
}
