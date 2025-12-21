/**
 * Blockchain Service for Minting Service
 *
 * Handles blockchain integration for ticket registration after NFT minting.
 * Wraps the shared BlockchainClient with ticket-specific logic.
 */
import {
  BlockchainClient,
  BlockchainConfig,
  RegisterTicketParams,
  RegisterTicketResult,
  BlockchainError,
} from '@tickettoken/shared';
import { pino } from 'pino';
import path from 'path';

const logger = pino({ name: 'minting-blockchain-service' });

export interface TicketBlockchainData {
  eventPda: string;
  ticketId: number;
  nftAssetId: string;
  ownerId: string;
}

export class MintingBlockchainService {
  private client: BlockchainClient | null = null;

  private getClient(): BlockchainClient {
    if (!this.client) {
      const config: BlockchainConfig = {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        programId: process.env.TICKETTOKEN_PROGRAM_ID || 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS',
        platformWalletPath: process.env.PLATFORM_WALLET_PATH ||
          path.join(__dirname, '../../devnet-wallet.json'),
        commitment: 'confirmed',
      };
      this.client = new BlockchainClient(config);
      logger.info('BlockchainClient initialized for minting-service');
    }
    return this.client;
  }

  async registerTicketOnChain(ticketData: TicketBlockchainData): Promise<RegisterTicketResult> {
    try {
      logger.info({
        msg: `Registering ticket ${ticketData.ticketId} on blockchain`,
        ticketId: ticketData.ticketId,
        eventPda: ticketData.eventPda,
        ownerId: ticketData.ownerId,
      });

      const blockchainParams: RegisterTicketParams = {
        eventPda: ticketData.eventPda,
        ticketId: ticketData.ticketId,
        nftAssetId: ticketData.nftAssetId,
        ownerId: ticketData.ownerId,
      };

      const client = this.getClient();
      const result = await client.registerTicket(blockchainParams);

      logger.info({
        msg: `Ticket ${ticketData.ticketId} registered on blockchain`,
        ticketId: ticketData.ticketId,
        ticketPda: result.ticketPda,
        signature: result.signature,
      });

      return result;
    } catch (error) {
      logger.error({
        msg: `Failed to register ticket ${ticketData.ticketId} on blockchain`,
        ticketId: ticketData.ticketId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof BlockchainError) {
        throw error;
      }
      throw new BlockchainError(
        `Failed to register ticket on blockchain: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      logger.info('BlockchainClient closed');
    }
  }
}
