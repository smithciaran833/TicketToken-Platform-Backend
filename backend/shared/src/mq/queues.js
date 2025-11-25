"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_PRIORITIES = exports.QUEUES = void 0;
exports.QUEUES = {
    PAYMENT_INTENT: 'payment.intent',
    PAYMENT_WEBHOOK: 'payment.webhook',
    REFUND_PROCESS: 'refund.process',
    TICKET_MINT: 'ticket.mint',
    TICKET_TRANSFER: 'ticket.transfer',
    TICKET_VALIDATE: 'ticket.validate',
    EMAIL_SEND: 'notification.email',
    SMS_SEND: 'notification.sms',
    BLOCKCHAIN_MINT: 'blockchain.mint',
    BLOCKCHAIN_INDEX: 'blockchain.index',
    EVENT_TRACK: 'analytics.event',
    METRICS_AGGREGATE: 'analytics.metrics'
};
exports.QUEUE_PRIORITIES = {
    CRITICAL: 1,
    HIGH: 2,
    NORMAL: 3,
    LOW: 4
};
//# sourceMappingURL=queues.js.map