/**
 * Minting Service Client
 *
 * HMAC-authenticated client for communication with minting-service.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
} from '@tickettoken/shared';

interface MintRequest {
  ticketId: string;
  userId: string;
  eventId: string;
  metadata: Record<string, unknown>;
}

interface MintResponse {
  success: boolean;
  signature?: string;
  assetId?: string;
  error?: string;
}

export class MintingServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.MINTING_SERVICE_URL || 'http://minting-service:3007',
      serviceName: 'minting-service',
      timeout: 60000, // 60 seconds for minting
      ...config,
    });
  }

  /**
   * Request NFT minting for a ticket
   */
  async mintTicket(data: MintRequest, ctx: RequestContext): Promise<MintResponse> {
    const response = await this.post<MintResponse>('/api/v1/internal/mint', data, ctx);
    return response.data;
  }

  /**
   * Check minting status
   */
  async getMintStatus(ticketId: string, ctx: RequestContext): Promise<MintResponse | null> {
    try {
      const response = await this.get<MintResponse>(
        `/api/v1/internal/mint/${ticketId}/status`,
        ctx
      );
      return response.data;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}

// Singleton instance
let mintingServiceClient: MintingServiceClient | null = null;

export function getMintingServiceClient(): MintingServiceClient {
  if (!mintingServiceClient) {
    mintingServiceClient = new MintingServiceClient();
  }
  return mintingServiceClient;
}

export default MintingServiceClient;
