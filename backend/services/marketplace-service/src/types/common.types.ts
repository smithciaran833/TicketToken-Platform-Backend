export type UUID = string;
export type Timestamp = Date;

export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
export type TransferStatus = 'initiated' | 'pending' | 'completed' | 'failed' | 'refunded';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'cancelled';
export type PaymentCurrency = 'USDC' | 'SOL';
export type UserRole = 'buyer' | 'seller' | 'admin' | 'venue_owner';

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuthUser {
  id: UUID;
  wallet: string;
  email?: string;
  role: UserRole;
  tenant_id?: UUID;
}

export interface IdempotencyContext {
  key: string;
  request_id: string;
  processed?: boolean;
}

export interface BaseEntity {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}
