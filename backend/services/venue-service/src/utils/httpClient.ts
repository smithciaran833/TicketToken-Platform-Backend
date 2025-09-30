import axios from 'axios';
import CircuitBreaker from 'opossum';

export class HttpClient {
  private client: any;
  private circuitBreaker: CircuitBreaker;

  constructor(baseURL: string, private logger: any) {
    this.client = axios.create({
      baseURL,
      timeout: 10000
    });

    // Circuit breaker configuration
    this.circuitBreaker = new CircuitBreaker(
      async (config: any) => this.client.request(config),
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: any) => {
        this.logger.debug({ url: config.url, method: config.method }, 'HTTP request');
        return config;
      },
      (error: any) => {
        this.logger.error({ error }, 'HTTP request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: any) => {
        this.logger.debug({ url: response.config.url, status: response.status }, 'HTTP response');
        return response;
      },
      (error: any) => {
        this.logger.error({ 
          url: error.config?.url,
          status: error.response?.status,
          error: error.message 
        }, 'HTTP response error');
        return Promise.reject(error);
      }
    );
  }

  async get(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'GET', url });
  }

  async post(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'POST', url, data });
  }

  async put(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'PUT', url, data });
  }

  async delete(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'DELETE', url });
  }
}
