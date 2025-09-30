// Ticket-related types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  userId?: string;
  owner_user_id?: string;
  status: TicketStatus;
  price: number;
  seatNumber?: string;
  section?: string;
  row?: string;
  qrCode: string;
  qrCodeSecret: string;
  nftTokenId?: string;
  nftTransactionHash?: string;
  nftMintedAt?: Date;
  purchasedAt?: Date;
  validatedAt?: Date;
  transferHistory: TransferRecord[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TicketStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRANSFERRED = 'TRANSFERRED'
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  availableQuantity: number;
  maxPerPurchase: number;
  saleStartDate: Date;
  saleEndDate: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferRecord {
  fromUserId: string;
  toUserId: string;
  transferredAt: Date;
  transactionHash?: string;
  reason?: string;
}

export interface TicketReservation {
  id: string;
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  expiresAt: Date;
  status: 'active' | 'completed' | 'expired';
  createdAt: Date;
}

export interface QRValidation {
  ticketId: string;
  eventId: string;
  isValid: boolean;
  validatedAt?: Date;
  validatorId?: string;
  entrance?: string;
  deviceId?: string;
  reason?: string;
}

export interface PurchaseRequest {
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  paymentIntentId?: string;
  metadata?: Record<string, any>;
}

export interface NFTMintRequest {
  ticketId: string;
  owner: string;
  metadata: {
    eventId: string;
    eventName: string;
    venueName: string;
    eventDate: string;
    ticketType: string;
    seatInfo?: string;
    imageUrl: string;
  };
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Express extensions
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    venueId?: string;
  };
}
