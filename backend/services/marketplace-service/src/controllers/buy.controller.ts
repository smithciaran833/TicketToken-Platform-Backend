import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { withLock, LockKeys } from '@tickettoken/shared';
import { transferService } from '../services/transfer.service';
import { blockchainService } from '../services/blockchain.service';
import { listingModel } from '../models/listing.model';
import { stripePaymentService } from '../services/stripe-payment.service';

export class BuyController extends EventEmitter {
  private log = logger.child({ component: 'BuyController' });

  async buyListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { listingId } = request.params as { listingId: string };
    const buyerId = (request as any).user.id;
    const buyerWallet = (request as any).user.walletAddress;
    const { offeredPrice, paymentMethod = 'crypto' } = request.body as { 
      offeredPrice?: number;
      paymentMethod?: 'crypto' | 'fiat';
    };

    // Validate payment method requirements
    if (paymentMethod === 'crypto' && !buyerWallet) {
      reply.status(400).send({ error: 'Wallet address required for crypto purchase' });
      return;
    }

    const lockKey = LockKeys.listing(listingId);

    try {
      await withLock(lockKey, 10000, async () => {
        // Get listing details
        const listing = await listingModel.findById(listingId);

        if (!listing) {
          reply.status(404).send({ error: 'Listing not found' });
          return;
        }

        if (listing.status !== 'active') {
          reply.status(409).send({
            error: 'Listing unavailable',
            reason: `Listing status is ${listing.status}`
          });
          return;
        }

        if (listing.sellerId === buyerId) {
          reply.status(400).send({ error: 'Cannot buy your own listing' });
          return;
        }

        // Validate price if offered
        const purchasePrice = offeredPrice || listing.price;
        if (offeredPrice && offeredPrice < listing.price) {
          reply.status(400).send({
            error: 'Offered price below listing price',
            listingPrice: listing.price,
            offeredPrice
          });
          return;
        }

        try {
          // Route to appropriate payment flow
          if (paymentMethod === 'fiat') {
            await this.processFiatPurchase(listing, buyerId, purchasePrice, reply);
          } else {
            await this.processCryptoPurchase(listing, buyerId, buyerWallet, purchasePrice, reply);
          }

        } catch (transferError: any) {
          // Handle transfer failure
          this.log.error('Purchase failed during transfer', {
            error: transferError.message,
            listingId,
            buyerId
          });

          // If we have a transfer record, mark it as failed
          if (transferError.transferId) {
            await transferService.failTransfer(
              transferError.transferId,
              transferError.message || 'Transfer execution failed'
            );
          }

          // Return appropriate error
          if (transferError.message?.includes('Insufficient')) {
            reply.status(400).send({
              error: 'Insufficient wallet balance',
              message: transferError.message
            });
          } else if (transferError.message?.includes('Blockchain')) {
            reply.status(503).send({
              error: 'Blockchain service unavailable',
              message: 'Please try again in a moment'
            });
          } else {
            reply.status(500).send({
              error: 'Purchase failed',
              message: transferError.message || 'Unknown error occurred'
            });
          }
        }
      });
    } catch (lockError: any) {
      if (lockError.message?.includes('Resource is locked')) {
        reply.status(409).send({
          error: 'Listing is being purchased by another user',
          message: 'Please try again in a moment'
        });
      } else {
        this.log.error('Distributed lock error', { error: lockError, listingId });
        reply.status(500).send({ error: 'Purchase failed due to system error' });
      }
    }
  }

  async buyWithRetry(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await this.buyListing(request, reply);
        return;
      } catch (error: any) {
        if ((error.code === '40001' || error.message?.includes('Resource is locked'))
            && attempts < maxRetries - 1) {
          attempts++;
          const delay = Math.pow(2, attempts) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          this.log.info(`Retrying purchase attempt ${attempts} after ${delay}ms`);
        } else {
          throw error;
        }
      }
    }

    reply.status(409).send({
      error: 'Unable to complete purchase due to high demand',
      message: 'Please try again'
    });
  }

  /**
   * Process crypto (blockchain) purchase
   */
  private async processCryptoPurchase(
    listing: any,
    buyerId: string,
    buyerWallet: string,
    purchasePrice: number,
    reply: FastifyReply
  ): Promise<void> {
    // Step 1: Initiate transfer (creates transfer record)
    this.log.info('Initiating crypto transfer', { listingId: listing.id, buyerId, purchasePrice });
    
    const transfer = await transferService.initiateTransfer({
      listingId: listing.id,
      buyerId,
      buyerWallet,
      paymentCurrency: 'USDC',
      eventStartTime: new Date(listing.eventId),
      paymentMethod: 'crypto',
    });

    this.log.info('Transfer initiated', { transferId: transfer.id });

    // Step 2: Execute blockchain transfer
    this.log.info('Executing blockchain transfer', { transferId: transfer.id });
    
    const blockchainResult = await blockchainService.transferNFT({
      tokenId: listing.ticketId,
      fromWallet: listing.walletAddress,
      toWallet: buyerWallet,
      listingId: listing.id,
      price: purchasePrice
    });

    this.log.info('Blockchain transfer successful', {
      transferId: transfer.id,
      signature: blockchainResult.signature,
      blockHeight: blockchainResult.blockHeight
    });

    // Step 3: Complete transfer (marks listing sold)
    await transferService.completeTransfer({
      transferId: transfer.id,
      blockchainSignature: blockchainResult.signature
    });

    this.log.info('Crypto transfer completed successfully', {
      transferId: transfer.id,
      listingId: listing.id,
      buyerId,
      signature: blockchainResult.signature
    });

    // Emit event for other systems
    this.emit('ticket.sold', {
      transferId: transfer.id,
      listingId: listing.id,
      buyerId,
      sellerId: listing.sellerId,
      ticketId: listing.ticketId,
      price: purchasePrice,
      signature: blockchainResult.signature
    });

    // Calculate fees for response
    const platformFee = Math.round(purchasePrice * 0.025); // 2.5%
    const venueFee = Math.round(purchasePrice * 0.05); // 5%

    reply.send({
      success: true,
      transfer: {
        id: transfer.id,
        ticketId: listing.ticketId,
        price: purchasePrice,
        platformFee,
        venueFee,
        total: purchasePrice + platformFee + venueFee,
        signature: blockchainResult.signature,
        blockHeight: blockchainResult.blockHeight,
        status: 'completed',
        paymentMethod: 'crypto',
      }
    });
  }

  /**
   * Process fiat (Stripe) purchase
   */
  private async processFiatPurchase(
    listing: any,
    buyerId: string,
    purchasePrice: number,
    reply: FastifyReply
  ): Promise<void> {
    this.log.info('Initiating fiat purchase', { listingId: listing.id, buyerId, purchasePrice });

    // Get seller's Stripe Connect account
    const sellerStripeAccountId = await stripePaymentService.getSellerStripeAccountId(listing.sellerId);

    if (!sellerStripeAccountId) {
      reply.status(400).send({
        error: 'Seller not configured for fiat payments',
        message: 'This seller has not connected their payment account'
      });
      return;
    }

    // Create Stripe PaymentIntent
    const paymentResult = await stripePaymentService.createPaymentIntent({
      listingId: listing.id,
      sellerId: listing.sellerId,
      sellerStripeAccountId,
      buyerId,
      amountCents: purchasePrice,
      currency: 'usd',
      metadata: {
        ticket_id: listing.ticketId,
        event_id: listing.eventId,
        venue_id: listing.venueId,
      },
    });

    // Create transfer record with Stripe info
    const transfer = await transferService.initiateFiatTransfer({
      listingId: listing.id,
      buyerId,
      sellerId: listing.sellerId,
      paymentIntentId: paymentResult.paymentIntentId,
      amountCents: purchasePrice,
      applicationFeeCents: paymentResult.applicationFeeAmountCents,
      currency: 'usd',
    });

    this.log.info('Fiat payment initiated', {
      transferId: transfer.id,
      paymentIntentId: paymentResult.paymentIntentId,
    });

    // Return client secret for frontend to complete payment
    reply.send({
      success: true,
      transfer: {
        id: transfer.id,
        ticketId: listing.ticketId,
        price: purchasePrice,
        platformFee: Math.round(paymentResult.applicationFeeAmountCents * 0.025 / 0.075), // Proportional
        venueFee: Math.round(paymentResult.applicationFeeAmountCents * 0.05 / 0.075), // Proportional
        total: purchasePrice,
        status: 'pending_payment',
        paymentMethod: 'fiat',
        clientSecret: paymentResult.clientSecret,
        paymentIntentId: paymentResult.paymentIntentId,
      },
    });
  }
}

export const buyController = new BuyController();
