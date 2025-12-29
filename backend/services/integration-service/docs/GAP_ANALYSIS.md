# Integration Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED (No audit files - reviewed codebase directly)

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Security | 0 | - |
| Frontend Features | 1 | MEDIUM |

**Good News:** This service has proper authentication and authorization on all routes.

---

## What Works Well ✅

### Authentication & Authorization
- All routes use `authenticate` middleware
- RBAC with `authorize('admin', 'venue_admin')` on sensitive operations
- Webhook signature verification for incoming webhooks

### Features
- OAuth flow for third-party integrations (Square, Stripe, Mailchimp, QuickBooks)
- Field mapping with templates
- Sync management with status/history
- Admin tools for monitoring and recovery
- Dead letter queue processing

---

## All Routes Inventory

### connection.routes.ts (6 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | / | ✅ | List integrations |
| GET | /:provider | ✅ | Get integration |
| POST | /connect/:provider | ✅ + Admin | Connect provider |
| POST | /:provider/disconnect | ✅ + Admin | Disconnect |
| POST | /:provider/reconnect | ✅ + Admin | Reconnect |
| POST | /:provider/api-key | ✅ + Admin | Set API key |

### sync.routes.ts (5 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /:provider/sync | ✅ | Start sync |
| POST | /:provider/sync/stop | ✅ + Admin | Stop sync |
| GET | /:provider/sync/status | ✅ | Sync status |
| GET | /:provider/sync/history | ✅ | Sync history |
| POST | /:provider/sync/retry | ✅ | Retry sync |

### mapping.routes.ts (7 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /:provider/fields | ✅ | Available fields |
| GET | /:provider/mappings | ✅ | Current mappings |
| PUT | /:provider/mappings | ✅ | Update mappings |
| POST | /:provider/mappings/test | ✅ | Test mappings |
| POST | /:provider/mappings/apply-template | ✅ | Apply template |
| POST | /:provider/mappings/reset | ✅ | Reset mappings |
| POST | /:provider/mappings/heal | ✅ | Heal mappings |

### oauth.routes.ts (2 routes)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /callback/:provider | ❌ | OAuth callback (public) |
| POST | /refresh/:provider | ✅ | Refresh token |

### webhook.routes.ts (6 routes)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /square | Signature | Square webhook |
| POST | /stripe | Signature | Stripe webhook |
| POST | /mailchimp | Signature | Mailchimp webhook |
| POST | /quickbooks | Signature | QuickBooks webhook |
| GET | /:provider/events | ✅ | Get events |
| POST | /retry | ✅ | Retry webhook |

### admin.routes.ts (8 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /all-venues | ✅ | All venue integrations |
| GET | /health-summary | ✅ | Health summary |
| GET | /costs | ✅ | Cost analysis |
| POST | /force-sync | ✅ | Force sync |
| POST | /clear-queue | ✅ | Clear queue |
| POST | /process-dead-letter | ✅ | Process DLQ |
| POST | /recover-stale | ✅ | Recover stale |
| GET | /queue-metrics | ✅ | Queue metrics |

### health.routes.ts (3 routes)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /:provider | ✅ | Provider health |
| GET | /:provider/metrics | ✅ | Provider metrics |
| POST | /:provider/test | ✅ | Test connection |

---

## Frontend-Related Gaps

### GAP-INTEGRATION-001: No User-Facing Integration Status
- **Severity:** MEDIUM
- **User Story:** "As a venue owner, I want to see my connected integrations at a glance"
- **Current:** Routes exist but may need simpler summary endpoint
- **Needed:**
  - GET /me/integrations - simple summary of connected integrations
  - Show: provider, status, last_sync, health
- **Impact:** Dashboard integration status widget

---

## Database Tables (13 tables)

| Table | Purpose |
|-------|---------|
| integrations | Provider definitions |
| connections | Active connections |
| field_mappings | Field mapping config |
| webhooks | Webhook config |
| integration_configs | Provider configs |
| integration_health | Health status |
| integration_webhooks | Webhook events |
| sync_queue | Pending syncs |
| sync_logs | Sync history |
| integration_costs | Cost tracking |
| oauth_tokens | OAuth tokens |
| venue_api_keys | API keys |
| field_mapping_templates | Mapping templates |

---

## Priority Order

1. GAP-INTEGRATION-001: User integration summary endpoint

