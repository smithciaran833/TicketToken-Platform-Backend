export interface RequestContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

export class BaseServiceClient {
  constructor(baseUrl: string) {}
}
