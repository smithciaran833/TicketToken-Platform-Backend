# Service Bypass Analysis

## Summary
This document traces each database bypass, documenting the SQL queries, data needs, existing APIs, and work required to fix.

---

## 1. auth-service → `tickets` (owner: ticket-service)

**SQL Found:**
```sql
-- migrations/001_auth_baseline.ts
UPDATE users u 
SET events_attended = COALESCE(
  (SELECT COUNT(DISTINCT t.event_id) FROM tickets t 
   WHERE t.user_id = u.id AND t.status IN ('used') AND t.deleted_at IS NULL), 0
);
```

**Data Needed:** 
- `tickets.event_id`, `tickets.user_id`, `tickets.status`, `tickets.deleted_at`
- Aggregate: COUNT(DISTINCT event_id) per user

**API Exists in ticket-service:** Partial
- `/internal/tickets/:ticketId/status` - single ticket status
- **MISSING:** No endpoint for user's events attended count

**Client Exists in auth-service:** No

**Work Needed:** Create API (GET /internal/users/:userId/events-attended) + Create Client

---

## 2. payment-service → `tickets` (owner: ticket-service)

**SQL Found:**
```sql
-- controllers/refundController.ts
FROM tickets t
JOIN orders o ON t.order_id = o.id
WHERE o.user_id = $1 AND t.status = 'active'

-- services/refund-policy.service.ts
FROM tickets t
JOIN events e ON t.event_id = e.event_id
WHERE t.ticket_id = $1 AND t.tenant_id = $2

-- services/reconciliation/reconciliation-service.ts
LEFT JOIN tickets t ON t.order_id = o.id
SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
```

**Data Needed:**
- `tickets.id`, `tickets.order_id`, `tickets.status`, `tickets.event_id`, `tickets.tenant_id`
- Joins: orders, events
- Aggregates: COUNT per order

**API Exists in ticket-service:** Partial
- `/internal/tickets/:ticketId/status` ✅
- `/internal/tickets/cancel-batch` ✅
- `/internal/tickets/calculate-price` ✅
- **MISSING:** GET /internal/orders/:orderId/tickets (list tickets by order)
- **MISSING:** GET /internal/tickets/count-by-order/:orderId

**Client Exists in payment-service:** No (uses inline axios for webhooks only)

**Work Needed:** Create API (2 new endpoints) + Create Client

---

## 3. payment-service → `events` (owner: event-service)

**SQL Found:**
```sql
-- services/refund-policy.service.ts
JOIN events e ON t.event_id = e.event_id

-- services/compliance/form-1099-da.service.ts  
JOIN events e ON t.event_id = e.id
```

**Data Needed:**
- `events.id`, `events.event_id`, `events.name`, `events.start_date`

**API Exists in event-service:** Yes (public API exists)
- `/api/v1/events/:eventId` - GET event details

**Client Exists in payment-service:** No

**Work Needed:** Create Client (API exists)

---

## 4. payment-service → `orders` (owner: order-service)

**SQL Found:**
```sql
-- controllers/refundController.ts
JOIN orders o ON t.order_id = o.id
WHERE o.user_id = $1

-- services/reconciliation/reconciliation-service.ts
SELECT o.* FROM orders o WHERE o.status = 'PAID'
SELECT * FROM orders WHERE id = $1
```

**Data Needed:**
- `orders.id`, `orders.user_id`, `orders.status`, full order details

**API Exists in order-service:** Yes
- Likely has `/api/v1/orders/:orderId` public API
- Need to verify internal APIs exist

**Client Exists in payment-service:** No

**Work Needed:** Create Client (API likely exists)

---

## 5. payment-service → `users` (owner: auth-service)

**SQL Found:**
```sql
-- services/high-demand/purchase-limiter.service.ts
SELECT billing_address FROM users WHERE id = $1

-- services/compliance/form-1099-da.service.ts
SELECT ... FROM users u LEFT JOIN user_tax_info uti ON u.id = uti.user_id
```

**Data Needed:**
- `users.id`, `users.billing_address`, tax info

**API Exists in auth-service:** Partial
- Need to check for internal user data endpoint

**Client Exists in payment-service:** No

**Work Needed:** Create API + Create Client

---

## 6. blockchain-service → `tickets` (owner: ticket-service)

