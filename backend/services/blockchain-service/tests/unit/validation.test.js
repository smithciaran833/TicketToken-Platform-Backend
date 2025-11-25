"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../../src/middleware/validation");
const web3_js_1 = require("@solana/web3.js");
describe('Validation Middleware', () => {
    describe('isValidSolanaAddress', () => {
        it('should validate correct Solana addresses', () => {
            const validAddress = web3_js_1.Keypair.generate().publicKey.toString();
            expect((0, validation_1.isValidSolanaAddress)(validAddress)).toBe(true);
        });
        it('should reject invalid addresses', () => {
            expect((0, validation_1.isValidSolanaAddress)('invalid')).toBe(false);
            expect((0, validation_1.isValidSolanaAddress)('')).toBe(false);
            expect((0, validation_1.isValidSolanaAddress)('123')).toBe(false);
        });
        it('should reject non-string inputs', () => {
            expect((0, validation_1.isValidSolanaAddress)(null)).toBe(false);
            expect((0, validation_1.isValidSolanaAddress)(undefined)).toBe(false);
            expect((0, validation_1.isValidSolanaAddress)(123)).toBe(false);
        });
    });
    describe('isValidSignature', () => {
        it('should validate correct signature format', () => {
            const validSig = '5' + 'a'.repeat(87);
            expect((0, validation_1.isValidSignature)(validSig)).toBe(true);
        });
        it('should reject invalid signature formats', () => {
            expect((0, validation_1.isValidSignature)('tooshort')).toBe(false);
            expect((0, validation_1.isValidSignature)('')).toBe(false);
            expect((0, validation_1.isValidSignature)('invalid!@#$')).toBe(false);
        });
        it('should reject non-string inputs', () => {
            expect((0, validation_1.isValidSignature)(null)).toBe(false);
            expect((0, validation_1.isValidSignature)(undefined)).toBe(false);
        });
    });
    describe('sanitizeString', () => {
        it('should remove dangerous characters', () => {
            expect((0, validation_1.sanitizeString)('<script>')).toBe('script');
            expect((0, validation_1.sanitizeString)('test"value')).toBe('testvalue');
            expect((0, validation_1.sanitizeString)("test'value")).toBe('testvalue');
        });
        it('should trim whitespace', () => {
            expect((0, validation_1.sanitizeString)('  test  ')).toBe('test');
        });
        it('should limit length to 500 chars', () => {
            const longString = 'a'.repeat(600);
            expect((0, validation_1.sanitizeString)(longString)).toHaveLength(500);
        });
        it('should handle non-string inputs', () => {
            expect((0, validation_1.sanitizeString)(null)).toBe('');
            expect((0, validation_1.sanitizeString)(undefined)).toBe('');
        });
    });
    describe('validateAddressParam', () => {
        let mockRequest;
        let mockReply;
        beforeEach(() => {
            mockRequest = {
                params: {},
                url: '/test',
                ip: '127.0.0.1'
            };
            mockReply = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn().mockReturnThis()
            };
        });
        it('should accept valid Solana address', async () => {
            const validAddress = web3_js_1.Keypair.generate().publicKey.toString();
            mockRequest.params.address = validAddress;
            await (0, validation_1.validateAddressParam)(mockRequest, mockReply);
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockReply.send).not.toHaveBeenCalled();
        });
        it('should reject invalid Solana address', async () => {
            mockRequest.params.address = 'invalid-address';
            await (0, validation_1.validateAddressParam)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(400);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Bad Request',
                message: 'Invalid Solana address format'
            });
        });
    });
    describe('validateSignatureParam', () => {
        let mockRequest;
        let mockReply;
        beforeEach(() => {
            mockRequest = {
                params: {},
                url: '/test',
                ip: '127.0.0.1'
            };
            mockReply = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn().mockReturnThis()
            };
        });
        it('should accept valid signature', async () => {
            const validSig = '5' + 'a'.repeat(87);
            mockRequest.params.signature = validSig;
            await (0, validation_1.validateSignatureParam)(mockRequest, mockReply);
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockReply.send).not.toHaveBeenCalled();
        });
        it('should reject invalid signature', async () => {
            mockRequest.params.signature = 'invalid';
            await (0, validation_1.validateSignatureParam)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(400);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Bad Request',
                message: 'Invalid transaction signature format'
            });
        });
    });
});
//# sourceMappingURL=validation.test.js.map