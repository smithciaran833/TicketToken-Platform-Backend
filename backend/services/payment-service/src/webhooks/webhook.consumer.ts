/**
 * Webhook Consumer Service
 * 
 * Processes webhook events from the queue and notifies downstream services.
 * 
 * MEDIUM FIXES:
 * - CLIENT-1: Add auth on outbound calls
 * - CLIENT-3: Propagate correlation ID
 * - DT-2: Propagate correlation ID to downstream
 */

import { logger } from '../utils/logger';
import { serviceClients } from '../utils/http-client.util';
import { getCurrentTraceId, withTraceContext } from '../utils/tracing';
import { config } from '../config';
import { generateHmacSignature } from '../utils/crypto.util';

const log = logger.child({ component: 'WebhookConsumer' });

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookEvent {
  id: string;
  type: string;
  correlationId?: string;
  tenantId: string;
  payload: Record<string, any>;
  timestamp: Date;
  attempts: number;
  maxAttempts: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryable?: boolean;
}

export interface WebhookTarget {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

// =============================================================================
// WEBHOOK CONSUMER CLASS
// =============================================================================

export class WebhookConsumer {
  private processingEvents: Map<string, Promise<void>> = new Map();
  
  constructor() {
    log.info('Webhook consumer initialized');
  }

  /**
   * Process a webhook event and deliver to targets
   */
  async processEvent(event: WebhookEvent): Promise<WebhookDeliveryResult[]> {
    // CLIENT-3 / DT-2: Ensure correlation ID is set
    const correlationId = event.correlationId || getCurrentTraceId() || event.id;
    
    log.info({
      eventId: event.id,
      eventType: event.type,
      tenantId: event.tenantId,
      correlationId,
      attempt: event.attempts + 1,
      maxAttempts: event.maxAttempts,
    }, `Processing webhook event: ${event.type}`);

    // Get targets for this event type
    const targets = await this.getTargetsForEvent(event);
    
    if (targets.length === 0) {
      log.warn({
        eventId: event.id,
        eventType: event.type,
        correlationId,
      }, 'No webhook targets found for event type');
      return [];
    }

    // Deliver to all targets
    const results = await Promise.all(
      targets.map(target => this.deliverToTarget(event, target, correlationId))
    );

    return results;
  }

  /**
   * Deliver webhook to a specific target
   * CLIENT-1: Adds authentication headers
   * CLIENT-3 / DT-2: Propagates correlation ID
   */
  private async deliverToTarget(
    event: WebhookEvent,
    target: WebhookTarget,
    correlationId: string
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    
    try {
      // Build payload with trace context
      // DT-2: Include correlation ID in payload
      const payload = withTraceContext({
        id: event.id,
        type: event.type,
        data: event.payload,
        timestamp: event.timestamp.toISOString(),
        tenantId: event.tenantId,
        correlationId,
      });

      // CLIENT-1: Generate authentication signature
      const timestamp = Date.now().toString();
      const payloadString = JSON.stringify(payload);
      const signaturePayload = `${timestamp}.${payloadString}`;
      let signature: string | undefined;
      if (target.secret) {
        const sig = generateHmacSignature(signaturePayload, target.secret);
        signature = typeof sig === 'string' ? sig : (sig as any).signature;
      }

      // Build headers
      // CLIENT-3 / DT-2: Include correlation ID in headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-ID': event.id,
        'X-Webhook-Type': event.type,
        // CLIENT-3: Correlation ID in header
        'X-Correlation-ID': correlationId,
        'X-Request-ID': correlationId,
        // DT-2: Trace context
        'X-Trace-ID': getCurrentTraceId() || correlationId,
        'X-Timestamp': timestamp,
        ...target.headers,
      };

      // CLIENT-1: Add auth headers if signature exists
      if (signature) {
        headers['X-Webhook-Signature'] = signature;
        headers['X-Webhook-Timestamp'] = timestamp;
      }

      // Make the request
      const response = await fetch(target.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      const responseTime = Date.now() - startTime;

      log.info({
        eventId: event.id,
        targetUrl: this.sanitizeUrl(target.url),
        statusCode: response.status,
        responseTime,
        correlationId,
      }, 'Webhook delivered');

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        retryable: this.isRetryableStatus(response.status),
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      log.error({
        eventId: event.id,
        targetUrl: this.sanitizeUrl(target.url),
        error: errorMessage,
        responseTime,
        correlationId,
      }, 'Webhook delivery failed');

      return {
        success: false,
        error: errorMessage,
        responseTime,
        retryable: this.isRetryableError(error),
      };
    }
  }

