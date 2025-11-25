import { SDKConfig, ResolvedSDKConfig, DEFAULT_CONFIG, ENVIRONMENTS } from './types/config';
import { ConfigurationError } from './errors';
import { HTTPClient } from './client/http-client';
import { Events } from './resources/events';
import { Tickets } from './resources/tickets';
import { Users } from './resources/users';

/**
 * Main TicketToken SDK class
 */
export class TicketTokenSDK {
  private config: ResolvedSDKConfig;
  private httpClient: HTTPClient;

  public readonly events: Events;
  public readonly tickets: Tickets;
  public readonly users: Users;

  constructor(config: SDKConfig) {
    this.config = this.resolveConfig(config);
    this.httpClient = new HTTPClient(this.config);

    // Initialize resource modules
    this.events = new Events(this.httpClient);
    this.tickets = new Tickets(this.httpClient);
    this.users = new Users(this.httpClient);
  }

  /**
   * Resolve and validate SDK configuration
   */
  private resolveConfig(config: SDKConfig): ResolvedSDKConfig {
    // Validate API key
    if (!config.apiKey) {
      throw new ConfigurationError('API key is required');
    }

    // Determine base URL
    let baseUrl: string;
    if (config.baseUrl) {
      baseUrl = config.baseUrl;
    } else {
      const environment = config.environment || DEFAULT_CONFIG.environment!;
      baseUrl = ENVIRONMENTS[environment];
    }

    // Merge with defaults
    return {
      apiKey: config.apiKey,
      environment: config.environment || DEFAULT_CONFIG.environment!,
      baseUrl,
      timeout: config.timeout || DEFAULT_CONFIG.timeout!,
      maxRetries: config.maxRetries || DEFAULT_CONFIG.maxRetries!,
      debug: config.debug || DEFAULT_CONFIG.debug!,
      headers: { ...DEFAULT_CONFIG.headers, ...config.headers },
      httpAgent: config.httpAgent,
      httpsAgent: config.httpsAgent,
    };
  }

  /**
   * Update SDK configuration
   */
  updateConfig(config: Partial<SDKConfig>): void {
    // Update resolved config
    if (config.environment && !config.baseUrl) {
      config.baseUrl = ENVIRONMENTS[config.environment];
    }

    this.config = {
      ...this.config,
      ...config,
      headers: {
        ...this.config.headers,
        ...config.headers,
      },
    } as ResolvedSDKConfig;

    // Update HTTP client
    this.httpClient.updateConfig(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ResolvedSDKConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.updateConfig({ apiKey });
  }

  /**
   * Set environment
   */
  setEnvironment(environment: 'production' | 'staging' | 'development'): void {
    this.updateConfig({ environment });
  }

  /**
   * Enable/disable debug mode
   */
  setDebug(debug: boolean): void {
    this.updateConfig({ debug });
  }
}
