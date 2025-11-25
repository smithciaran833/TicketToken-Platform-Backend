import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ResolvedSDKConfig } from '../types/config';
import { handleAPIError } from '../errors';

/**
 * HTTP client for making API requests
 */
export class HTTPClient {
  private axios: AxiosInstance;
  private config: ResolvedSDKConfig;

  constructor(config: ResolvedSDKConfig) {
    this.config = config;
    this.axios = axios.create({
      baseURL: config.baseUrl,  // ← FIXED: baseURL to baseUrl
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `TicketToken-SDK/1.0.0`,
        ...config.headers,
      },
      httpAgent: config.httpAgent,
      httpsAgent: config.httpsAgent,
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        // Add auth header
        if (this.config.apiKey) {
          config.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        // Debug logging
        if (this.config.debug) {
          console.log('[SDK Request]', {
            method: config.method,
            url: config.url,
            headers: config.headers,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        if (this.config.debug) {
          console.error('[SDK Request Error]', error);
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        // Debug logging
        if (this.config.debug) {
          console.log('[SDK Response]', {
            status: response.status,
            data: response.data,
          });
        }

        return response;
      },
      async (error) => {
        if (this.config.debug) {
          console.error('[SDK Response Error]', {
            status: error.response?.status,
            data: error.response?.data,
          });
        }

        // Handle retries for specific error codes
        const config = error.config;

        if (!config._retryCount) {
          config._retryCount = 0;
        }

        const shouldRetry = this.shouldRetry(error, config._retryCount);

        if (shouldRetry && config._retryCount < this.config.maxRetries) {
          config._retryCount += 1;

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, config._retryCount), 10000);

          if (this.config.debug) {
            console.log(`[SDK Retry] Attempt ${config._retryCount} after ${delay}ms`);
          }

          await this.sleep(delay);
          return this.axios.request(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: any, retryCount: number): boolean {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    // Retry on network errors
    if (!error.response) {
      return true;
    }

    // Retry on specific status codes
    const status = error.response.status;
    return status === 429 || status === 503 || status >= 500;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make GET request
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.get(url, config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Make POST request
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.post(url, data, config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Make PUT request
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.put(url, data, config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Make PATCH request
   */
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.patch(url, data, config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Make DELETE request
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.delete(url, config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Make custom request
   */
  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.request(config);
      return response.data;
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResolvedSDKConfig>): void {
    this.config = { ...this.config, ...config };

    // Update axios defaults
    if (config.baseUrl) {
      this.axios.defaults.baseURL = config.baseUrl;
    }
    if (config.timeout) {
      this.axios.defaults.timeout = config.timeout;
    }
    if (config.headers) {
      this.axios.defaults.headers = {
        ...this.axios.defaults.headers,
        ...config.headers,
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ResolvedSDKConfig {
    return { ...this.config };
  }
}
