import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Extend Request interface to include custom properties
interface ExtendedRequest extends Request {
  clientIp?: string;
  db?: any;
}

// Stub for audit logger if shared module isn't available
const auditLogger = {
  log: async (data: any) => {
    console.log('Audit:', data);
  }
};

const AUDIT_ACTIONS = {
  LOGIN_FAILED: 'LOGIN_FAILED'
};

export async function secureLogin(req: ExtendedRequest, res: Response, next: NextFunction): Promise<void> {
  const { email, password } = req.body;
  const ipAddress = req.clientIp || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  
  try {
    // Check if account is locked
    if (req.db) {
      const lockCheck = await req.db.query(
        `SELECT locked_until FROM failed_login_attempts
         WHERE email = $1 AND ip_address = $2 AND locked_until > NOW()`,
        [email, ipAddress]
      );
      
      if (lockCheck.rows.length > 0) {
        await auditLogger.log({
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          resource: 'auth',
          ipAddress,
          userAgent,
          metadata: { email, reason: 'account_locked' },
          severity: 'medium',
          success: false
        });
        
        res.status(429).json({
          error: 'Account temporarily locked due to multiple failed attempts'
        });
        return;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export function generateSecureTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET!,
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '2h') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  return { accessToken, refreshToken };
}
