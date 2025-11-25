import { getIPFSService, IPFSMetadata } from '../config/ipfs';
import { retryAsync } from '../utils/solana';
import logger from '../utils/logger';

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
}

/**
 * Upload ticket metadata to IPFS
 */
export async function uploadToIPFS(metadata: TicketMetadata): Promise<string> {
  try {
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

    logger.info('✅ Metadata uploaded to IPFS', {
      ticketId: metadata.ticketId,
      ipfsHash: result.ipfsHash,
      ipfsUrl: result.ipfsUrl,
      gatewayUrl: result.pinataUrl
    });

    return result.ipfsUrl;
  } catch (error) {
    logger.error('❌ Failed to upload metadata to IPFS', {
      ticketId: metadata.ticketId,
      error: (error as Error).message
    });
    throw new Error(`IPFS upload failed: ${(error as Error).message}`);
  }
}

/**
 * Upload raw metadata (generic)
 */
export async function uploadMetadata(metadata: Record<string, any>): Promise<string> {
  try {
    const ipfsService = getIPFSService();
    const result = await retryAsync(
      () => ipfsService.uploadJSON(metadata as IPFSMetadata),
      3,
      2000,
      2
    );

    return result.ipfsUrl;
  } catch (error) {
    logger.error('Failed to upload metadata', {
      error: (error as Error).message
    });
    throw error;
  }
}
