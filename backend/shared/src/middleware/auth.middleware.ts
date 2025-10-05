import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string;

try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  console.log('✓ JWT public key loaded for verification');
} catch (error) {
  console.error('✗ Failed to load JWT public key:', error);
  throw new Error('JWT public key not found at ' + publicKeyPath);
}

export interface AuthRequest extends Request {
  user?: any;
  userId?: string;
  tenantId?: string;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
      audience: process.env.JWT_ISSUER || 'tickettoken-auth'
    }) as any;
    
    // Attach user info to request
    req.user = decoded;
    req.userId = decoded.userId || decoded.id || decoded.sub;
    req.tenantId = decoded.tenantId || decoded.tenant_id;
    
    next();
  } catch (error: any) {
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
