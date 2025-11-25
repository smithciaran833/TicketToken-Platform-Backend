import { Request, Response, NextFunction } from 'express';
import { CacheService, CacheOptions } from './cache-service';
export interface CacheMiddlewareOptions extends CacheOptions {
    keyGenerator?: (req: Request) => string;
    condition?: (req: Request) => boolean;
    excludePaths?: string[];
    includeQuery?: boolean;
    includeBody?: boolean;
    varyByHeaders?: string[];
    varyByUser?: boolean;
}
export declare class CacheMiddleware {
    private cache;
    constructor(cache: CacheService);
    auto(options?: CacheMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    invalidate(pattern?: string | ((req: Request) => string[])): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    invalidateTags(tagGenerator: (req: Request) => string[]): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    private generateKey;
    private getCacheableHeaders;
    private findKeys;
}
//# sourceMappingURL=cache-middleware.d.ts.map