"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
    path_1.default.join(process.env.HOME, 'tickettoken-secrets', 'jwt-public.pem');
let publicKey;
try {
    publicKey = fs_1.default.readFileSync(publicKeyPath, 'utf8');
    console.log('✓ JWT public key loaded for verification');
}
catch (error) {
    console.error('✗ Failed to load JWT public key:', error);
    throw new Error('JWT public key not found at ' + publicKeyPath);
}
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, publicKey, {
            algorithms: ['RS256'],
            issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
            audience: process.env.JWT_ISSUER || 'tickettoken-auth'
        });
        req.user = decoded;
        req.userId = decoded.userId || decoded.id || decoded.sub;
        req.tenantId = decoded.tenantId || decoded.tenant_id;
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expired' });
            return;
        }
        if (error.name === 'JsonWebTokenError') {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
}
//# sourceMappingURL=auth.middleware.js.map