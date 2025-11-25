import { createAxiosInstance } from '@tickettoken/shared';
import { AxiosInstance, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

import CircuitBreaker from '../utils/CircuitBreaker';

const log = logger.child({ component: 'OrderServiceClient' });

interface OrderItem {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
}

interface CreateOrderRequest {
  userId: string;
  eventId: string;
  items: OrderItem[];
  currency?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  items: Array<{
    id: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>;
  createdAt: string;
}

interface OrderResponse {
  id: string;
  userId: string;
  eventId: string;
  orderNumber: string;
  status: string;
  subtotalCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  paymentIntentId?: string;
  items: Array<{
    id: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface CancelOrderRequest {
  orderId: string;
  userId: string;
  reason: string;
}

export class OrderServiceClient {
  private httpClient: AxiosInstance;
  private circuitBreaker: any;
  private serviceUrl: string;
  private readonly API_PREFIX = '/api/v1/orders';

  constructor() {
    this.serviceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3005';
    
    this.httpClient = createAxiosInstance(this.serviceUrl, 10000);
    
    this.circuitBreaker = new CircuitBreaker({
      name: 'order-service',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 10000,
      resetTimeout: 30000,
    });

    log.info('OrderServiceClient initialized', { 
      serviceUrl: this.serviceUrl,
      apiPrefix: this.API_PREFIX 
    });
  }

  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    const startTime = Date.now();
    
    try {
      const idempotencyKey = request.idempotencyKey || uuidv4();

      log.info('Creating order via order-service', {
        userId: request.userId,
        eventId: request.eventId,
        itemCount: request.items.length,
        idempotencyKey,
      });

      const response = await this.circuitBreaker.call(async () => {
        return await this.httpClient.post<CreateOrderResponse>(this.API_PREFIX, {
          ...request,
          idempotencyKey,
        }, {
          headers: {
            'Idempotency-Key': idempotencyKey,
            'X-Service-Name': 'ticket-service',
          },
        });
      });

      const duration = Date.now() - startTime;
      
      log.info('Order created successfully', {
        orderId: response.data.orderId,
        orderNumber: response.data.orderNumber,
        durationMs: duration,
      });

      return response.data;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (error.code === 'CIRCUIT_OPEN') {
        log.error('Circuit breaker OPEN for order-service');
        throw new OrderServiceUnavailableError('Order service is currently unavailable');
      }

      if (error.isAxiosError) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const errorData = axiosError.response?.data as any;

        log.error('Failed to create order', { status, error: errorData });

        if (status === 400) {
          throw new OrderValidationError(errorData?.error || 'Invalid order request');
        }
        
        if (status === 409) {
          throw new OrderConflictError(errorData?.error || 'Order conflict');
        }

        if (status === 503) {
          throw new OrderServiceUnavailableError('Order service temporarily unavailable');
        }
      }

      throw new OrderServiceError('Failed to create order', error);
    }
  }

  async getOrder(orderId: string, userId: string): Promise<OrderResponse> {
    try {
      const response = await this.circuitBreaker.call(async () => {
        return await this.httpClient.get<OrderResponse>(`${this.API_PREFIX}/${orderId}`, {
          headers: {
            'X-User-Id': userId,
            'X-Service-Name': 'ticket-service',
          },
        });
      });

      return response.data;
    } catch (error: any) {
      if (error.code === 'CIRCUIT_OPEN') {
        throw new OrderServiceUnavailableError('Order service is currently unavailable');
      }
      if (error.isAxiosError && (error as AxiosError).response?.status === 404) {
        throw new OrderNotFoundError(`Order ${orderId} not found`);
      }
      throw new OrderServiceError('Failed to fetch order', error);
    }
  }

  async cancelOrder(request: CancelOrderRequest): Promise<void> {
    try {
      await this.circuitBreaker.call(async () => {
        return await this.httpClient.post(`${this.API_PREFIX}/${request.orderId}/cancel`, {
          reason: request.reason,
        }, {
          headers: {
            'X-User-Id': request.userId,
            'X-Service-Name': 'ticket-service',
            'Idempotency-Key': `cancel-${request.orderId}-${Date.now()}`,
          },
        });
      });
    } catch (error) {
      log.error('Failed to cancel order', { orderId: request.orderId, error });
    }
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }
}

export class OrderServiceError extends Error {
  public originalError?: any;
  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'OrderServiceError';
    this.originalError = originalError;
  }
}

export class OrderServiceUnavailableError extends OrderServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'OrderServiceUnavailableError';
  }
}

export class OrderValidationError extends OrderServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

export class OrderConflictError extends OrderServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'OrderConflictError';
  }
}

export class OrderNotFoundError extends OrderServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'OrderNotFoundError';
  }
}

export const orderServiceClient = new OrderServiceClient();