**SQL Found:**
```sql
-- queues/mintQueue.js
SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true

-- workers/mint-worker.ts
FROM tickets t
JOIN order_items oi ON t.id = oi.ticket_id
WHERE t.order_id = $1
```

**Data Needed:**
- `tickets.id`, `tickets.token_id`, `tickets.mint_transaction_id`, `tickets.is_minted`, `tickets.order_id`

**API Exists in ticket-service:** Partial
- `/internal/tickets/:ticketId/status` - has some fields
- **MISSING:** Mint status specific endpoint

**Client Exists in blockchain-service:** No

**Work Needed:** Extend API + Create Client

---

## 7. blockchain-service → `venues` (owner: venue-service)

**SQL Found:**
```sql
-- workers/mint-worker.ts
SELECT wallet_address FROM venues WHERE id = $1
```

**Data Needed:**
- `venues.id`, `venues.wallet_address`

**API Exists in venue-service:** Yes
- `/api/v1/venues/:venueId` - GET venue details

**Client Exists in blockchain-service:** No

**Work Needed:** Create Client (API exists)

---

## 8. blockchain-service → `order_items` (owner: order-service)

**SQL Found:**
```sql
-- workers/mint-worker.ts
JOIN order_items oi ON t.id = oi.ticket_id
```

**Data Needed:**
- `order_items.ticket_id`, order item details

**API Exists in order-service:** Need to verify

**Client Exists in blockchain-service:** No

**Work Needed:** Create API + Create Client

---

## 9. blockchain-indexer → `tickets` (owner: ticket-service)

**SQL Found:**
```sql
-- reconciliation/reconciliationEnhanced.ts
FROM tickets WHERE is_minted = true

-- processors/marketplaceTracker.ts
SELECT 1 FROM tickets WHERE token_id = $1
SELECT id FROM tickets WHERE token_id = $1

-- processors/transactionProcessor.ts
FROM tickets WHERE token_id = $1
```

**Data Needed:**
- `tickets.id`, `tickets.token_id`, `tickets.is_minted`

**API Exists in ticket-service:** Partial
- **MISSING:** GET /internal/tickets/by-token/:tokenId

**Client Exists in blockchain-indexer:** No

**Work Needed:** Create API + Create Client

---

## 10. minting-service → `events` (owner: event-service)

**SQL Found:**
```sql
-- services/MintingOrchestrator.ts
SELECT event_pda FROM events WHERE id = $1
```

**Data Needed:**
- `events.id`, `events.event_pda` (blockchain-specific field)

**API Exists in event-service:** Partial
- Likely needs internal endpoint with blockchain fields

**Client Exists in minting-service:** No

**Work Needed:** Extend API + Create Client

---

## 11. transfer-service → `tickets` (owner: ticket-service)

**SQL Found:**
```sql
-- services/transfer.service.ts
SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE
UPDATE tickets SET user_id = $1, updated_at = NOW() WHERE id = $2
```

**Data Needed:**
- Full ticket record, ability to UPDATE ownership

**API Exists in ticket-service:** Partial
- `/internal/tickets/:ticketId/status` - read only
- **MISSING:** POST /internal/tickets/:ticketId/transfer

**Client Exists in transfer-service:** No (empty /clients/ folder)

**Work Needed:** Create API (transfer endpoint) + Create Client

---

## 12. transfer-service → `users` (owner: auth-service)

**SQL Found:**
```sql
-- services/transfer.service.ts
SELECT id FROM users WHERE email = $1
INSERT INTO users (id, email, status) VALUES ($1, $2, $3)
```

**Data Needed:**
- User lookup by email, ability to create pending users

**API Exists in auth-service:** Need to verify

**Client Exists in transfer-service:** No

**Work Needed:** Create API + Create Client

---

## 13. compliance-service → `venues` (owner: venue-service)

**SQL Found:**
```sql
-- services/bank.service.ts
SELECT id FROM venues WHERE id = $1 AND tenant_id = $2

-- services/risk.service.ts
SELECT name, owner_email FROM venues WHERE id = $1 AND tenant_id = $2
```

**Data Needed:**
- `venues.id`, `venues.name`, `venues.owner_email`, `venues.tenant_id`

**API Exists in venue-service:** Yes
- `/api/v1/venues/:venueId` - GET venue

**Client Exists in compliance-service:** No

