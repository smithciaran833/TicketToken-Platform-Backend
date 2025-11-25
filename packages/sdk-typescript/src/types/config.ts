/**
 * SDK Configuration Options
 */
export interface SDKConfig {
  /** API key for authentication */
  apiKey: string;

  /** Environment to use (production, staging, development) */
  environment?: 'production' | 'staging' | 'development';

  /** Custom base URL (overrides environment) */
  baseUrl?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;

  /** HTTP agent for custom networking configuration */
  httpAgent?: any;

  /** HTTPS agent for custom networking configuration */
  httpsAgent?: any;
}

/**
 * Internal SDK configuration with defaults applied
 */
export interface ResolvedSDKConfig extends Required<Omit<SDKConfig, 'baseUrl' | 'httpAgent' | 'httpsAgent' | 'headers'>> {
  baseUrl: string;
  headers: Record<string, string>;
  httpAgent?: any;
  httpsAgent?: any;
}

/**
 * Environment configuration
 */
export const ENVIRONMENTS = {
  production: 'https://api.tickettoken.com',
  staging: 'https://api-staging.tickettoken.com',
  development: 'http://localhost:3000',
} as const;

/**
 * Default SDK configuration values
 */
export const DEFAULT_CONFIG: Partial<ResolvedSDKConfig> = {
  environment: 'production',
  timeout: 30000,
  maxRetries: 3,
  debug: false,
  headers: {},
};