  /**
   * Notify internal services about webhook events
   * CLIENT-1: Auth on outbound calls
   * CLIENT-3 / DT-2: Correlation ID propagation
   */
  async notifyInternalService(
    serviceName: 'event' | 'ticket' | 'venue' | 'marketplace',
    event: WebhookEvent,
    correlationId: string
  ): Promise<boolean> {
    try {
      const client = serviceClients[serviceName];
      
      // CLIENT-3 / DT-2: Pass correlation ID in headers
      const headers: Record<string, string> = {
        'X-Correlation-ID': correlationId,
        'X-Request-ID': correlationId,
        'X-Trace-ID': getCurrentTraceId() || correlationId,
        'X-Source-Service': 'payment-service',
        'X-Webhook-ID': event.id,
      };

      // CLIENT-1: Auth is handled by the HTTP client (HMAC signing)
      const response = await client.post(
        `/webhooks/${event.type}`,
        withTraceContext({
          eventId: event.id,
          type: event.type,
          payload: event.payload,
          tenantId: event.tenantId,
          correlationId,
        }),
        headers
      );

      log.info({
        eventId: event.id,
        service: serviceName,
        status: response.status,
        correlationId,
      }, `Notified ${serviceName} service`);

      return response.status >= 200 && response.status < 300;

    } catch (error) {
      log.error({
        eventId: event.id,
        service: serviceName,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      }, `Failed to notify ${serviceName} service`);
      
      return false;
    }
  }

  /**
   * Get webhook targets for an event type
   */
  private async getTargetsForEvent(event: WebhookEvent): Promise<WebhookTarget[]> {
    // In production, this would query a database of registered webhook endpoints
    // For now, return configured targets
    const targets: WebhookTarget[] = [];

    // Add tenant-specific webhook URL if configured
    if (event.payload.webhookUrl) {
      targets.push({
        url: event.payload.webhookUrl,
        secret: event.payload.webhookSecret,
      });
    }

    // Add default notification targets based on event type
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        // Notify order service
        if (config.services.orderUrl) {
          targets.push({
            url: `${config.services.orderUrl}/webhooks/payment`,
            secret: config.serviceAuth.hmacSecret,
          });
        }
        break;
        
      case 'charge.refunded':
        // Notify ticket service
        if (config.services.ticketUrl) {
          targets.push({
            url: `${config.services.ticketUrl}/webhooks/refund`,
            secret: config.serviceAuth.hmacSecret,
          });
        }
        break;
        
      case 'account.updated':
        // Notify venue service
        if (config.services.venueUrl) {
          targets.push({
            url: `${config.services.venueUrl}/webhooks/account`,
            secret: config.serviceAuth.hmacSecret,
          });
        }
        break;
    }

    return targets;
  }

  /**
   * Check if status code is retryable
   */
  private isRetryableStatus(status: number): boolean {
    // 5xx errors and rate limits are retryable
    return status >= 500 || status === 429 || status === 408;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        message.includes('network')
      );
    }
    return true; // Assume retryable for unknown errors
  }

  /**
   * Sanitize URL for logging (remove credentials)
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.password = '';
      parsed.username = '';
      return parsed.toString();
    } catch {
      return url.split('@').pop() || url;
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const webhookConsumer = new WebhookConsumer();