**Work Needed:** Create Client (API exists)

---

## 14. compliance-service → `users` (owner: auth-service)

**SQL Found:**
```sql
-- services/risk.service.ts
SELECT id, email, name FROM users WHERE tenant_id = $1 AND role IN ('admin', ...)

-- services/scheduler.service.ts
FROM users WHERE role IN ('super_admin', 'compliance_admin')
```

**Data Needed:**
- Admin users by tenant and role

**API Exists in auth-service:** Need to verify internal admin lookup

**Client Exists in compliance-service:** No

**Work Needed:** Create API + Create Client

---

## 15-17. monitoring-service → `tickets`, `events`, `venues`

**SQL Found:**
```sql
-- collectors/business/revenue.collector.ts
FROM venues ...
FROM events WHERE created_at > NOW() - INTERVAL '30 days'
FROM tickets WHERE status = 'sold'

-- analytics/sales-tracker.ts
FROM ticket_transactions ...
SELECT total_tickets, tickets_sold FROM events WHERE id = $1
```

**Data Needed:**
- Aggregate counts for monitoring dashboards

**API Exists:** Partial in each service

**Client Exists in monitoring-service:** No

**Work Needed:** Create aggregation APIs + Create Clients (or use dedicated analytics service)

**Recommendation:** Monitoring should consume from analytics-service or RabbitMQ events, not direct DB

---

## 18-22. analytics-service → `tickets`, `events`, `venues`, `orders`, `users`

**SQL Found:** Extensive queries in migrations and services for materialized views

```sql
-- migrations/001_analytics_baseline.ts (materialized views)
SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id
SELECT COALESCE(SUM(t.face_value), 0) FROM tickets t WHERE t.event_id = e.id
FROM events e JOIN venues v ON e.venue_id = v.id
SELECT COUNT(*) FROM tickets WHERE user_id = u.id
FROM users u

-- services/demand-tracker.service.ts
SELECT COUNT(*) FROM orders WHERE event_id = ? AND status = 'completed'
```

**Data Needed:**
- Full read access to all business entities for analytics

**API Exists:** Various internal APIs exist

**Client Exists in analytics-service:** No

**Work Needed:** 
- Option A: Create comprehensive analytics APIs in each service + Clients
- Option B: Use dedicated read replica database for analytics
- Option C: Consume all data via RabbitMQ events (already has RabbitMQ consumer)

**Recommendation:** Analytics is a special case - should either use:
1. Dedicated read replica
2. Event streaming (RabbitMQ) - already partially implemented
3. ETL pipeline to analytics database

---

## Summary: Work Required

| Priority | Bypass | Work Needed |
|----------|--------|-------------|
| HIGH | transfer-service → tickets | Create Transfer API + Client |
| HIGH | payment-service → tickets | Create 2 APIs + Client |
| HIGH | blockchain-service → tickets | Extend API + Client |
| HIGH | blockchain-indexer → tickets | Create Token Lookup API + Client |
| MEDIUM | auth-service → tickets | Create Events Attended API + Client |
| MEDIUM | compliance-service → venues/users | Create Clients |
| MEDIUM | file-service → venue-service | Already uses axios, formalize client |
| LOW | monitoring-service | Should use analytics/events |
| LOW | analytics-service | Use read replica or event streaming |

## Existing Internal APIs in ticket-service

```
GET  /internal/tickets/:ticketId/status
POST /internal/tickets/cancel-batch
POST /internal/tickets/calculate-price
```

## APIs Needed (Priority Order)

1. **ticket-service:**
   - `GET /internal/tickets/by-token/:tokenId` (for indexer)
   - `GET /internal/orders/:orderId/tickets` (for payment)
   - `POST /internal/tickets/:ticketId/transfer` (for transfer-service)
   - `GET /internal/users/:userId/events-attended` (for auth)

2. **auth-service:**
   - `GET /internal/users/:userId` (basic user info)
   - `GET /internal/users/by-email/:email` (for transfer)
   - `GET /internal/users/admins?tenantId=X` (for compliance)

3. **order-service:**
   - `GET /internal/orders/:orderId` (already may exist)
   - `GET /internal/orders/:orderId/items` (for blockchain)

4. **event-service:**
   - Extend existing API to include `event_pda` for minting

5. **venue-service:**
   - Extend existing API to include `wallet_address` for blockchain
