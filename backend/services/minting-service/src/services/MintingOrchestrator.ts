import { getConnection, getWallet } from '../config/solana';
import { getPool } from '../config/database';
import { uploadToIPFS, TicketMetadata } from './MetadataService';
import { Connection, Keypair } from '@solana/web3.js';
import { RealCompressedNFT } from './RealCompressedNFT';
import { MintingBlockchainService, TicketBlockchainData } from './blockchain.service';
import logger from '../utils/logger';
import { checkWalletBalance } from '../utils/solana';
import {
  mintsTotal,
  mintsSuccessTotal,
  mintsFailedTotal,
  mintDuration,
  ipfsUploadDuration,
  walletBalanceSOL
} from '../utils/metrics';

interface TicketData {
  ticketId: string;
  orderId: string;
  eventId: string;
  tenantId: string;
  userId?: string;
  ownerAddress?: string;
  metadata?: {
    eventName?: string;
    eventDate?: string;
    venue?: string;
    tier?: string;
    seatNumber?: string;
    image?: string;
  };
}

interface MintResult {
  success: boolean;
  ticketId: string;
  signature: string;
  mintAddress: string;
  metadataUri: string;
  assetId?: string;
}

interface MintRecord {
  ticketId: string;
  tenantId: string;
  signature: string;
  mintAddress: string;
  metadataUri: string;
  assetId?: string;
}

export class MintingOrchestrator {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private nftService: RealCompressedNFT;
  private blockchainService: MintingBlockchainService;
  private initialized: boolean = false;

  constructor() {
    this.nftService = new RealCompressedNFT();
    this.blockchainService = new MintingBlockchainService();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.connection = getConnection();
    this.wallet = getWallet();
    await this.nftService.initialize();
    this.initialized = true;

    logger.info('MintingOrchestrator initialized');
  }

