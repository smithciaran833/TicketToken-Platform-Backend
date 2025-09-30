import { serviceUrls } from '../config/services';
import axios, { AxiosRequestConfig } from 'axios';

export class ProxyService {
  private serviceMap: Record<string, string>;

  constructor() {
    this.serviceMap = {
      'auth-service': serviceUrls.auth,
      'venue-service': serviceUrls.venue,
      'event-service': serviceUrls.event,
      'ticket-service': serviceUrls.ticket,
      'payment-service': serviceUrls.payment,
      'nft-service': serviceUrls.marketplace,
      'notification-service': serviceUrls.notification,
      'analytics-service': serviceUrls.analytics,
      'marketplace-service': serviceUrls.marketplace,
      'integration-service': serviceUrls.integration,
      'compliance-service': serviceUrls.compliance,
      'queue-service': serviceUrls.queue,
      'search-service': serviceUrls.search,
      'file-service': serviceUrls.file,
      'monitoring-service': serviceUrls.monitoring,
      'blockchain-service': serviceUrls.blockchain,
      'order-service': serviceUrls.order,
      'scanning-service': serviceUrls.scanning,
      'minting-service': serviceUrls.minting,
      'transfer-service': serviceUrls.transfer,
    };
  }

  getServiceUrl(serviceName: string): string {
    return this.serviceMap[serviceName];
  }

  setForwardedHeaders(request: any, headers: any): void {
    headers['x-forwarded-for'] = request.ip;
    headers['x-forwarded-proto'] = request.protocol;
    headers['x-forwarded-host'] = request.hostname || request.headers.host || 'api-gateway';
    headers['x-forwarded-port'] = request.socket.localPort;
  }

  async forward(request: any, service: string, options?: any): Promise<any> {
    const serviceUrl = this.getServiceUrl(service);
    if (!serviceUrl) {
      throw new Error(`Service ${service} not found`);
    }

    const headers = { ...request.headers };
    this.setForwardedHeaders(request, headers);

    const config: AxiosRequestConfig = {
      method: request.method || 'GET',
      url: `${serviceUrl}${request.url || ''}`,
      headers,
      data: request.body || request.data,
      timeout: options?.timeout || 10000,
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      throw error;
    }
  }
}
