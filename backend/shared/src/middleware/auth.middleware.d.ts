import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: any;
    userId?: string;
    tenantId?: string;
}
export declare function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map