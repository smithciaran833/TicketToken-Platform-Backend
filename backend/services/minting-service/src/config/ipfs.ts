import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger';

export interface IPFSUploadResult {
  ipfsHash: string;
  ipfsUrl: string;
  pinataUrl?: string;
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

/**
 * IPFS Service Interface
 */
export interface IPFSService {
  uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult>;
  uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult>;
  getGatewayUrl(ipfsHash: string): string;
}

/**
 * Pinata IPFS Service Implementation
 */
class PinataService implements IPFSService {
  private apiKey: string;
  private secretApiKey: string;
  private jwt: string | null;
  private client: AxiosInstance;
  private gateway: string;

  constructor() {
    this.apiKey = process.env.PINATA_API_KEY || '';
    this.secretApiKey = process.env.PINATA_SECRET_API_KEY || '';
    this.jwt = process.env.PINATA_JWT || null;
    this.gateway = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud';

    // Configure axios client
    this.client = axios.create({
      baseURL: 'https://api.pinata.cloud',
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
      authMethod: this.jwt ? 'JWT' : 'API Keys'
    });
  }

  async uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult> {
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

      logger.info('Successfully uploaded JSON to Pinata', {
        ipfsHash,
        ipfsUrl,
        pinataUrl
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl
      };
    } catch (error) {
      logger.error('Failed to upload JSON to Pinata', {
        error: (error as Error).message,
        metadata: metadata.name
      });
      throw new Error(`Pinata upload failed: ${(error as Error).message}`);
    }
  }

  async uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult> {
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

      logger.info('Successfully uploaded file to Pinata', {
        ipfsHash,
        ipfsUrl,
        filename
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl
      };
    } catch (error) {
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

/**
 * NFT.Storage IPFS Service Implementation
 */
class NFTStorageService implements IPFSService {
  private apiKey: string;
  private client: AxiosInstance;
  private gateway: string;

  constructor() {
    this.apiKey = process.env.NFT_STORAGE_API_KEY || '';
    this.gateway = 'https://nftstorage.link';

    this.client = axios.create({
      baseURL: 'https://api.nft.storage',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    logger.info('NFT.Storage IPFS service initialized');
  }

  async uploadJSON(metadata: IPFSMetadata): Promise<IPFSUploadResult> {
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

      logger.info('Successfully uploaded JSON to NFT.Storage', {
        ipfsHash,
        ipfsUrl
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl: this.getGatewayUrl(ipfsHash)
      };
    } catch (error) {
      logger.error('Failed to upload JSON to NFT.Storage', {
        error: (error as Error).message
      });
      throw new Error(`NFT.Storage upload failed: ${(error as Error).message}`);
    }
  }

  async uploadFile(file: Buffer, filename: string): Promise<IPFSUploadResult> {
    try {
      logger.info('Uploading file to NFT.Storage', { filename });

      const formData = new FormData();
      formData.append('file', file, filename);

      const response = await this.client.post('/upload', formData);

      const ipfsHash = response.data.value.cid;
      const ipfsUrl = `ipfs://${ipfsHash}`;

      logger.info('Successfully uploaded file to NFT.Storage', {
        ipfsHash,
        filename
      });

      return {
        ipfsHash,
        ipfsUrl,
        pinataUrl: this.getGatewayUrl(ipfsHash)
      };
    } catch (error) {
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

/**
 * Get configured IPFS service instance
 */
export function getIPFSService(): IPFSService {
  const provider = process.env.IPFS_PROVIDER || 'pinata';

  switch (provider.toLowerCase()) {
    case 'pinata':
      return new PinataService();
    case 'nft.storage':
      return new NFTStorageService();
    default:
      logger.warn(`Unknown IPFS provider: ${provider}, defaulting to Pinata`);
      return new PinataService();
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
      authMethod: hasJWT ? 'JWT' : 'API Keys'
    });
  } else if (provider === 'nft.storage') {
    if (!process.env.NFT_STORAGE_API_KEY) {
      throw new Error('NFT.Storage configuration incomplete. Provide NFT_STORAGE_API_KEY');
    }

    logger.info('NFT.Storage IPFS configuration validated');
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
      ipfsHash: result.ipfsHash
    });

    return true;
  } catch (error) {
    logger.error('IPFS connection test failed', {
      error: (error as Error).message
    });
    return false;
  }
}
