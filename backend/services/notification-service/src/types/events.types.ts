export interface BaseEvent {
  eventId: string;
  timestamp: Date;
  venueId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentCompletedEvent extends BaseEvent {
  type: 'payment.completed';
  data: {
    orderId: string;
    customerId: string;
    amount: number;
    currency: string;
    tickets: Array<{
      ticketId: string;
      eventName: string;
      eventDate: Date;
      venueName: string;
    }>;
    paymentMethod: string;
  };
}

export interface TicketTransferredEvent extends BaseEvent {
  type: 'ticket.transferred';
  data: {
    ticketId: string;
    fromUserId: string;
    toUserId: string;
    fromEmail: string;
    toEmail: string;
    eventName: string;
    eventDate: Date;
    transferredAt: Date;
  };
}

export interface EventReminderEvent extends BaseEvent {
  type: 'event.reminder';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    venueName: string;
    venueAddress: string;
    ticketHolders: Array<{
      userId: string;
      email: string;
      ticketId: string;
    }>;
  };
}

export interface EventCancelledEvent extends BaseEvent {
  type: 'event.cancelled';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    reason: string;
    refundAvailable: boolean;
    affectedTickets: Array<{
      ticketId: string;
      userId: string;
      email: string;
    }>;
  };
}

export interface UserRegisteredEvent extends BaseEvent {
  type: 'user.registered';
  data: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    registrationSource: string;
    verificationToken?: string;
  };
}

export interface PasswordResetEvent extends BaseEvent {
  type: 'user.password_reset';
  data: {
    userId: string;
    email: string;
    resetToken: string;
    expiresAt: Date;
  };
}

export type NotificationEvent = 
  | PaymentCompletedEvent
  | TicketTransferredEvent
  | EventReminderEvent
  | EventCancelledEvent
  | UserRegisteredEvent
  | PasswordResetEvent;
