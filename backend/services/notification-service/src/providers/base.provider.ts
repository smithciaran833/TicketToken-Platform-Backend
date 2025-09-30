export interface NotificationResult {
  id: string;
  status: 'sent' | 'failed' | 'queued' | 'delivered' | 'bounced';
  channel: 'email' | 'sms' | 'push';
  timestamp: string;
  provider: string;
  metadata?: Record<string, any>;
}

export interface BaseProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  from?: string;
  region?: string;
  sandbox?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export abstract class BaseProvider {
  protected config: BaseProviderConfig;
  protected name: string;

  constructor(config: BaseProviderConfig = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  abstract verify(): Promise<boolean>;
  abstract getStatus(): Promise<Record<string, any>>;
}
