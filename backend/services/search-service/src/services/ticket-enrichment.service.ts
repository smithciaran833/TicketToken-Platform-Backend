import { Knex } from 'knex';
import pino from 'pino';
import { EnrichedTicket } from '../types/enriched-documents';

/**
 * Ticket Enrichment Service
 * Pulls data from PostgreSQL (tickets, ticket_transfers, ticket_validations, nfts, marketplace_listings)
 * to create fully enriched ticket documents for Elasticsearch
 */
export class TicketEnrichmentService {
  private db: Knex;
  private logger: pino.Logger;

  constructor({ db, logger }: any) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Enrich a single ticket with full PostgreSQL data
   */
  async enrich(ticketId: string): Promise<EnrichedTicket> {
    try {
      // Get PostgreSQL ticket data
      const ticket = await this.db('tickets')
        .where({ id: ticketId })
        .first();

      if (!ticket) {
        throw new Error(`Ticket not found: ${ticketId}`);
      }

      // Get transfer history
      const transfers = await this.db('ticket_transfers')
        .where({ ticket_id: ticketId })
        .orderBy('transfer_date', 'desc');

      // Get validation history (if table exists)
      let validations: any[] = [];
      try {
        validations = await this.db('ticket_validations')
          .where({ ticket_id: ticketId })
          .orderBy('timestamp', 'desc');
      } catch (error) {
        // Table may not exist, skip
      }

      // Get price history (if table exists)
      let priceHistory: any[] = [];
      try {
        priceHistory = await this.db('ticket_price_history')
          .where({ ticket_id: ticketId })
          .orderBy('date', 'desc');
      } catch (error) {
        // Table may not exist, skip
      }

      // Get NFT data if ticket is tokenized
      let nftData: any = null;
      if (ticket.nft_id) {
        nftData = await this.db('nfts')
          .where({ id: ticket.nft_id })
          .first();
      }

      // Get marketplace listing if ticket is listed
      let marketplaceListing: any = null;
      try {
        marketplaceListing = await this.db('marketplace_listings')
          .where({ ticket_id: ticketId, status: 'active' })
          .first();
      } catch (error) {
        // Table may not exist, skip
      }

      // Build enriched ticket document
      const enriched: EnrichedTicket = {
        ticketId: ticket.id,
        eventId: ticket.event_id,
        venueId: ticket.venue_id,
        userId: ticket.user_id || ticket.owner_id,
        originalUserId: ticket.original_user_id || ticket.original_owner_id,

        ticketNumber: ticket.ticket_number || ticket.id,
        ticketType: ticket.ticket_type || ticket.type || 'standard',
        category: ticket.category,

        section: ticket.section,
        row: ticket.row,
        seat: ticket.seat,
        seatView: ticket.seat_view,

        barcode: ticket.barcode,
        qrCode: ticket.qr_code,
        accessCode: ticket.access_code,
        securityCode: ticket.security_code,

        pricing: {
          originalPrice: ticket.original_price || ticket.price,
          purchasePrice: ticket.purchase_price || ticket.price,
          currentValue: ticket.current_value || ticket.price,
          fees: ticket.fees,
          taxes: ticket.taxes,
          royalties: ticket.royalties,
          currency: ticket.currency || 'USD',
          priceHistory: priceHistory.map(p => ({
            price: p.price,
            date: p.date,
            reason: p.reason || 'price_update'
          }))
        },

        transferHistory: transfers.map(t => ({
          fromUserId: t.from_user_id,
          toUserId: t.to_user_id,
          transferDate: t.transfer_date,
          transferType: t.transfer_type || 'transfer',
          transferPrice: t.transfer_price,
          transactionHash: t.transaction_hash,
          status: t.status || 'completed'
        })),

        marketplace: marketplaceListing ? {
          isListed: true,
          listingId: marketplaceListing.id,
          listingPrice: marketplaceListing.price,
          listingDate: marketplaceListing.created_at,
          expiryDate: marketplaceListing.expires_at,
          viewCount: marketplaceListing.view_count || 0,
          watchCount: marketplaceListing.watch_count || 0,
          offerCount: marketplaceListing.offer_count || 0
        } : {
          isListed: false
        },

        blockchain: nftData ? {
          nftId: nftData.id,
          contractAddress: nftData.contract_address,
          tokenId: nftData.token_id,
          mintTx: nftData.mint_transaction_hash,
          chainId: nftData.chain_id,
          metadataUri: nftData.metadata_uri,
          attributes: nftData.attributes,
          royaltyPercentage: nftData.royalty_percentage
        } : undefined,

        validation: {
          lastValidated: validations[0]?.timestamp,
          validationCount: validations.length,
          validationHistory: validations.map(v => ({
            timestamp: v.timestamp,
            location: v.location ? { lat: v.location.lat, lon: v.location.lon } : undefined,
            gate: v.gate,
            staffId: v.staff_id,
            result: v.result || 'valid'
          })),
          entryGate: ticket.entry_gate,
          isUsed: ticket.is_used || false,
          usedAt: ticket.used_at
        },

        delivery: {
          method: ticket.delivery_method || 'digital',
          status: ticket.delivery_status || 'pending',
          trackingNumber: ticket.tracking_number,
          deliveryDate: ticket.delivery_date,
          email: ticket.delivery_email
        },

        perks: ticket.perks || [],
        restrictions: ticket.restrictions || [],
        specialInstructions: ticket.special_instructions,
        notes: ticket.notes,
        tags: ticket.tags || [],

        metadata: {
          source: ticket.source,
          affiliate: ticket.affiliate_code,
          campaign: ticket.campaign_id,
          referrer: ticket.referrer
        },

        status: ticket.status || 'active',
        statusHistory: [],

        flags: ticket.flags || [],
        isTransferable: ticket.is_transferable ?? true,
        isResellable: ticket.is_resellable ?? true,
        isRefundable: ticket.is_refundable ?? false,
        isUpgradeable: ticket.is_upgradeable ?? false,

        purchaseDate: ticket.purchase_date || ticket.created_at,
        validFrom: ticket.valid_from,
        validUntil: ticket.valid_until,
        expiryDate: ticket.expiry_date,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
        searchScore: this.calculateSearchScore(ticket, transfers, validations)
      };

      return enriched;
    } catch (error) {
      this.logger.error({ error, ticketId }, 'Failed to enrich ticket');
      throw error;
    }
  }

