# Notification Service - Observability Guide

**Last Updated:** November 2025  
**Service:** Notification Service  
**Version:** 1.0.0

---

## Overview

This document provides comprehensive information about monitoring, metrics, tracing, and alerting for the Notification Service.

---

## Table of Contents

1. [Metrics](#metrics)
2. [Distributed Tracing](#distributed-tracing)
3. [Alerting](#alerting)
4. [Dashboards](#dashboards)
5. [Troubleshooting](#troubleshooting)

---

## Metrics

### Prometheus Endpoint

**URL:** `http://notification-service:3007/metrics`

The notification service exposes metrics in Prometheus format at the `/metrics` endpoint.

### Key Metrics

#### Notification Metrics

**Counters:**
- `notification_sent_total{channel, type, status, provider}` - Total notifications sent
- `notification_delivery_total{channel, status, provider}` - Total delivery confirmations received
- `notification_errors_total{error_type, provider, channel}` - Total notification errors
- `webhook_received_total{provider, event_type}` - Total webhooks received
- `api_requests_total{endpoint, method, status_code}` - Total API requests

**Gauges:**
- `notification_queue_depth{queue_type}` - Current notification queue depth
- `active_connections` - Number of active database connections
- `provider_status{provider_name, provider_type}` - Provider health status (0=down, 1=up)

**Histograms:**
- `notification_send_duration_seconds{channel, provider, type}` - Time to send notification
- `template_render_duration_seconds{template_name, channel}` - Template rendering time
- `api_request_duration_seconds{endpoint, method, status_code}` - API request latency
- `provider_response_time_seconds{provider_name, provider_type, operation}` - Provider API response time

**Summaries:**
- `notification_batch_size{channel}` - Distribution of notification batch sizes

### Business Metrics Dashboard

**Endpoint:** `GET /api/analytics/metrics/dashboard`  
**Authentication:** Admin only

Returns real-time business metrics:

```json
{
  "realtime": {
    "notifications_per_minute": 42,
    "success_rate": 0.987,
    "avg_send_time_ms": 234
  },
  "last_hour": {
    "total_sent": 2500,
    "delivery_rate": 0.96,
    "bounce_rate": 0.02,
    "error_rate": 0.02,
    "open_rate": 0.31,
    "click_rate": 0.08
  },
  "last_24h": {
    "total_sent": 58000,
    "delivery_rate": 0.95,
    "bounce_rate": 0.03,
    "error_rate": 0.02,
    "cost_per_notification": 0.0012
  },
  "by_channel": {
    "email": {
      "sent": 45000,
      "delivered": 43200,
      "failed": 800,
      "delivery_rate": 0.96,
      "avg_cost": 0.0008
    },
    "sms": {
      "sent": 13000,
      "delivered": 12700,
      "failed": 300,
      "delivery_rate": 0.98,
      "avg_cost": 0.0025
    }
  }
}
```

---

## Distributed Tracing

### Trace Context Propagation

The notification service supports W3C Trace Context standard:

**Request Headers:**
- `traceparent`: Trace ID and span ID
- `tracestate`: Additional trace state

**Response Headers:**
- `X-Trace-Id`: Trace ID for the request
- `X-Span-Id`: Span ID for this service's work

### Trace Example

```
payment-service:process_payment [trace_123_abc]
  ↓ span_parent
notification-service:send_notification [trace_123_abc]
  ↓ span_child1
notification-service:render_template [trace_123_abc]
  ↓ span_child2
notification-service:sendgrid_api_call [trace_123_abc]
```

### Using Tracing in Code

```typescript
import { createSpan } from '../middleware/tracing.middleware';

// In a route handler
const span = createSpan(request, 'send_email', {
  template: 'order-confirmation',
  channel: 'email'
});

try {
  // Do work
  span.setAttribute('recipient', email);
  span.addEvent('email_queued');
  
  // Complete successfully
  span.end('success');
} catch (error) {
  span.recordError(error);
  span.end('error');
  throw error;
}
```

### Viewing Traces

Traces are logged to Winston logger with trace_id and span_id:

```json
{
  "level": "info",
  "message": "Span ended",
  "traceId": "trace_1700000000_a1b2c3d4e5",
  "spanId": "span_f6g7h8i9j0",
  "operation": "send_email",
  "duration_ms": 234,
  "status": "success"
}
```

---

## Alerting

### Alert Configuration

Alerts are defined in `infrastructure/monitoring/alerts/notification-service.yml`

### Alert Severity Levels

- **Critical:** Immediate action required (pages on-call)
- **Warning:** Needs investigation within business hours
- **Info:** Informational, no action required

### Defined Alerts

#### 1. NotificationHighErrorRate (Warning)
**Trigger:** Error rate >5% for 5 minutes  
**Impact:** Users not receiving notifications  
**Action:** Investigate error logs, check provider status

#### 2. NotificationCriticalErrorRate (Critical)
**Trigger:** Error rate >20% for 2 minutes  
**Impact:** Major service disruption  
**Action:** Immediate investigation, may need to disable sending

#### 3. EmailProviderDown (Critical)
**Trigger:** SendGrid status = 0 for 1 minute  
**Impact:** No emails can be sent  
**Action:** Check SendGrid status page, verify API keys

#### 4. SMSProviderDown (Critical)
**Trigger:** Twilio status = 0 for 1 minute  
**Impact:** No SMS can be sent  
**Action:** Check Twilio status page, verify credentials

#### 5. NotificationSlowSendTimes (Warning)
**Trigger:** P95 send time >5s for 10 minutes  
**Impact:** Delayed notifications  
**Action:** Check provider response times, database performance

#### 6. NotificationQueueBacklog (Warning)
**Trigger:** Queue depth >1000 for 5 minutes  
**Impact:** Notifications delayed  
**Action:** Scale workers, investigate bottlenecks

#### 7. NotificationCriticalQueueBacklog (Critical)
**Trigger:** Queue depth >5000 for 2 minutes  
**Impact:** Major delays, possible message loss  
**Action:** Emergency scaling, investigate root cause

#### 8. NotificationVolumeSpike (Info)
**Trigger:** >10x normal send rate for 1 minute  
**Impact:** Informational  
**Action:** Monitor for performance impact

#### 9. NotificationLowDeliveryRate (Warning)
**Trigger:** Delivery rate <80% for 15 minutes  
**Impact:** Users not receiving notifications  
**Action:** Check provider health, review bounce logs

#### 10. NotificationHighBounceRate (Warning)
**Trigger:** Bounce rate >10% for 10 minutes  
**Impact:** Email reputation at risk  
**Action:** Review suppression list, check email quality

#### 11. NotificationServiceDown (Critical)
**Trigger:** Service unavailable for 1 minute  
**Impact:** Complete service outage  
**Action:** Check service logs, restart if necessary

#### 12. NotificationAPIHighErrorRate (Warning)
**Trigger:** 5xx error rate >5% for 5 minutes  
**Impact:** API clients experiencing failures  
**Action:** Check application logs, database connectivity

#### 13. WebhookProcessingDelayed (Info)
**Trigger:** Webhook rate unusually low for 30 minutes  
**Impact:** Delivery tracking may be delayed  
**Action:** Verify webhook endpoints, check provider status

---

## Dashboards

### Grafana Dashboard

Create a Grafana dashboard with these panels:

#### Row 1: Overview
- **Notifications/min** - `rate(notification_sent_total[1m])`
- **Success Rate** - `rate(notification_sent_total{status="delivered"}[5m]) / rate(notification_sent_total[5m])`
- **Error Rate** - `rate(notification_errors_total[5m]) / rate(notification_sent_total[5m])`
- **Queue Depth** - `notification_queue_depth`

#### Row 2: Provider Health
- **SendGrid Status** - `provider_status{provider_name="sendgrid"}`
- **Twilio Status** - `provider_status{provider_name="twilio"}`
- **Provider Response Time P95** - `histogram_quantile(0.95, rate(provider_response_time_seconds_bucket[5m]))`

#### Row 3: Performance
- **Send Duration P95** - `histogram_quantile(0.95, rate(notification_send_duration_seconds_bucket[5m]))`
- **Template Render Time P95** - `histogram_quantile(0.95, rate(template_render_duration_seconds_bucket[5m]))`
- **API Latency P95** - `histogram_quantile(0.95, rate(api_request_duration_seconds_bucket[5m]))`

#### Row 4: Channel Breakdown
- **Emails Sent** - `rate(notification_sent_total{channel="email"}[5m])`
- **SMS Sent** - `rate(notification_sent_total{channel="sms"}[5m])`
- **Delivery by Channel** - `rate(notification_delivery_total[5m]) by (channel, status)`

#### Row 5: Webhooks
- **Webhooks Received** - `rate(webhook_received_total[5m]) by (provider, event_type)`

---

## Troubleshooting

### High Error Rate

**Symptoms:** Alert firing for high error rate

**Investigation Steps:**
1. Check error logs: `grep "ERROR" notification-service.log | tail -100`
2. View error breakdown: Check `notification_errors_total` by error_type
3. Check provider status: `curl http://notification-service:3007/health/providers`
4. Review recent deployments

**Common Causes:**
- Provider API issues
- Invalid email addresses/phone numbers
- Rate limiting from provider
- Database connectivity issues

### Slow Send Times

**Symptoms:** Alert firing for slow send times

**Investigation Steps:**
1. Check provider response times: Review `provider_response_time_seconds`
2. Check database performance: `EXPLAIN ANALYZE` slow queries
3. Check template rendering: Review `template_render_duration_seconds`
4. Check queue depth: Review `notification_queue_depth`

**Common Causes:**
- Provider API slow to respond
- Database slow queries
- Complex template rendering
- Network latency

### Provider Down

**Symptoms:** Alert firing for provider down

**Investigation Steps:**
1. Check provider status page (SendGrid/Twilio)
2. Verify API credentials: Check environment variables
3. Test provider connectivity: Run health check
4. Check recent changes to provider configuration

**Common Causes:**
- Provider outage
- Expired or invalid API keys
- IP whitelist issues
- Network connectivity problems

### Queue Backlog

**Symptoms:** Alert firing for queue backlog

**Investigation Steps:**
1. Check queue metrics: Review `notification_queue_depth`
2. Check worker performance: Review send duration metrics
3. Check for errors: Review `notification_errors_total`
4. Check scaling: Review pod/container count

**Common Causes:**
- Insufficient workers
- Slow provider responses
- High error rate blocking queue
- Sudden traffic spike

---

## Environment Configuration

### Required Environment Variables

```bash
# Tracing (optional)
ENABLE_TRACING=true

# Metrics (optional)
ENABLE_METRICS=true

# Provider credentials (required for production)
SENDGRID_API_KEY=your_key_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service:3007']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
```

### Alert Manager Configuration

Add to `alertmanager.yml`:

```yaml
route:
  routes:
    - match:
        service: notification-service
        severity: critical
      receiver: pagerduty
      continue: true
    
    - match:
        service: notification-service
        severity: warning
      receiver: slack
      
receivers:
  - name: pagerduty
    pagerduty_configs:
      - service_key: <your_pagerduty_key>
  
  - name: slack
    slack_configs:
      - api_url: <your_slack_webhook>
        channel: '#platform-alerts'
```

---

## Best Practices

1. **Monitor actively** - Set up dashboards and review regularly
2. **Act on alerts** - Don't let alerts become noise
3. **Use tracing** - Leverage trace IDs for debugging
4. **Review metrics** - Weekly review of trends
5. **Test alerts** - Periodically test alert firing
6. **Document changes** - Keep runbooks updated
7. **Analyze patterns** - Look for recurring issues

---

## Support

For questions or issues:
- **Slack:** #platform-team
- **On-call:** PagerDuty rotation
- **Documentation:** https://docs.tickettoken.com/services/notification

---

**Document Maintained By:** Platform Team  
**Review Schedule:** Quarterly
