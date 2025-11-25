export declare const QUEUES: {
    readonly PAYMENT_INTENT: "payment.intent";
    readonly PAYMENT_WEBHOOK: "payment.webhook";
    readonly REFUND_PROCESS: "refund.process";
    readonly TICKET_MINT: "ticket.mint";
    readonly TICKET_TRANSFER: "ticket.transfer";
    readonly TICKET_VALIDATE: "ticket.validate";
    readonly EMAIL_SEND: "notification.email";
    readonly SMS_SEND: "notification.sms";
    readonly BLOCKCHAIN_MINT: "blockchain.mint";
    readonly BLOCKCHAIN_INDEX: "blockchain.index";
    readonly EVENT_TRACK: "analytics.event";
    readonly METRICS_AGGREGATE: "analytics.metrics";
};
export declare const QUEUE_PRIORITIES: {
    readonly CRITICAL: 1;
    readonly HIGH: 2;
    readonly NORMAL: 3;
    readonly LOW: 4;
};
//# sourceMappingURL=queues.d.ts.map