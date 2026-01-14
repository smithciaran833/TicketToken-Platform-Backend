// Import Fastify type augmentations (this ensures the module augmentation is loaded)
/// <reference path="./fastify.d.ts" />

// Re-export types for use throughout the service
export { RequestUser, RequestVenue, TenantContext } from './fastify.d';

// Re-export all types
export * from './analytics.types';
export * from './widget.types';
export * from './dashboard.types';
export * from './customer.types';
export * from './campaign.types';
export * from './prediction.types';
export * from './export.types';
export * from './alert.types';
export * from './common.types';
