import { FastifyRequest, FastifyReply } from 'fastify';
interface InternalAuthHeaders {
    'x-internal-service': string;
    'x-timestamp': string;
    'x-internal-signature': string;
}
export declare function internalAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<undefined>;
export declare function generateInternalAuthHeaders(serviceName: string, body?: any): InternalAuthHeaders;
export default internalAuthMiddleware;
//# sourceMappingURL=internal-auth.d.ts.map