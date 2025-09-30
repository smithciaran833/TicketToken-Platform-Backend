import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        venues?: string[];
        isAdmin?: boolean;
      };
      sessionId?: string;
    }
  }
}

export {};
