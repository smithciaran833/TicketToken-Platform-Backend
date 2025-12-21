import { transferModel, CreateTransferInput } from '../models/transfer.model';
import { listingModel } from '../models/listing.model';
import { feeModel } from '../models/fee.model';
import { validationService } from './validation.service';
import { blockchainService } from './blockchain.service';
import { listingService } from './listing.service';
import { feeService } from './fee.service';
import { stripePaymentService } from './stripe-payment.service';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { FEATURE_FLAGS } from '../config/constants';
import { BlockchainClient } from '../../../../shared/src/blockchain/client';
import { db } from '../config/database';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';

export interface InitiateTransferDto {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  eventStartTime: Date;
  paymentMethod?: 'crypto' | 'fiat';
}

export interface InitiateFiatTransferDto {
  listingId: string;
  buyerId: string;
  sellerId: string;
  paymentIntentId: string;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
}

export interface CompleteTransferDto {
  transferId: string;
  blockchainSignature: string;
}

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  /**
   * Initiate a transfer
   */
  async initiateTransfer(dto: InitiateTransferDto) {
    // Get listing details
    const listing = await listingModel.findById(dto.listingId);
    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Validate transfer
    await validationService.validateTransfer({
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      buyerWallet: dto.buyerWallet,
      eventStartTime: dto.eventStartTime,
    });

    // Check buyer has sufficient balance
    const balance = await blockchainService.getWalletBalance(dto.buyerWallet);
    const requiredAmount = this.calculateTotalAmount(listing.price, dto.paymentCurrency);

    if (balance < requiredAmount) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Create transfer record
    const transferInput: CreateTransferInput = {
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      sellerId: listing.sellerId,
      eventId: listing.eventId,
      venueId: listing.venueId,
      buyerWallet: dto.buyerWallet,
      sellerWallet: listing.walletAddress,
      paymentCurrency: dto.paymentCurrency,
      paymentAmount: listing.price,
      usdValue: listing.price, // Assuming USD for now
    };

    const transfer = await transferModel.create(transferInput);

    // Create fee record
    await feeModel.create({
      transferId: transfer.id,
      salePrice: listing.price,
      platformFeePercentage: constants.FEES.PLATFORM_FEE_PERCENTAGE,
      venueFeePercentage: constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE,
    });

    this.log.info('Transfer initiated', {
      transferId: transfer.id,
      listingId: dto.listingId,
      buyerId: dto.buyerId,
    });

    return transfer;
  }

  /**
   * Complete a transfer after blockchain confirmation
   */
  async completeTransfer(dto: CompleteTransferDto) {
    const transfer = await transferModel.findById(dto.transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    if (transfer.status !== 'initiated' && transfer.status !== 'pending') {
      throw new ValidationError(`Cannot complete transfer with status: ${transfer.status}`);
    }

    // Validate blockchain transaction
    const isValid = await blockchainService.validateTransaction(dto.blockchainSignature);
    if (!isValid) {
      throw new ValidationError('Invalid blockchain signature');
    }

    // Get current block height
    const blockHeight = await blockchainService.getConnection().getBlockHeight();

    // Update transfer with blockchain data
    await transferModel.updateBlockchainData(
      transfer.id,
      dto.blockchainSignature,
      blockHeight,
      blockchainService.calculateNetworkFee()
    );

    // Mark transfer as completed
    await transferModel.updateStatus(transfer.id, 'completed');

    // Mark listing as sold - FIXED: Added buyerId parameter
    await listingService.markListingAsSold(transfer.listingId, transfer.buyerId);

    // Update fee collection status
    const fee = await feeModel.findByTransferId(transfer.id);
    if (fee) {
      await feeModel.updateFeeCollection(
        fee.id,
        true, // platform fee collected
        true, // venue fee collected
        dto.blockchainSignature,
        dto.blockchainSignature
      );
    }

    this.log.info('Transfer completed', {
      transferId: transfer.id,
      signature: dto.blockchainSignature,
    });

    return transfer;
  }

  /**
   * Handle failed transfer
   */
  async failTransfer(transferId: string, reason: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    await transferModel.updateStatus(transfer.id, 'failed', {
      failureReason: reason,
    });

    // Reactivate the listing
    await listingModel.updateStatus(transfer.listingId, 'active');

    this.log.error('Transfer failed', {
      transferId,
      reason,
    });
  }

  /**
   * Get transfer by ID
   */
  async getTransferById(transferId: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }
    return transfer;
  }

  /**
   * Get transfers for a user
   */
  async getUserTransfers(userId: string, type: 'buyer' | 'seller', limit = 20, offset = 0) {
    if (type === 'buyer') {
      return await transferModel.findByBuyerId(userId, limit, offset);
    } else {
      return await transferModel.findBySellerId(userId, limit, offset);
    }
  }

  /**
   * Initiate fiat transfer (Stripe payment)
   * Uses feature flag to decide between new (separate charges) vs old (destination charges) pattern
   */
  async initiateFiatTransfer(dto: InitiateFiatTransferDto) {
    const { listingId, buyerId, sellerId, paymentIntentId, amountCents, applicationFeeCents, currency } = dto;

    // Get listing details
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing');
    }

    // Get seller's Stripe Connect account
    const sellerStripeAccountId = await stripePaymentService.getSellerStripeAccountId(sellerId);
    if (!sellerStripeAccountId) {
      throw new ValidationError('Seller has not completed Stripe Connect onboarding');
    }

    // Check feature flag to decide which payment flow to use
    if (FEATURE_FLAGS.ENABLE_VENUE_ROYALTY_SPLIT) {
      // NEW FLOW: Separate charges and transfers with venue royalty split
      this.log.info('Using NEW venue royalty split flow (separate charges)');

      // Fetch event royalty data from database
      const royaltyData = await feeService.getEventRoyaltyData(listing.eventId);

      // Calculate fees based on actual venue royalty percentage
      const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
      const platformFeeCents = Math.round(amountCents * platformFeePercentage);
      const venueFeeCents = Math.round(amountCents * (royaltyData.venuePercentage / 100));
      const sellerReceivesCents = amountCents - platformFeeCents - venueFeeCents;

      this.log.info('Initiating fiat transfer with venue split', {
        listingId,
        amountCents,
        platformFeeCents,
        venueFeeCents,
        sellerReceivesCents,
        venueHasStripeConnect: royaltyData.venueCanReceivePayments,
      });

      // Create PaymentIntent with separate charges pattern
      const paymentResult = await stripePaymentService.createPaymentIntentWithSeparateCharges({
        listingId,
        sellerId,
        sellerStripeAccountId,
        buyerId,
        venueId: royaltyData.venueId,
        venueStripeAccountId: royaltyData.venueStripeAccountId,
        amountCents,
        platformFeeCents,
        venueFeeCents,
        sellerReceivesCents,
        currency,
      });

      // Create transfer record for fiat payment
      const transfer = await transferModel.create({
        listingId,
        buyerId,
        sellerId,
        eventId: listing.eventId,
        venueId: listing.venueId,
        buyerWallet: '', // No wallet for fiat
        sellerWallet: '', // No wallet for fiat
        paymentCurrency: 'USDC', // Default currency for fiat tracking
        paymentAmount: amountCents,
        usdValue: amountCents,
        paymentMethod: 'fiat',
        stripePaymentIntentId: paymentResult.paymentIntentId,
        stripeApplicationFeeAmount: platformFeeCents + venueFeeCents,
        fiatCurrency: currency.toUpperCase(),
      });

      // Create fee record with actual venue percentage
      await feeModel.create({
        transferId: transfer.id,
        salePrice: amountCents,
        platformFeePercentage,
        venueFeePercentage: royaltyData.venuePercentage,
      });

      this.log.info('Fiat transfer initiated (NEW flow)', {
        transferId: transfer.id,
        listingId,
        buyerId,
        paymentIntentId: paymentResult.paymentIntentId,
        venuePercentage: royaltyData.venuePercentage,
      });

      return transfer;

    } else {
      // OLD FLOW: Destination charges (backward compatibility)
      this.log.info('Using OLD destination charges flow (backward compatibility)');

      // Use old createPaymentIntent method
      const paymentResult = await stripePaymentService.createPaymentIntent({
        listingId,
        sellerId,
        sellerStripeAccountId,
        buyerId,
        amountCents,
        currency,
      });

      // Create transfer record for fiat payment
      const transfer = await transferModel.create({
        listingId,
        buyerId,
        sellerId,
        eventId: listing.eventId,
        venueId: listing.venueId,
        buyerWallet: '', // No wallet for fiat
        sellerWallet: '', // No wallet for fiat
        paymentCurrency: 'USDC', // Default currency for fiat tracking
        paymentAmount: amountCents,
        usdValue: amountCents,
        paymentMethod: 'fiat',
        stripePaymentIntentId: paymentResult.paymentIntentId,
        stripeApplicationFeeAmount: paymentResult.applicationFeeAmountCents,
        fiatCurrency: currency.toUpperCase(),
      });

      // Create fee record with default percentages
      await feeModel.create({
        transferId: transfer.id,
        salePrice: amountCents,
        platformFeePercentage: constants.FEES.PLATFORM_FEE_PERCENTAGE,
        venueFeePercentage: constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE,
      });

      this.log.info('Fiat transfer initiated (OLD flow)', {
        transferId: transfer.id,
        listingId,
        buyerId,
        paymentIntentId: paymentResult.paymentIntentId,
      });

      return transfer;
    }
  }

  /**
   * Complete fiat transfer after Stripe webhook confirms payment
   * Executes separate transfers to seller and venue using source_transaction
   * Then updates blockchain ownership (non-fatal if fails)
   */
  async completeFiatTransfer(transferId: string, stripeTransferId?: string) {
    const transfer = await transferModel.findById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer');
    }

    if (transfer.status !== 'initiated' && transfer.status !== 'pending') {
      throw new ValidationError(`Cannot complete transfer with status: ${transfer.status}`);
    }

    // Retrieve PaymentIntent to get charge ID
    const paymentIntent = await stripePaymentService.getPaymentIntent(
      transfer.stripePaymentIntentId!
    );

    if (!paymentIntent.latest_charge) {
      throw new ValidationError('PaymentIntent has no charge associated');
    }

    const chargeId = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge.id;

    // Extract metadata from PaymentIntent
    const metadata = paymentIntent.metadata;
    const sellerStripeAccountId = metadata.seller_stripe_account_id;
    const venueStripeAccountId = metadata.venue_stripe_account_id || null;
    const sellerAmountCents = parseInt(metadata.seller_amount_cents);
    const venueAmountCents = parseInt(metadata.venue_amount_cents);

    this.log.info('Completing fiat transfer with separate transfers', {
      transferId: transfer.id,
      chargeId,
      sellerAmountCents,
      venueAmountCents,
      hasVenueAccount: !!venueStripeAccountId,
    });

    // Execute transfer to seller using source_transaction
    const sellerTransfer = await stripePaymentService.createTransferToSeller(
      chargeId,
      sellerStripeAccountId,
      sellerAmountCents,
      {
        listingId: transfer.listingId,
        sellerId: transfer.sellerId,
        buyerId: transfer.buyerId,
      }
    );

    // Execute transfer to venue using source_transaction (if venue has Connect)
    let venueTransfer = null;
    if (venueStripeAccountId && venueAmountCents > 0) {
      venueTransfer = await stripePaymentService.createTransferToVenue(
        chargeId,
        venueStripeAccountId,
        venueAmountCents,
        {
          listingId: transfer.listingId,
          venueId: transfer.venueId,
        }
      );

      if (!venueTransfer) {
        this.log.warn('Venue transfer failed but seller was paid', {
          transferId: transfer.id,
          venueId: transfer.venueId,
        });
      }
    }

    // Update transfer status with both transfer IDs
    await transferModel.updateStatus(transfer.id, 'completed', {
      seller_transfer_id: sellerTransfer.transferId,
      venue_transfer_id: venueTransfer?.transferId || null,
    });

    // Mark listing as sold
    await listingService.markListingAsSold(transfer.listingId, transfer.buyerId);

    // Update fee collection status
    const fee = await feeModel.findByTransferId(transfer.id);
    if (fee) {
      await feeModel.updateFeeCollection(
        fee.id,
        true, // platform fee collected
        !!venueTransfer, // venue fee collected only if transfer succeeded
        sellerTransfer.transferId,
        venueTransfer?.transferId || ''
      );
    }

    this.log.info('Fiat transfer completed with split payments', {
      transferId: transfer.id,
      sellerTransferId: sellerTransfer.transferId,
      venueTransferId: venueTransfer?.transferId,
    });

    // Update blockchain ownership (non-fatal - do NOT fail transaction if this fails)
    await this.syncBlockchainOwnership(transfer);

    return transfer;
  }

  /**
   * Sync blockchain ownership after successful payment
   * This is a best-effort operation - if it fails, log it but don't fail the transfer
   * The money has already moved, so we prioritize that over blockchain state
   */
  private async syncBlockchainOwnership(transfer: any): Promise<void> {
    try {
      this.log.info('Syncing blockchain ownership', {
        transferId: transfer.id,
        listingId: transfer.listingId,
        buyerId: transfer.buyerId,
      });

      // Get listing to find the ticket
      const listing = await listingModel.findById(transfer.listingId);
      if (!listing) {
        throw new Error('Listing not found');
      }

      // Get ticket PDAs from database
      const ticket = await db('tickets')
        .where({ id: listing.ticketId })
        .select('ticket_pda', 'event_id')
        .first();

      if (!ticket || !ticket.ticket_pda) {
        throw new Error('Ticket PDA not found');
      }

      // Get event PDA from database
      const event = await db('events')
        .where({ id: ticket.event_id })
        .select('event_pda')
        .first();

      if (!event || !event.event_pda) {
        throw new Error('Event PDA not found');
      }

      // Get buyer's user ID to use as new owner
      const newOwnerId = transfer.buyerId;

      this.log.info('Calling blockchain transferTicket', {
        ticketPda: ticket.ticket_pda,
        eventPda: event.event_pda,
        newOwnerId,
      });

      // Initialize blockchain client (assuming config is in env)
      const blockchainClient = new BlockchainClient({
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        programId: process.env.SOLANA_PROGRAM_ID!,
        platformWalletPath: process.env.SOLANA_PLATFORM_WALLET_PATH!,
      });

      // Call transferTicket on blockchain
      const signature = await blockchainClient.transferTicket({
        ticketPda: ticket.ticket_pda,
        eventPda: event.event_pda,
        newOwnerId,
      });

      // Update transfer record with blockchain signature
      await db('marketplace_transfers')
        .where({ id: transfer.id })
        .update({
          blockchain_signature: signature,
          blockchain_status: 'synced',
          blockchain_synced_at: db.fn.now(),
          updated_at: db.fn.now(),
        });

      // Update ticket transfer_count
      await db('tickets')
        .where({ id: listing.ticketId })
        .increment('transfer_count', 1)
        .update({
          blockchain_status: 'synced',
          updated_at: db.fn.now(),
        });

      this.log.info('Blockchain ownership synced successfully', {
        transferId: transfer.id,
        signature,
      });

    } catch (error: any) {
      // Log the error but DO NOT throw - payment already succeeded
      this.log.error('Failed to sync blockchain ownership (non-fatal)', {
        transferId: transfer.id,
        error: error.message,
        stack: error.stack,
      });

      // Update transfer record with error
      try {
        await db('marketplace_transfers')
          .where({ id: transfer.id })
          .update({
            blockchain_status: 'failed',
            blockchain_error: error.message,
            updated_at: db.fn.now(),
          });
      } catch (updateError: any) {
        this.log.error('Failed to update blockchain error status', {
          transferId: transfer.id,
          error: updateError.message,
        });
      }
    }
  }

  /**
   * Calculate total amount including fees
   */
  private calculateTotalAmount(price: number, currency: 'USDC' | 'SOL'): number {
    const networkFee = blockchainService.calculateNetworkFee();

    if (currency === 'USDC') {
      // For USDC, add network fee in SOL equivalent
      return price + (networkFee * 50); // Assuming 1 SOL = $50
    } else {
      // For SOL, convert price to SOL and add network fee
      const priceInSol = price / 50; // Assuming 1 SOL = $50
      return priceInSol + networkFee;
    }
  }
}

export const transferService = new TransferService();
