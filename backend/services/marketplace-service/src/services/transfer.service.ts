import { transferModel, CreateTransferInput } from '../models/transfer.model';
import { listingModel } from '../models/listing.model';
import { feeModel } from '../models/fee.model';
import { validationService } from './validation.service';
import { blockchainService } from './blockchain.service';
import { listingService } from './listing.service';
import { logger } from '../utils/logger';
import { constants } from '../config';
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
