export enum IntegrationType {
  SQUARE = 'square',
  STRIPE = 'stripe',
  MAILCHIMP = 'mailchimp',
  QUICKBOOKS = 'quickbooks'
}

export enum IntegrationStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  SUSPENDED = 'suspended'
}

export enum SyncDirection {
  TO_PROVIDER = 'to_provider',
  FROM_PROVIDER = 'from_provider',
  BIDIRECTIONAL = 'bidirectional'
}

export interface IntegrationConfig {
  id: string;
  venueId: string;
  integrationType: IntegrationType;
  status: IntegrationStatus;
  config: {
    syncEnabled: boolean;
    syncInterval: number;
    syncDirection: SyncDirection;
    filters?: any;
  };
  fieldMappings: Record<string, string>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}
