import { UUID, TransferStatus, PaymentCurrency, BaseEntity } from './common.types';

export interface MarketplaceTransfer extends BaseEntity {
  listing_id: UUID;
  buyer_id: UUID;
  seller_id: UUID;
  ticket_id: UUID;
  amount: number;
  platform_fee: number;
  seller_proceeds: number;
  status: TransferStatus;
  payment_currency: PaymentCurrency;
  blockchain_signature?: string;
  payment_intent_id?: string;
  transferred_at?: Date;
  failed_at?: Date;
  failure_reason?: string;
}

export interface TransferRequest {
  listing_id: UUID;
  buyer_id: UUID;
  buyer_wallet: string;
  payment_currency: PaymentCurrency;
  idempotency_key?: string;
}

export interface TransferValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface BlockchainTransfer {
  signature: string;
  block_height: number;
  fee: number;
  confirmed_at?: Date;
  from_wallet: string;
  to_wallet: string;
  program_address?: string;
}

export interface TransferMetadata {
  initiated_at: Date;
  completed_at?: Date;
  attempts: number;
  last_error?: string;
  blockchain_confirmations?: number;
}
