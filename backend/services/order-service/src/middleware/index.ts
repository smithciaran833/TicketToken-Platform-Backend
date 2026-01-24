// SEC-R1: Auth middleware exports
export * from './tenant.middleware';
export * from './idempotency.middleware';

// S2S1, IR2: Internal auth middleware exports (CRITICAL: Enable for internal routes)
export { internalAuthMiddleware } from './internal-auth.middleware';
