/**
 * Order Service Client
 *
 * Client for communicating with order-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * PHASE 5c: Added createOrder, cancelOrder for ticket-service integration
 */

import { BaseServiceClient, RequestContext } from '../http-client/base-service-client';
import {
  Order,
  GetOrderResponse,
  OrderItem,
  GetOrderItemsResponse,
  // Phase 5b types
  GetOrdersWithoutTicketsResponse,
  OrdersWithoutTicketsOptions,
  GetOrderForPaymentResponse,
} from './types';

// =============================================================================
// Request/Response Types for Order Creation (Phase 5c)
// =============================================================================

/**
 * Order item in create order request
 */
export interface CreateOrderItemRequest {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
}

/**
 * Request to create a new order
 */
export interface CreateOrderRequest {
  userId: string;
  eventId: string;
  items: CreateOrderItemRequest[];
  currency?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from creating an order
 */
export interface CreateOrderResponse {
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

/**
 * Request to cancel an order
 */
export interface CancelOrderRequest {
  reason: string;
}

/**
 * Client for order-service internal APIs
 * 
 * @example
 * ```typescript
 * const client = new OrderServiceClient();
 * const order = await client.getOrder('order-123', {
 *   tenantId: 'tenant-456',
 *   traceId: 'trace-789'
 * });
 * ```
 */
export class OrderServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
      serviceName: 'order-service',
      timeout: 10000,
    });
  }

  /**
   * Get order details by ID
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns Full order details
   */
  async getOrder(orderId: string, ctx: RequestContext): Promise<Order> {
    const response = await this.get<GetOrderResponse>(
      `/internal/orders/${orderId}`,
      ctx
    );
    return response.data.order;
  }

  /**
   * Get order items for an order
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns List of order items with ticket type info
   */
  async getOrderItems(orderId: string, ctx: RequestContext): Promise<OrderItem[]> {
    const response = await this.get<GetOrderItemsResponse>(
      `/internal/orders/${orderId}/items`,
      ctx
    );
    return response.data.items;
  }

  /**
   * Get order with items (helper method)
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns Order with items array
   */
  async getOrderWithItems(orderId: string, ctx: RequestContext): Promise<Order & { items: OrderItem[] }> {
    const [order, items] = await Promise.all([
      this.getOrder(orderId, ctx),
      this.getOrderItems(orderId, ctx),
    ]);
    return { ...order, items };
  }

  // ==========================================================================
  // PHASE 5b NEW METHODS - Methods for new internal endpoints
  // ==========================================================================

  /**
   * Get orders that have been paid but don't have associated tickets
   * Used for payment reconciliation to find orphaned payments
   * 
   * @param ctx - Request context with tenant info
   * @param options - Query options for filtering
   * @returns List of orphaned orders
   */
  async getOrdersWithoutTickets(
    ctx: RequestContext,
    options?: OrdersWithoutTicketsOptions
  ): Promise<GetOrdersWithoutTicketsResponse> {
    const params = new URLSearchParams();
    if (options?.minutesOld) params.append('minutesOld', options.minutesOld.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    
    const queryString = params.toString();
    const path = `/internal/orders/without-tickets${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<GetOrdersWithoutTicketsResponse>(path, ctx);
    return response.data;
  }

  /**
   * Get order with payment context and validation for payment processing
   * Includes optimistic locking version and payment eligibility checks
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns Order with payment context and items
   */
  async getOrderForPayment(orderId: string, ctx: RequestContext): Promise<GetOrderForPaymentResponse> {
    const response = await this.get<GetOrderForPaymentResponse>(
      `/internal/orders/${orderId}/for-payment`,
      ctx
    );
    return response.data;
  }

  /**
   * Check if order can be processed for payment (helper method)
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns true if order is eligible for payment processing
   */
  async canProcessPayment(orderId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.getOrderForPayment(orderId, ctx);
    return result.paymentContext.canProcessPayment;
  }

  /**
   * Check for orphaned orders (helper method)
   *
   * @param ctx - Request context with tenant info
   * @returns true if there are orphaned orders needing attention
   */
  async hasOrphanedOrders(ctx: RequestContext): Promise<boolean> {
    const result = await this.getOrdersWithoutTickets(ctx, { limit: 1 });
    return result.count > 0;
  }

  // ==========================================================================
  // PHASE 5c NEW METHODS - Order creation and cancellation for sagas
  // ==========================================================================

  /**
   * Create a new order
   *
   * Used by ticket-service PurchaseSaga to create orders as part of
   * the distributed transaction.
   *
   * @param request - Order creation request
   * @param ctx - Request context with tenant info
   * @param idempotencyKey - Optional idempotency key for safe retries
   * @returns Created order details
   */
  async createOrder(
    request: CreateOrderRequest,
    ctx: RequestContext,
    idempotencyKey?: string
  ): Promise<CreateOrderResponse> {
    const key = idempotencyKey || request.idempotencyKey;
    const config = key ? { headers: { 'Idempotency-Key': key } } : undefined;
    const response = await this.post<CreateOrderResponse>(
      '/internal/orders',
      ctx,
      request,
      config
    );
    return response.data;
  }

  /**
   * Cancel an order
   *
   * Used for saga compensation when ticket creation fails after
   * order creation. This rolls back the order.
   *
   * @param orderId - The order ID to cancel
   * @param reason - Reason for cancellation
   * @param ctx - Request context with tenant info
   * @returns void (throws on error)
   */
  async cancelOrder(
    orderId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<void> {
    const idempotencyKey = `cancel-${orderId}-${Date.now()}`;
    await this.post<void>(
      `/internal/orders/${orderId}/cancel`,
      ctx,
      { reason },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  /**
   * Update order status
   *
   * Used to mark orders as paid, fulfilled, etc.
   *
   * @param orderId - The order ID
   * @param status - New status
   * @param ctx - Request context with tenant info
   * @returns Updated order
   */
  async updateOrderStatus(
    orderId: string,
    status: string,
    ctx: RequestContext
  ): Promise<Order> {
    const response = await this.patch<GetOrderResponse>(
      `/internal/orders/${orderId}/status`,
      ctx,
      { status }
    );
    return response.data.order;
  }
}

/** Singleton instance of OrderServiceClient */
export const orderServiceClient = new OrderServiceClient();
