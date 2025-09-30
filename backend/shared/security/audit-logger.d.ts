interface AuditEntry {
    userId?: string;
    tenantId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
    severity: 'low' | 'medium' | 'high' | 'critical';
    success: boolean;
}
declare class AuditLogger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): AuditLogger;
    log(entry: AuditEntry): Promise<void>;
    logFailedLogin(email: string, ipAddress: string, userAgent: string): Promise<void>;
}
export declare const auditLogger: AuditLogger;
export declare const AUDIT_ACTIONS: {
    LOGIN: string;
    LOGOUT: string;
    LOGIN_FAILED: string;
    PASSWORD_RESET: string;
    PAYMENT_INITIATED: string;
    PAYMENT_COMPLETED: string;
    REFUND_ISSUED: string;
    TICKET_PURCHASED: string;
    TICKET_TRANSFERRED: string;
    TICKET_SCANNED: string;
    ADMIN_ACCESS: string;
    ADMIN_OVERRIDE: string;
    RATE_LIMIT_EXCEEDED: string;
    SQL_INJECTION_ATTEMPT: string;
};
export {};
//# sourceMappingURL=audit-logger.d.ts.map