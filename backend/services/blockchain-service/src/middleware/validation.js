"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidSolanaAddress = isValidSolanaAddress;
exports.isValidSignature = isValidSignature;
exports.sanitizeString = sanitizeString;
exports.validateAddressParam = validateAddressParam;
exports.validateSignatureParam = validateSignatureParam;
exports.validateMintParam = validateMintParam;
exports.validateQueryParams = validateQueryParams;
exports.validateMintRequest = validateMintRequest;
exports.validateConfirmationRequest = validateConfirmationRequest;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("../utils/logger");
function isValidSolanaAddress(address) {
    if (!address || typeof address !== 'string') {
        return false;
    }
    try {
        new web3_js_1.PublicKey(address);
        return true;
    }
    catch {
        return false;
    }
}
function isValidSignature(signature) {
    if (!signature || typeof signature !== 'string') {
        return false;
    }
    return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
}
function sanitizeString(input) {
    if (typeof input !== 'string') {
        return '';
    }
    return input
        .replace(/[<>\"']/g, '')
        .trim()
        .slice(0, 500);
}
async function validateAddressParam(request, reply) {
    const { address } = request.params;
    if (!isValidSolanaAddress(address)) {
        logger_1.logger.warn('Invalid Solana address', {
            address,
            path: request.url,
            ip: request.ip
        });
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid Solana address format'
        });
    }
}
async function validateSignatureParam(request, reply) {
    const { signature } = request.params;
    if (!isValidSignature(signature)) {
        logger_1.logger.warn('Invalid transaction signature', {
            signature,
            path: request.url,
            ip: request.ip
        });
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid transaction signature format'
        });
    }
}
async function validateMintParam(request, reply) {
    const { mint } = request.params;
    if (!isValidSolanaAddress(mint)) {
        logger_1.logger.warn('Invalid mint address', {
            mint,
            path: request.url,
            ip: request.ip
        });
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid mint address format'
        });
    }
}
async function validateQueryParams(request, reply) {
    const { limit } = request.query;
    if (limit !== undefined) {
        const limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            logger_1.logger.warn('Invalid limit parameter', {
                limit,
                path: request.url,
                ip: request.ip
            });
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Limit must be between 1 and 100'
            });
        }
    }
}
async function validateMintRequest(request, reply) {
    const body = request.body;
    if (!body) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Request body is required'
        });
    }
    if (!body.ticketIds || !Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
        logger_1.logger.warn('Invalid ticketIds in mint request', {
            body,
            path: request.url,
            ip: request.ip
        });
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'ticketIds must be a non-empty array'
        });
    }
    if (!body.ticketIds.every((id) => typeof id === 'string')) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'All ticketIds must be strings'
        });
    }
    if (!body.eventId || typeof body.eventId !== 'string') {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'eventId is required and must be a string'
        });
    }
    if (!body.userId || typeof body.userId !== 'string') {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'userId is required and must be a string'
        });
    }
    if (body.queue && typeof body.queue !== 'string') {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'queue must be a string'
        });
    }
}
async function validateConfirmationRequest(request, reply) {
    const body = request.body;
    if (!body) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Request body is required'
        });
    }
    if (!body.signature || !isValidSignature(body.signature)) {
        logger_1.logger.warn('Invalid signature in confirmation request', {
            signature: body.signature,
            path: request.url,
            ip: request.ip
        });
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Valid signature is required'
        });
    }
    if (body.commitment) {
        const validCommitments = ['processed', 'confirmed', 'finalized'];
        if (!validCommitments.includes(body.commitment)) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'commitment must be one of: processed, confirmed, finalized'
            });
        }
    }
    if (body.timeout !== undefined) {
        const timeout = parseInt(body.timeout, 10);
        if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'timeout must be between 1000 and 120000 milliseconds'
            });
        }
    }
}
exports.default = {
    validateAddressParam,
    validateSignatureParam,
    validateMintParam,
    validateQueryParams,
    validateMintRequest,
    validateConfirmationRequest,
    isValidSolanaAddress,
    isValidSignature,
    sanitizeString
};
//# sourceMappingURL=validation.js.map