  async mintCompressedNFT(ticketData: TicketData): Promise<MintResult> {
    await this.ensureInitialized();

    const endTimer = mintDuration.startTimer({ tenant_id: ticketData.tenantId });
    const { ticketId, orderId, tenantId, ownerAddress, metadata } = ticketData;

    logger.info(`Starting compressed NFT mint for ticket ${ticketId}`, {
      tenantId,
      ticketId,
      orderId
    });

    mintsTotal.inc({ status: 'started', tenant_id: tenantId });

    try {
      // 1. Check wallet balance before minting
      const minBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.1');
      const balanceCheck = await checkWalletBalance(
        this.connection!,
        this.wallet!.publicKey,
        minBalance
      );

      walletBalanceSOL.set(balanceCheck.balance);

      if (!balanceCheck.sufficient) {
        mintsFailedTotal.inc({ reason: 'insufficient_balance', tenant_id: tenantId });
        throw new Error(
          `Insufficient wallet balance: ${balanceCheck.balance} SOL (minimum: ${minBalance} SOL). ` +
          'Please fund the wallet before minting.'
        );
      }

      // 2. Prepare and upload metadata to IPFS
      const metadataUri = await this.prepareAndUploadMetadata(ticketData);

      // 3. Mint the compressed NFT using RealCompressedNFT
      const mintResult = await this.nftService.mintNFT({
        ticketId,
        ownerAddress,
        metadata: {
          name: metadata?.eventName
            ? `${metadata.eventName} - ${metadata.tier || 'General'}`
            : `Ticket #${ticketId}`,
          uri: metadataUri
        }
      });

      // Generate asset ID from merkle tree + ticket
      const assetId = `${mintResult.merkleTree}:${ticketId}`;
      const mintAddress = mintResult.merkleTree;

      // 4. Save to database
      await this.saveMintRecord({
        ticketId,
        tenantId,
        signature: mintResult.signature,
        mintAddress,
        metadataUri,
        assetId
      });

      // 5. Register ticket on blockchain
      if (ticketData.userId) {
        try {
          const pool = getPool();
          const eventResult = await pool.query(
            'SELECT event_pda FROM events WHERE id = $1',
            [ticketData.eventId]
          );

          if (eventResult.rows.length > 0 && eventResult.rows[0].event_pda) {
            const eventPda = eventResult.rows[0].event_pda;

            const blockchainData: TicketBlockchainData = {
              eventPda,
              ticketId: parseInt(ticketId, 10),
              nftAssetId: assetId,
              ownerId: ticketData.userId,
            };

            const blockchainResult = await this.blockchainService.registerTicketOnChain(blockchainData);

            await pool.query(`
              UPDATE tickets
              SET ticket_pda = $1,
                  event_pda = $2,
                  blockchain_status = 'registered',
                  updated_at = NOW()
              WHERE id::text = $3 AND tenant_id::text = $4
            `, [blockchainResult.ticketPda, eventPda, ticketId, tenantId]);

            logger.info(`Ticket ${ticketId} registered on blockchain`, {
              ticketId,
              ticketPda: blockchainResult.ticketPda,
              signature: blockchainResult.signature,
            });
          } else {
            logger.warn(`Event ${ticketData.eventId} has no event_pda, skipping blockchain registration`, {
              ticketId,
              eventId: ticketData.eventId,
            });
          }
        } catch (blockchainError) {
          logger.error(`Failed to register ticket ${ticketId} on blockchain`, {
            ticketId,
            error: blockchainError instanceof Error ? blockchainError.message : String(blockchainError),
          });

          const pool = getPool();
          await pool.query(`
            UPDATE tickets
            SET blockchain_status = 'failed',
                updated_at = NOW()
            WHERE id::text = $1 AND tenant_id::text = $2
          `, [ticketId, tenantId]);
        }
      } else {
        logger.warn(`Ticket ${ticketId} has no userId, skipping blockchain registration`);
      }

      mintsSuccessTotal.inc({ tenant_id: tenantId });
      mintsTotal.inc({ status: 'completed', tenant_id: tenantId });
      endTimer();

      logger.info(`Mint successful for ticket ${ticketId}`, {
        signature: mintResult.signature,
        merkleTree: mintResult.merkleTree,
        assetId
      });

      return {
        success: true,
        ticketId,
        signature: mintResult.signature,
        mintAddress,
        metadataUri,
        assetId
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const reason = this.categorizeError(errorMessage);
      mintsFailedTotal.inc({ reason, tenant_id: tenantId });
      mintsTotal.inc({ status: 'failed', tenant_id: tenantId });
      endTimer();

      logger.error(`Mint failed for ticket ${ticketId}`, {
        error: errorMessage,
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('Insufficient wallet balance')) return 'insufficient_balance';
    if (errorMessage.includes('IPFS')) return 'ipfs_upload_failed';
    if (errorMessage.includes('Transaction failed')) return 'transaction_failed';
    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('Bubblegum')) return 'bubblegum_error';
    return 'unknown';
  }

  private async prepareAndUploadMetadata(ticketData: TicketData): Promise<string> {
    const endTimer = ipfsUploadDuration.startTimer();

    try {
      const ticketMetadata: TicketMetadata = {
        ticketId: ticketData.ticketId,
        orderId: ticketData.orderId,
        eventId: ticketData.eventId,
        eventName: ticketData.metadata?.eventName,
        eventDate: ticketData.metadata?.eventDate,
        venue: ticketData.metadata?.venue,
        tier: ticketData.metadata?.tier,
        seatNumber: ticketData.metadata?.seatNumber,
        image: ticketData.metadata?.image
      };

      const result = await uploadToIPFS(ticketMetadata);
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  }

  private async saveMintRecord(mintData: MintRecord): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS nft_mints (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id VARCHAR(255) NOT NULL,
          tenant_id VARCHAR(255) NOT NULL,
          transaction_signature VARCHAR(255),
          mint_address VARCHAR(255),
          asset_id VARCHAR(255),
          metadata_uri TEXT,
          merkle_tree VARCHAR(255),
          retry_count INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(ticket_id, tenant_id)
        )
      `);

      const query = `
        INSERT INTO nft_mints (
          ticket_id,
          tenant_id,
          transaction_signature,
          mint_address,
          asset_id,
          metadata_uri,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (ticket_id, tenant_id)
        DO UPDATE SET
          transaction_signature = EXCLUDED.transaction_signature,
          mint_address = EXCLUDED.mint_address,
          asset_id = EXCLUDED.asset_id,
          metadata_uri = EXCLUDED.metadata_uri,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;

      await client.query(query, [
        mintData.ticketId,
        mintData.tenantId,
        mintData.signature,
        mintData.mintAddress,
        mintData.assetId || null,
        mintData.metadataUri,
        'completed'
      ]);

      await client.query(`
        UPDATE tickets
        SET
          mint_address = $1,
          blockchain_status = 'minted',
          transaction_signature = $2,
          updated_at = NOW()
        WHERE id::text = $3
          AND tenant_id::text = $4
      `, [mintData.mintAddress, mintData.signature, mintData.ticketId, mintData.tenantId]);

      await client.query('COMMIT');
      logger.info(`Saved mint record for ticket ${mintData.ticketId}`);

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to save mint record`, {
        ticketId: mintData.ticketId,
        error: (error as Error).message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  getMerkleTreeAddress(): string | null {
    return this.nftService.getMerkleTreeAddress();
  }

  getCollectionAddress(): string | null {
    return this.nftService.getCollectionAddress();
  }
}
