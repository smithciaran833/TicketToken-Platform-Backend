export interface AuditLog {
    id?: string;
    service: string;
    action: string;
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACCESS' | 'CONFIG';
    userId: string;
    userRole?: string;
    resourceType: string;
    resourceId?: string;
    previousValue?: any;
    newValue?: any;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: Date;
    success: boolean;
    errorMessage?: string;
}
export declare class AuditService {
    private static instance;
    private pool;
    constructor(databaseUrl?: string);
    static getInstance(databaseUrl?: string): AuditService;
    private initializeTable;
    logAction(audit: AuditLog): Promise<void>;
    logAdminAction(service: string, action: string, userId: string, resourceType: string, details?: Partial<AuditLog>): Promise<void>;
    getAuditLogs(filters: {
        service?: string;
        userId?: string;
        resourceType?: string;
        resourceId?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }): Promise<AuditLog[]>;
    getUserActivity(userId: string, days?: number): Promise<AuditLog[]>;
    getResourceHistory(resourceType: string, resourceId: string): Promise<AuditLog[]>;
    generateComplianceReport(startDate: Date, endDate: Date): Promise<any>;
    detectSuspiciousActivity(): Promise<any[]>;
    cleanup(retentionDays?: number): Promise<number>;
}
export declare const auditService: AuditService;
export declare function auditMiddleware(service: string): (req: any, res: any, next: any) => Promise<void>;
//# sourceMappingURL=audit.service.d.ts.map