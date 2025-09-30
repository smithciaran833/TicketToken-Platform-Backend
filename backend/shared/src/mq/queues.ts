// Centralized queue definitions for all services
export const QUEUES = {
  // Payment & Financial
  PAYMENT_INTENT: 'payment.intent',
  PAYMENT_WEBHOOK: 'payment.webhook',
  REFUND_PROCESS: 'refund.process',
  
  // Ticketing
  TICKET_MINT: 'ticket.mint',
  TICKET_TRANSFER: 'ticket.transfer',
  TICKET_VALIDATE: 'ticket.validate',
  
  // Notifications
  EMAIL_SEND: 'notification.email',
  SMS_SEND: 'notification.sms',
  
  // Blockchain
  BLOCKCHAIN_MINT: 'blockchain.mint',
  BLOCKCHAIN_INDEX: 'blockchain.index',
  
  // Analytics
  EVENT_TRACK: 'analytics.event',
  METRICS_AGGREGATE: 'analytics.metrics'
} as const;

export const QUEUE_PRIORITIES = {
  CRITICAL: 1,  // Payment, refunds
  HIGH: 2,      // Ticket minting
  NORMAL: 3,    // Notifications
  LOW: 4        // Analytics
} as const;
