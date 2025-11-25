/**
 * Transfer Service Models & Types
 * Phase 2: Code Restructuring
 */

export interface Transfer {
  id: string;
  ticket_id: string;
  from_user_id: string;
  to_user_id: string;
  to_email: string;
  transfer_method: 'GIFT' | 'SALE' | 'CLAIM';
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  acceptance_code: string;
  message?: string;
  is_gift: boolean;
  expires_at: Date;
  accepted_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Ticket {
  id: string;
  user_id: string;
  ticket_type_id: string;
  event_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface TicketType {
  id: string;
  name: string;
  is_transferable: boolean;
  transfer_blocked_before_hours?: number;
  max_transfers?: number;
}

export interface User {
  id: string;
  email: string;
  status: 'active' | 'pending' | 'suspended';
  tenant_id?: string;
}

export interface TransferTransaction {
  id: string;
  ticket_id: string;
  user_id: string;
  transaction_type: string;
  amount: number;
  status: string;
  metadata: Record<string, any>;
  created_at: Date;
}

// Request/Response DTOs
export interface CreateGiftTransferRequest {
  ticketId: string;
  toEmail: string;
  message?: string;
}

export interface CreateGiftTransferResponse {
  transferId: string;
  acceptanceCode: string;
  status: 'PENDING';
  expiresAt: Date;
}

export interface AcceptTransferRequest {
  acceptanceCode: string;
  userId: string;
}

export interface AcceptTransferResponse {
  success: boolean;
  ticketId: string;
  newOwnerId: string;
}

// Service errors
export class TransferError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'TransferError';
  }
}

export class TransferNotFoundError extends TransferError {
  constructor(message: string = 'Transfer not found') {
    super(message, 'TRANSFER_NOT_FOUND', 404);
  }
}

export class TransferExpiredError extends TransferError {
  constructor(message: string = 'Transfer has expired') {
    super(message, 'TRANSFER_EXPIRED', 400);
  }
}

export class TicketNotFoundError extends TransferError {
  constructor(message: string = 'Ticket not found or not owned by user') {
    super(message, 'TICKET_NOT_FOUND', 404);
  }
}

export class TicketNotTransferableError extends TransferError {
  constructor(message: string = 'This ticket type is not transferable') {
    super(message, 'TICKET_NOT_TRANSFERABLE', 400);
  }
}
