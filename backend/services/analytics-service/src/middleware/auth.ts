/**
 * @deprecated THIS FILE HAS BEEN DISABLED FOR SECURITY REASONS
 * 
 * AUDIT FIX: SEC-5 - Mock authentication that bypassed all security
 * 
 * This file previously contained mock authentication that hardcoded user-123
 * with full permissions for ANY Bearer token. This has been removed.
 * 
 * Use auth.middleware.ts for proper JWT validation instead.
 * 
 * @see auth.middleware.ts
 */

throw new Error(
  'SECURITY: middleware/auth.ts has been disabled. ' +
  'This file contained mock authentication that bypassed all security. ' +
  'Use auth.middleware.ts for proper JWT validation.'
);

// Prevent any exports from being used
export {};
