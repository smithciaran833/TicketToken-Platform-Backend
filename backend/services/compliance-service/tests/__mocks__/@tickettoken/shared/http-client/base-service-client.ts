/**
 * Mock for @tickettoken/shared/http-client/base-service-client
 */
export interface RequestContext {
  tenantId: string;
  traceId?: string;
  userId?: string;
}
