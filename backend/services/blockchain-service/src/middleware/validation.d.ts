import { FastifyRequest, FastifyReply } from 'fastify';
export declare function isValidSolanaAddress(address: string): boolean;
export declare function isValidSignature(signature: string): boolean;
export declare function sanitizeString(input: string): string;
export declare function validateAddressParam(request: FastifyRequest<{
    Params: {
        address: string;
    };
}>, reply: FastifyReply): Promise<undefined>;
export declare function validateSignatureParam(request: FastifyRequest<{
    Params: {
        signature: string;
    };
}>, reply: FastifyReply): Promise<undefined>;
export declare function validateMintParam(request: FastifyRequest<{
    Params: {
        mint: string;
    };
}>, reply: FastifyReply): Promise<undefined>;
export declare function validateQueryParams(request: FastifyRequest<{
    Querystring: {
        limit?: string;
    };
}>, reply: FastifyReply): Promise<undefined>;
export declare function validateMintRequest(request: FastifyRequest<{
    Body: {
        ticketIds?: any;
        eventId?: any;
        userId?: any;
        queue?: any;
    };
}>, reply: FastifyReply): Promise<undefined>;
export declare function validateConfirmationRequest(request: FastifyRequest<{
    Body: {
        signature?: any;
        commitment?: any;
        timeout?: any;
    };
}>, reply: FastifyReply): Promise<undefined>;
declare const _default: {
    validateAddressParam: typeof validateAddressParam;
    validateSignatureParam: typeof validateSignatureParam;
    validateMintParam: typeof validateMintParam;
    validateQueryParams: typeof validateQueryParams;
    validateMintRequest: typeof validateMintRequest;
    validateConfirmationRequest: typeof validateConfirmationRequest;
    isValidSolanaAddress: typeof isValidSolanaAddress;
    isValidSignature: typeof isValidSignature;
    sanitizeString: typeof sanitizeString;
};
export default _default;
//# sourceMappingURL=validation.d.ts.map