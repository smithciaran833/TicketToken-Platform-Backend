import { FastifyRequest } from 'fastify';

// =============================================================================
// Extended Request Types for Type Safety
// =============================================================================

/**
 * Authenticated user from JWT
 */
export interface AuthenticatedUser {
  id: string;
  sub?: string;  // JWT subject claim (same as id)
  tenant_id?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

/**
 * Base authenticated request - use in controllers requiring auth
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
  userId?: string;  // Backwards compatibility
  tenantId?: string;
}

/**
 * Request with validated body from Zod schema
 */
export interface ValidatedRequest<T> extends AuthenticatedRequest {
  validatedBody: T;
}

/**
 * Generic request param types
 */
export interface TicketIdParams {
  ticketId: string;
}

export interface ReservationIdParams {
  reservationId: string;
}

export interface EventIdParams {
  eventId: string;
}

export interface UserIdParams {
  userId: string;
}

export interface OrderIdParams {
  orderId: string;
}

export interface IdParams {
  id: string;
}

/**
 * Common query parameters
 */
export interface PaginationQuery {
  limit?: number | string;
  offset?: number | string;
}

export interface TicketQueryParams extends PaginationQuery {
  eventId?: string;
  status?: string;
}

export interface OrderQueryParams extends PaginationQuery {
  status?: string;
}

/**
 * Purchase request body
 */
export interface CreatePurchaseBody {
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
  }>;
  items?: Array<{
    ticketTypeId?: string;
    tierId?: string;
    quantity: number;
  }>;
  tenantId?: string;
  discountCodes?: string[];
  paymentMethodId?: string;
  idempotencyKey?: string;
}

export interface ConfirmPurchaseBody {
  reservationId: string;
  paymentId: string;
}

/**
 * Transfer request body
 */
export interface TransferTicketBody {
  ticketId: string;
  toUserId: string;
  reason?: string;
}

export interface ValidateTransferBody {
  ticketId: string;
  toUserId: string;
}

/**
 * QR validation request body
 */
export interface QRValidateBody {
  qrCode: string;
  eventId: string;
  entrance?: string;
  deviceId?: string;
}

export interface QRGenerateBody {
  ticketId: string;
}

// =============================================================================
// Ticket-related types
// =============================================================================

export interface Ticket {
  id: string;
  tenant_id: string;
  eventId: string;
  ticketTypeId: string;
  orderId?: string;
  userId?: string;  // SINGLE owner column - consolidated
  status: TicketStatus;
  priceCents: number;  // INTEGER cents, not DECIMAL price
  seatNumber?: string;
  section?: string;
  row?: string;
  qrCode?: string;
  qrCodeSecret?: string;
  qrCodeGeneratedAt?: Date;
  nftTokenId?: string;
  nftMintAddress?: string;
  nftTransactionHash?: string;
  nftMintedAt?: Date;
  blockchainStatus?: string;
  paymentId?: string;
  paymentIntentId?: string;
  purchasedAt?: Date;
  validatedAt?: Date;
  usedAt?: Date;
  validatorId?: string;
  entrance?: string;
  deviceId?: string;
  isTransferable: boolean;
  transferLockedUntil?: Date;
  transferCount: number;
  transferHistory: TransferRecord[];
  barcode?: string;
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
  tenant_id: string;
  eventId: string;
  name: string;
  description?: string;
  priceCents: number;  // INTEGER cents only
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  maxPerPurchase: number;
  minPerPurchase: number;
  saleStartDate: Date;
  saleEndDate: Date;
  isActive: boolean;
  displayOrder: number;
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
  tenant_id: string;
  userId: string;
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  totalQuantity: number;
  ticketTypeId?: string;  // For backward compatibility
  expiresAt: Date;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'CANCELLED';
  releasedAt?: Date;
  releaseReason?: string;
  orderId?: string;
  paymentStatus?: string;
  typeName?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
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
  tenantId: string;  // Added for tenant isolation
  eventId: string;
  tickets: Array<{
    ticketTypeId: string;
    quantity: number;
    seatNumbers?: string[];
  }>;
  paymentIntentId?: string;
  metadata?: Record<string, any>;
}

export interface Order {
  id: string;
  tenant_id: string;
  userId: string;
  eventId: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;  // Final amount - INTEGER cents
  originalTotalCents?: number;
  ticketQuantity: number;
  discountCodes?: string[];
  paymentIntentId?: string;
  paymentMethod?: string;
  currency: string;
  idempotencyKey?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  AWAITING_MINT = 'AWAITING_MINT',
  COMPLETED = 'COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  MINT_FAILED = 'MINT_FAILED'
}

export interface OrderItem {
  id: string;
  orderId: string;
  ticketTypeId: string;  // Consistent naming (not tier_id)
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  createdAt: Date;
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
