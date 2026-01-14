import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { Counter, Histogram } from 'prom-client';
import logger from '../utils/logger';

export interface IPFSUploadResult {
  ipfsHash: string;
  ipfsUrl: string;
  pinataUrl?: string;
  provider: string;
}

export interface IPFSMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
  };
}

// =============================================================================
// METRICS
// =============================================================================

const ipfsUploadCounter = new Counter({
  name: 'minting_ipfs_uploads_total',
  help: 'Total IPFS uploads',
  labelNames: ['provider', 'type', 'status']
});

const ipfsUploadDuration = new Histogram({
  name: 'minting_ipfs_upload_duration_seconds',
  help: 'IPFS upload duration in seconds',
  labelNames: ['provider', 'type'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

const ipfsFailoverCounter = new Counter({
  name: 'minting_ipfs_failover_total',
  help: 'Total IPFS failovers to backup provider',
  labelNames: ['from_provider', 'to_provider', 'reason']
});

// =============================================================================
// IPFS SERVICE INTERFACE
// =============================================================================

/**
 * IPFS Service Interface
 */
export interface IPFSService {
  uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult>;
  uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult>;
  getGatewayUrl(ipfsHash: string): string;
  getName(): string;
}

// =============================================================================
// PINATA SERVICE
// =============================================================================

/**
 * Pinata IPFS Service Implementation
 */
class PinataService implements IPFSService {
  private apiKey: string;
  private secretApiKey: string;
  private jwt: string | null;
  private client: AxiosInstance;
  private gateway: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.PINATA_API_KEY || '';
    this.secretApiKey = process.env.PINATA_SECRET_API_KEY || '';
    this.jwt = process.env.PINATA_JWT || null;
    this.gateway = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud';
    this.timeout = parseInt(process.env.IPFS_UPLOAD_TIMEOUT_MS || '30000', 10);

    // Configure axios client
    this.client = axios.create({
      baseURL: 'https://api.pinata.cloud',
      timeout: this.timeout,
      headers: this.jwt
        ? {
            Authorization: `Bearer ${this.jwt}`
          }
        : {
            pinata_api_key: this.apiKey,
            pinata_secret_api_key: this.secretApiKey
          }
    });

    logger.info('Pinata IPFS service initialized', {
      gateway: this.gateway,
      authMethod: this.jwt ? 'JWT' : 'API Keys',
      timeout: this.timeout
    });
  }

  getName(): string {
    return 'pinata';
  }

  async uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult> {
    const end = ipfsUploadDuration.startTimer({ provider: 'pinata', type: 'json' });

    try {
      logger.info('Uploading JSON metadata to Pinata', {
        name: metadata.name
      });

      const response = await this.client.post('/pinning/pinJSONToIPFS', {
        pinataContent: metadata,
        pinataMetadata: {
          name: `${metadata.name}.json`,
          keyvalues: {
            type: 'nft-metadata',
            symbol: metadata.symbol
          }
        }
      });

      const ipfsHash = response.data.IpfsHash;
      const ipfsUrl = `ipfs://${ipfsHash}`;
      const pinataUrl = `${this.gateway}/ipfs/${ipfsHash}`;

      ipfsUploadCounter.inc({ provider: 'pinata', type: 'json', status: 'success' });
      end();

      logger.info('Successfully uploaded JSON to Pinata', {
        ipfsHash,
        ipfsUrl,
        pinataUrl
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl,
        provider: 'pinata'
      };
    } catch (error) {
      ipfsUploadCounter.inc({ provider: 'pinata', type: 'json', status: 'error' });
      end();

      logger.error('Failed to upload JSON to Pinata', {
        error: (error as Error).message,
        metadata: metadata.name
      });
      throw new Error(`Pinata upload failed: ${(error as Error).message}`);
    }
  }

  async uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult> {
    const end = ipfsUploadDuration.startTimer({ provider: 'pinata', type: 'file' });

    try {
      logger.info('Uploading file to Pinata', { filename });

      const formData = new FormData();
      formData.append('file', file, filename);
      formData.append(
        'pinataMetadata',
        JSON.stringify({
          name: filename
        })
      );

      const response = await this.client.post('/pinning/pinFileToIPFS', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      const ipfsHash = response.data.IpfsHash;
      const ipfsUrl = `ipfs://${ipfsHash}`;
      const pinataUrl = `${this.gateway}/ipfs/${ipfsHash}`;

      ipfsUploadCounter.inc({ provider: 'pinata', type: 'file', status: 'success' });
      end();

      logger.info('Successfully uploaded file to Pinata', {
        ipfsHash,
        ipfsUrl,
        filename
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl,
        provider: 'pinata'
      };
    } catch (error) {
      ipfsUploadCounter.inc({ provider: 'pinata', type: 'file', status: 'error' });
      end();

      logger.error('Failed to upload file to Pinata', {
        error: (error as Error).message,
        filename
      });
      throw new Error(`Pinata file upload failed: ${(error as Error).message}`);
    }
  }

  getGatewayUrl(ipfsHash: string): string {
    // Remove ipfs:// prefix if present
    const hash = ipfsHash.replace('ipfs://', '');
    return `${this.gateway}/ipfs/${hash}`;
  }
}

// =============================================================================
// NFT.STORAGE SERVICE
// =============================================================================

/**
 * NFT.Storage IPFS Service Implementation
 */
class NFTStorageService implements IPFSService {
  private apiKey: string;
  private client: AxiosInstance;
  private gateway: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.NFT_STORAGE_API_KEY || '';
    this.gateway = 'https://nftstorage.link';
    this.timeout = parseInt(process.env.IPFS_UPLOAD_TIMEOUT_MS || '30000', 10);

    this.client = axios.create({
      baseURL: 'https://api.nft.storage',
      timeout: this.timeout,
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    logger.info('NFT.Storage IPFS service initialized', {
      timeout: this.timeout
    });
  }

  getName(): string {
    return 'nft.storage';
  }

  async uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult> {
    const end = ipfsUploadDuration.startTimer({ provider: 'nft.storage', type: 'json' });

    try {
      logger.info('Uploading JSON metadata to NFT.Storage', {
        name: metadata.name
      });

      const jsonBuffer = Buffer.from(JSON.stringify(metadata));
      const formData = new FormData();
      formData.append('file', jsonBuffer, { filename: `${metadata.name}.json`, contentType: 'application/json' });

      const response = await this.client.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const ipfsHash = response.data.value.cid;
      const ipfsUrl = `ipfs://${ipfsHash}`;

      ipfsUploadCounter.inc({ provider: 'nft.storage', type: 'json', status: 'success' });
      end();

      logger.info('Successfully uploaded JSON to NFT.Storage', {
        ipfsHash,
        ipfsUrl
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl: this.getGatewayUrl(ipfsHash),
        provider: 'nft.storage'
      };
    } catch (error) {
      ipfsUploadCounter.inc({ provider: 'nft.storage', type: 'json', status: 'error' });
      end();

      logger.error('Failed to upload JSON to NFT.Storage', {
        error: (error as Error).message
      });
      throw new Error(`NFT.Storage upload failed: ${(error as Error).message}`);
    }
  }

  async uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult> {
    const end = ipfsUploadDuration.startTimer({ provider: 'nft.storage', type: 'file' });

    try {
      logger.info('Uploading file to NFT.Storage', { filename });

      const formData = new FormData();
      formData.append('file', file, filename);

      const response = await this.client.post('/upload', formData);

      const ipfsHash = response.data.value.cid;
      const ipfsUrl = `ipfs://${ipfsHash}`;

      ipfsUploadCounter.inc({ provider: 'nft.storage', type: 'file', status: 'success' });
      end();

      logger.info('Successfully uploaded file to NFT.Storage', {
        ipfsHash,
        filename
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl: this.getGatewayUrl(ipfsHash),
        provider: 'nft.storage'
      };
    } catch (error) {
      ipfsUploadCounter.inc({ provider: 'nft.storage', type: 'file', status: 'error' });
      end();

      logger.error('Failed to upload file to NFT.Storage', {
        error: (error as Error).message,
        filename
      });
      throw new Error(`NFT.Storage file upload failed: ${(error as Error).message}`);
    }
  }

  getGatewayUrl(ipfsHash: string): string {
    const hash = ipfsHash.replace('ipfs://', '');
    return `${this.gateway}/ipfs/${hash}`;
  }
}

// =============================================================================
// IPFS SERVICE WITH FAILOVER
// =============================================================================

/**
 * IPFS Service with automatic failover between providers
 * Tries primary provider first, falls back to secondary on failure
 */
class IPFSServiceWithFailover implements IPFSService {
  private primary: IPFSService;
  private fallback: IPFSService | null;
  private maxRetries: number;

  constructor(primary: IPFSService, fallback: IPFSService | null = null) {
    this.primary = primary;
    this.fallback = fallback;
    this.maxRetries = parseInt(process.env.IPFS_MAX_RETRIES || '2', 10);

    logger.info('IPFS service with failover initialized', {
      primary: primary.getName(),
      fallback: fallback?.getName() || 'none',
      maxRetries: this.maxRetries
    });
  }

  getName(): string {
    return `${this.primary.getName()}+failover`;
  }

  async uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult> {
    // Try primary provider with retries
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.primary.uploadJSON(metadata);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Primary IPFS upload attempt ${attempt} failed`, {
          provider: this.primary.getName(),
          attempt,
          maxRetries: this.maxRetries,
          error: lastError.message,
          metadata: metadata.name
        });
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    // Try fallback provider if available
    if (this.fallback) {
      logger.info('Failing over to backup IPFS provider', {
        from: this.primary.getName(),
        to: this.fallback.getName(),
        reason: lastError?.message || 'unknown'
      });

      ipfsFailoverCounter.inc({
        from_provider: this.primary.getName(),
        to_provider: this.fallback.getName(),
        reason: this.categorizeError(lastError)
      });

      try {
        return await this.fallback.uploadJSON(metadata);
      } catch (fallbackError) {
        logger.error('Fallback IPFS upload also failed', {
          provider: this.fallback.getName(),
          error: (fallbackError as Error).message
        });
        throw new Error(`All IPFS providers failed. Primary: ${lastError?.message}, Fallback: ${(fallbackError as Error).message}`);
      }
    }

    // No fallback available
    throw lastError || new Error('IPFS upload failed');
  }

  async uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult> {
    // Try primary provider with retries
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.primary.uploadFile(file, filename);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Primary IPFS file upload attempt ${attempt} failed`, {
          provider: this.primary.getName(),
          attempt,
          maxRetries: this.maxRetries,
          error: lastError.message,
          filename
        });
        
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    // Try fallback provider if available
    if (this.fallback) {
      logger.info('Failing over to backup IPFS provider for file upload', {
        from: this.primary.getName(),
        to: this.fallback.getName(),
        reason: lastError?.message || 'unknown'
      });

      ipfsFailoverCounter.inc({
        from_provider: this.primary.getName(),
        to_provider: this.fallback.getName(),
        reason: this.categorizeError(lastError)
      });

      try {
        return await this.fallback.uploadFile(file, filename);
      } catch (fallbackError) {
        logger.error('Fallback IPFS file upload also failed', {
          provider: this.fallback.getName(),
          error: (fallbackError as Error).message
        });
        throw new Error(`All IPFS providers failed. Primary: ${lastError?.message}, Fallback: ${(fallbackError as Error).message}`);
      }
    }

    throw lastError || new Error('IPFS file upload failed');
  }

  getGatewayUrl(ipfsHash: string): string {
    return this.primary.getGatewayUrl(ipfsHash);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private categorizeError(error: Error | null): string {
    if (!error) return 'unknown';
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('rate limit') || msg.includes('429')) return 'rate_limit';
    if (msg.includes('unauthorized') || msg.includes('401')) return 'auth_error';
    if (msg.includes('network') || msg.includes('econnrefused')) return 'network_error';
    return 'unknown';
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

// Cached service instance
let ipfsServiceInstance: IPFSService | null = null;

/**
 * Get configured IPFS service instance with failover support
 */
export function getIPFSService(): IPFSService {
  if (ipfsServiceInstance) {
    return ipfsServiceInstance;
  }

  const provider = process.env.IPFS_PROVIDER || 'pinata';
  const enableFailover = process.env.IPFS_ENABLE_FAILOVER !== 'false';

  let primary: IPFSService;
  let fallback: IPFSService | null = null;

  // Create primary service
  switch (provider.toLowerCase()) {
    case 'pinata':
      primary = new PinataService();
      // Use NFT.Storage as fallback if API key is configured
      if (enableFailover && process.env.NFT_STORAGE_API_KEY) {
        fallback = new NFTStorageService();
      }
      break;
    case 'nft.storage':
      primary = new NFTStorageService();
      // Use Pinata as fallback if API keys are configured
      if (enableFailover && (process.env.PINATA_JWT || process.env.PINATA_API_KEY)) {
        fallback = new PinataService();
      }
      break;
    default:
      logger.warn(`Unknown IPFS provider: ${provider}, defaulting to Pinata`);
      primary = new PinataService();
  }

  // Wrap with failover if fallback is available
  if (fallback) {
    ipfsServiceInstance = new IPFSServiceWithFailover(primary, fallback);
  } else {
    // Still wrap for retry logic even without fallback
    ipfsServiceInstance = new IPFSServiceWithFailover(primary, null);
  }

  return ipfsServiceInstance;
}

/**
 * Get raw service without failover (for testing or specific use cases)
 */
export function getIPFSServiceDirect(provider: 'pinata' | 'nft.storage'): IPFSService {
  switch (provider) {
    case 'pinata':
      return new PinataService();
    case 'nft.storage':
      return new NFTStorageService();
    default:
      throw new Error(`Unknown IPFS provider: ${provider}`);
  }
}

/**
 * Validate IPFS configuration
 */
export function validateIPFSConfig(): void {
  const provider = process.env.IPFS_PROVIDER || 'pinata';

  if (provider === 'pinata') {
    const hasJWT = !!process.env.PINATA_JWT;
    const hasApiKeys = !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_API_KEY);

    if (!hasJWT && !hasApiKeys) {
      throw new Error(
        'Pinata IPFS configuration incomplete. ' +
        'Provide either PINATA_JWT or (PINATA_API_KEY + PINATA_SECRET_API_KEY)'
      );
    }

    logger.info('Pinata IPFS configuration validated', {
      authMethod: hasJWT ? 'JWT' : 'API Keys',
      hasFailover: !!process.env.NFT_STORAGE_API_KEY
    });
  } else if (provider === 'nft.storage') {
    if (!process.env.NFT_STORAGE_API_KEY) {
      throw new Error('NFT.Storage configuration incomplete. Provide NFT_STORAGE_API_KEY');
    }

    logger.info('NFT.Storage IPFS configuration validated', {
      hasFailover: !!(process.env.PINATA_JWT || process.env.PINATA_API_KEY)
    });
  }
}

/**
 * Test IPFS connectivity
 */
export async function testIPFSConnection(): Promise<boolean> {
  try {
    const service = getIPFSService();
    
    // Upload a simple test metadata
    const testMetadata: IPFSMetadata = {
      name: 'Test',
      symbol: 'TEST',
      description: 'IPFS connection test',
      image: 'https://example.com/test.png',
      attributes: [
        { trait_type: 'Test', value: 'Connection Test' }
      ]
    };

    const result = await service.uploadJSON(testMetadata);
    
    logger.info('IPFS connection test successful', {
      ipfsHash: result.ipfsHash,
      provider: result.provider
    });

    return true;
  } catch (error) {
    logger.error('IPFS connection test failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Get IPFS service health status
 */
export function getIPFSServiceStatus(): {
  provider: string;
  hasFailover: boolean;
  failoverProvider: string | null;
  timeout: number;
  maxRetries: number;
} {
  const provider = process.env.IPFS_PROVIDER || 'pinata';
  const enableFailover = process.env.IPFS_ENABLE_FAILOVER !== 'false';
  
  let hasFailover = false;
  let failoverProvider: string | null = null;

  if (enableFailover) {
    if (provider === 'pinata' && process.env.NFT_STORAGE_API_KEY) {
      hasFailover = true;
      failoverProvider = 'nft.storage';
    } else if (provider === 'nft.storage' && (process.env.PINATA_JWT || process.env.PINATA_API_KEY)) {
      hasFailover = true;
      failoverProvider = 'pinata';
    }
  }

  return {
    provider,
    hasFailover,
    failoverProvider,
    timeout: parseInt(process.env.IPFS_UPLOAD_TIMEOUT_MS || '30000', 10),
    maxRetries: parseInt(process.env.IPFS_MAX_RETRIES || '2', 10)
  };
}
