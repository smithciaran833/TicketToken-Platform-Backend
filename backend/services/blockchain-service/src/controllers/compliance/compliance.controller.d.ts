import { FastifyRequest, FastifyReply } from 'fastify';
export declare class ComplianceController {
    getFeeBreakdown(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    getOrderFees(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    requestDataExport(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    requestAccountDeletion(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    getVenueFeeReport(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    getPrivacyPolicy(_req: FastifyRequest, reply: FastifyReply): Promise<void>;
    private verifyOrderOwnership;
    private verifyVenueAccess;
}
export declare const complianceController: ComplianceController;
//# sourceMappingURL=compliance.controller.d.ts.map