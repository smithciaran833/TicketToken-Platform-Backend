import { TicketSelection } from './payment.types';

export interface GroupPayment {
  id: string;
  organizerId: string;
  eventId: string;
  totalAmount: number;
  ticketSelections: TicketSelection[];
  members: GroupMember[];
  expiresAt: Date;
  status: GroupPaymentStatus;
  createdAt: Date;
}

export interface GroupMember {
  id: string;
  userId?: string;
  email: string;
  name: string;
  amountDue: number;
  paid: boolean;
  paidAt?: Date;
  paymentId?: string;
  remindersSent: number;
}

export enum GroupPaymentStatus {
  COLLECTING = 'collecting',
  COMPLETED = 'completed',
  PARTIALLY_PAID = 'partially_paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}