  /**
   * Bulk enrich multiple tickets
   */
  async bulkEnrich(ticketIds: string[]): Promise<EnrichedTicket[]> {
    const enriched: EnrichedTicket[] = [];

    for (const ticketId of ticketIds) {
      try {
        const ticket = await this.enrich(ticketId);
        enriched.push(ticket);
      } catch (error) {
        this.logger.error({ error, ticketId }, 'Failed to enrich ticket in bulk');
        // Continue with other tickets
      }
    }

    return enriched;
  }

  /**
   * Calculate search score based on ticket attributes
   */
  private calculateSearchScore(ticket: any, transfers: any[], validations: any[]): number {
    let score = 1.0;

    // Boost verified tickets
    if (ticket.verified) {
      score += 0.3;
    }

    // Boost tickets with NFT
    if (ticket.nft_id) {
      score += 0.2;
    }

    // Penalize tickets with many transfers (possible fraud indicator)
    if (transfers.length > 5) {
      score -= 0.2;
    }

    // Boost tickets with validation history (shows legitimacy)
    if (validations.length > 0) {
      score += 0.1;
    }

    // Boost tickets that are transferable/resellable
    if (ticket.is_transferable && ticket.is_resellable) {
      score += 0.1;
    }

    return Math.max(0.1, score); // Minimum score of 0.1
  }
}
