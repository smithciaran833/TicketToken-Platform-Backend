"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const internal_auth_1 = require("../../src/middleware/internal-auth");
const crypto_1 = __importDefault(require("crypto"));
describe('Internal Auth Middleware', () => {
    let mockRequest;
    let mockReply;
    beforeEach(() => {
        mockRequest = {
            headers: {},
            body: {},
            url: '/test',
            method: 'POST',
            ip: '127.0.0.1'
        };
        mockReply = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis()
        };
        process.env.INTERNAL_SERVICE_SECRET = 'test-secret-key-minimum-32-chars-long';
    });
    describe('generateInternalAuthHeaders', () => {
        it('should generate valid auth headers', () => {
            const headers = (0, internal_auth_1.generateInternalAuthHeaders)('test-service', { data: 'test' });
            expect(headers['x-internal-service']).toBe('test-service');
            expect(headers['x-timestamp']).toBeDefined();
            expect(headers['x-internal-signature']).toBeDefined();
            expect(headers['x-internal-signature']).toHaveLength(64);
        });
        it('should generate different signatures for different services', () => {
            const headers1 = (0, internal_auth_1.generateInternalAuthHeaders)('service-1', { data: 'test' });
            const headers2 = (0, internal_auth_1.generateInternalAuthHeaders)('service-2', { data: 'test' });
            expect(headers1['x-internal-signature']).not.toBe(headers2['x-internal-signature']);
        });
        it('should generate different signatures for different bodies', () => {
            const headers1 = (0, internal_auth_1.generateInternalAuthHeaders)('test-service', { data: 'test1' });
            const headers2 = (0, internal_auth_1.generateInternalAuthHeaders)('test-service', { data: 'test2' });
            expect(headers1['x-internal-signature']).not.toBe(headers2['x-internal-signature']);
        });
    });
    describe('internalAuthMiddleware', () => {
        it('should reject requests without auth headers', async () => {
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Missing authentication headers'
            });
        });
        it('should reject requests with missing service name', async () => {
            mockRequest.headers['x-timestamp'] = Date.now().toString();
            mockRequest.headers['x-internal-signature'] = 'test';
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
        });
        it('should reject requests with missing timestamp', async () => {
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-internal-signature'] = 'test';
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
        });
        it('should reject requests with missing signature', async () => {
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-timestamp'] = Date.now().toString();
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
        });
        it('should reject requests with old timestamp (replay attack prevention)', async () => {
            const oldTimestamp = (Date.now() - 400000).toString();
            const payload = `test-service:${oldTimestamp}:`;
            const signature = crypto_1.default
                .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET)
                .update(payload)
                .digest('hex');
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-timestamp'] = oldTimestamp;
            mockRequest.headers['x-internal-signature'] = signature;
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Request timestamp is too old'
            });
        });
        it('should reject requests with invalid signature', async () => {
            const timestamp = Date.now().toString();
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-timestamp'] = timestamp;
            mockRequest.headers['x-internal-signature'] = 'invalid-signature';
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).toHaveBeenCalledWith(401);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Invalid signature'
            });
        });
        it('should accept requests with valid signature', async () => {
            const timestamp = Date.now().toString();
            const body = { test: 'data' };
            mockRequest.body = body;
            const payload = `test-service:${timestamp}:${JSON.stringify(body)}`;
            const signature = crypto_1.default
                .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET)
                .update(payload)
                .digest('hex');
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-timestamp'] = timestamp;
            mockRequest.headers['x-internal-signature'] = signature;
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockReply.send).not.toHaveBeenCalled();
            expect(mockRequest.internalService).toBe('test-service');
        });
        it('should accept requests with empty body', async () => {
            const timestamp = Date.now().toString();
            const payload = `test-service:${timestamp}:`;
            const signature = crypto_1.default
                .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET)
                .update(payload)
                .digest('hex');
            mockRequest.headers['x-internal-service'] = 'test-service';
            mockRequest.headers['x-timestamp'] = timestamp;
            mockRequest.headers['x-internal-signature'] = signature;
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockRequest.internalService).toBe('test-service');
        });
        it('should work with generated headers', async () => {
            const body = { test: 'data' };
            mockRequest.body = body;
            const headers = (0, internal_auth_1.generateInternalAuthHeaders)('test-service', body);
            mockRequest.headers['x-internal-service'] = headers['x-internal-service'];
            mockRequest.headers['x-timestamp'] = headers['x-timestamp'];
            mockRequest.headers['x-internal-signature'] = headers['x-internal-signature'];
            await (0, internal_auth_1.internalAuthMiddleware)(mockRequest, mockReply);
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockRequest.internalService).toBe('test-service');
        });
    });
});
//# sourceMappingURL=internal-auth.test.js.map