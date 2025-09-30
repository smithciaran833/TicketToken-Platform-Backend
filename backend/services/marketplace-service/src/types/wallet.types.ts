import { UUID, Timestamp } from './common.types';

export interface WalletInfo {
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  balance?: number;
  is_valid: boolean;
  is_program_wallet?: boolean;
  owner_id?: UUID;
}

export interface WalletTransaction {
  signature: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: Timestamp;
  status: 'pending' | 'confirmed' | 'failed';
  block_height?: number;
}

export interface WalletBalance {
  wallet_address: string;
  sol_balance: number;
  usdc_balance: number;
  token_count?: number;
  last_updated: Timestamp;
}

export interface WalletVerification {
  wallet_address: string;
  message: string;
  signature: string;
  verified: boolean;
  verified_at?: Timestamp;
}
