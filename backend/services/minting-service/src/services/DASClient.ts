import logger from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface DASAsset {
  id: string;
  interface: string;
  ownership: {
    owner: string;
    delegate?: string;
    frozen: boolean;
    delegated: boolean;
  };
  content: {
    metadata: {
      name: string;
      symbol: string;
      description?: string;
    };
    json_uri: string;
    files?: Array<{
      uri: string;
      mime: string;
    }>;
  };
  compression: {
    compressed: boolean;
    eligible: boolean;
    tree: string;
    leaf_index: number;
    seq: number;
    asset_hash: string;
    creator_hash: string;
    data_hash: string;
  };
  royalty: {
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  authorities: Array<{
    address: string;
    scopes: string[];
  }>;
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
}

export interface DASAssetProof {
  root: string;
  proof: string[];
  node_index: number;
  leaf: string;
  tree_id: string;
}

export interface DASSearchResult {
  total: number;
  limit: number;
  page: number;
  items: DASAsset[];
}

interface DASRPCResponse<T> {
  jsonrpc: string;
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

// =============================================================================
// DAS CLIENT
// =============================================================================

export class DASClient {
  private readonly dasUrl: string;
  private readonly timeout: number;

  constructor(options?: { url?: string; timeout?: number }) {
    this.dasUrl = options?.url || process.env.DAS_API_URL || process.env.SOLANA_RPC_URL || '';
    this.timeout = options?.timeout || 10000;

    if (!this.dasUrl) {
      throw new Error('DAS_API_URL or SOLANA_RPC_URL required for DAS operations');
    }

    logger.info('DAS Client initialized', {
      url: this.dasUrl.substring(0, 30) + '...'
    });
  }

  /**
   * Make a DAS RPC request
   */
  private async rpcRequest<T>(method: string, params: Record<string, any>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.dasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `das-${method}-${Date.now()}`,
          method,
          params
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`DAS API HTTP error: ${response.status} ${response.statusText}`);
      }

      const data: DASRPCResponse<T> = await response.json();

      if (data.error) {
        throw new Error(`DAS API error: ${data.error.message} (code: ${data.error.code})`);
      }

      if (!data.result) {
        throw new Error('DAS API returned empty result');
      }

      return data.result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ===========================================================================
  // ASSET OPERATIONS
  // ===========================================================================

  /**
   * Get a single asset by ID (mint address or asset ID for cNFTs)
   */
  async getAsset(assetId: string): Promise<DASAsset> {
    logger.debug('DAS: Getting asset', { assetId });

    const result = await this.rpcRequest<DASAsset>('getAsset', {
      id: assetId
    });

    logger.debug('DAS: Got asset', {
      assetId,
      name: result.content?.metadata?.name,
      owner: result.ownership?.owner
    });

    return result;
  }

  /**
   * Get proof for a compressed NFT (needed for transfers)
   */
  async getAssetProof(assetId: string): Promise<DASAssetProof> {
    logger.debug('DAS: Getting asset proof', { assetId });

    const result = await this.rpcRequest<DASAssetProof>('getAssetProof', {
      id: assetId
    });

    return result;
  }

  /**
   * Get multiple assets by IDs
   */
  async getAssetBatch(assetIds: string[]): Promise<DASAsset[]> {
    logger.debug('DAS: Getting asset batch', { count: assetIds.length });

    const result = await this.rpcRequest<DASAsset[]>('getAssetBatch', {
      ids: assetIds
    });

    return result;
  }

  // ===========================================================================
  // SEARCH OPERATIONS
  // ===========================================================================

  /**
   * Get all assets owned by an address
   */
  async getAssetsByOwner(
    ownerAddress: string,
    page: number = 1,
    limit: number = 100
  ): Promise<DASSearchResult> {
    logger.debug('DAS: Getting assets by owner', { ownerAddress, page, limit });

    const result = await this.rpcRequest<DASSearchResult>('getAssetsByOwner', {
      ownerAddress,
      page,
      limit,
      displayOptions: {
        showCompression: true
      }
    });

    logger.debug('DAS: Got assets by owner', {
      ownerAddress,
      total: result.total,
      returned: result.items.length
    });

    return result;
  }

  /**
   * Get all assets in a collection (by group)
   */
  async getAssetsByGroup(
    groupKey: string,
    groupValue: string,
    page: number = 1,
    limit: number = 100
  ): Promise<DASSearchResult> {
    logger.debug('DAS: Getting assets by group', { groupKey, groupValue });

    const result = await this.rpcRequest<DASSearchResult>('getAssetsByGroup', {
      groupKey,
      groupValue,
      page,
      limit,
      displayOptions: {
        showCompression: true
      }
    });

    return result;
  }

  /**
   * Search assets by creator
   */
  async getAssetsByCreator(
    creatorAddress: string,
    onlyVerified: boolean = true,
    page: number = 1,
    limit: number = 100
  ): Promise<DASSearchResult> {
    logger.debug('DAS: Getting assets by creator', { creatorAddress });

    const result = await this.rpcRequest<DASSearchResult>('getAssetsByCreator', {
      creatorAddress,
      onlyVerified,
      page,
      limit,
      displayOptions: {
        showCompression: true
      }
    });

    return result;
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * Verify ownership of an asset
   */
  async verifyOwnership(assetId: string, expectedOwner: string): Promise<boolean> {
    try {
      const asset = await this.getAsset(assetId);
      const actualOwner = asset.ownership.owner;
      const isOwner = actualOwner === expectedOwner;

      logger.info('Ownership verification', {
        assetId,
        expectedOwner,
        actualOwner,
        isOwner,
        isDelegated: asset.ownership.delegated,
        delegate: asset.ownership.delegate
      });

      return isOwner;
    } catch (error) {
      logger.error('Ownership verification failed', {
        assetId,
        expectedOwner,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Check if an asset exists and is valid
   */
  async assetExists(assetId: string): Promise<boolean> {
    try {
      const asset = await this.getAsset(assetId);
      return !!asset && !!asset.id;
    } catch (error) {
      if ((error as Error).message.includes('not found')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get compressed NFT info (tree, leaf index, etc.)
   */
  async getCompressionInfo(assetId: string): Promise<DASAsset['compression'] | null> {
    try {
      const asset = await this.getAsset(assetId);
      
      if (!asset.compression?.compressed) {
        return null;
      }

      return asset.compression;
    } catch (error) {
      logger.error('Failed to get compression info', {
        assetId,
        error: (error as Error).message
      });
      return null;
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let dasClient: DASClient | null = null;

/**
 * Get the DAS client singleton
 */
export function getDASClient(): DASClient {
  if (!dasClient) {
    dasClient = new DASClient();
  }
  return dasClient;
}

/**
 * Initialize DAS client with custom options
 */
export function initDASClient(options: { url?: string; timeout?: number }): DASClient {
  dasClient = new DASClient(options);
  return dasClient;
}
