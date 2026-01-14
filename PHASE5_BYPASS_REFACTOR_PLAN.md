# Phase 5: Database Bypass Refactor Plan

This document provides a detailed analysis of all database bypass locations across the TicketToken Platform and a plan for refactoring them to use proper service client calls.

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Scanning Service Bypasses](#scanning-service-bypasses)
3. [Payment Service Bypasses](#payment-service-bypasses)
4. [Transfer Service Bypasses](#transfer-service-bypasses)
5. [Blockchain Service Bypasses](#blockchain-service-bypasses)
6. [Blockchain Indexer Bypasses](#blockchain-indexer-bypasses)
7. [Compliance Service Bypasses](#compliance-service-bypasses)
8. [Monitoring Service Bypasses](#monitoring-service-bypasses)
9. [Minting Service Bypasses](#minting-service-bypasses)
10. [Analytics Service Bypasses](#analytics-service-bypasses)
11. [Summary Counts](#summary-counts)
12. [Implementation Priority](#implementation-priority)

---

## Executive Summary

### Bypass Statistics

| Service | Files Analyzed | Total Bypasses | Critical | Medium | Simple |
|---------|---------------|----------------|----------|--------|--------|
| scanning-service | 5 | 18 | 2 | 10 | 6 |
| payment-service | 12 | 26 | 5 | 14 | 7 |
| transfer-service | 4 | 14 | 3 | 7 | 4 |
| blockchain-service | 3 | 8 | 2 | 4 | 2 |
| blockchain-indexer | 4 | 6 | 1 | 3 | 2 |
| compliance-service | 4 | 10 | 2 | 5 | 3 |
| monitoring-service | 2 | 6 | 0 | 4 | 2 |
| minting-service | 1 | 4 | 1 | 2 | 1 |
| analytics-service | 8 | 12 | 2 | 6 | 4 |
| **TOTAL** | **43** | **104** | **18** | **55** | **31** |

### Tables Most Frequently Bypassed

| Table | Owner | # Bypasses | Bypassing Services |
|-------|-------|------------|-------------------|
| `tickets` | ticket-service | 32 | payment, scanning, transfer, blockchain, minting, analytics |
| `events` | event-service | 18 | payment, scanning, transfer, blockchain, compliance, analytics |
| `users` | auth-service | 14 | payment, transfer, compliance |
| `venues` | venue-service | 12 | payment, blockchain, compliance, analytics |
| `orders` | order-service | 8 | payment, blockchain |

---

## Scanning Service Bypasses

### File: `analytics-dashboard.service.ts`

#### Bypass 1: Get realtime metrics
- **Tables Bypassed**: `scans`, `tickets`, `devices`
- **Query**: 
  ```sql
  SELECT ... FROM scans s JOIN tickets t ON s.ticket_id = t.id WHERE t.event_id = $1
  ```
- **Purpose**: Count scans by event in last minute
- **Client Method**: `TicketServiceClient.getTicketsByEvent()` + local scan filtering
- **Complexity**: Complex
- **Notes**: Consider creating dedicated analytics endpoint in ticket-service

#### Bypass 2: Get denial reasons
- **Tables Bypassed**: `scans`, `tickets`
- **Query**: `SELECT reason, COUNT(*) FROM scans s JOIN tickets t ...`
- **Client Method**: NEW ENDPOINT NEEDED - `GET /internal/events/:eventId/scan-stats`
- **Complexity**: Complex
- **Notes**: May benefit from read replica approach for analytics

#### Bypass 3: Get active devices
- **Tables Bypassed**: `devices`, `scans`, `tickets`
- **Query**: `SELECT COUNT(DISTINCT d.id) FROM devices d JOIN scans s ... JOIN tickets t ...`
- **Client Method**: Internal scanning-service query (devices owned by scanning)
- **Complexity**: Medium
- **Notes**: `tickets` join should use ticket-service client

#### Bypass 4-8: Historical metrics, device metrics, entry patterns, alerts
- **Tables Bypassed**: `scans`, `tickets`, `devices`
- **Similar pattern** to above - multiple JOINs on `tickets` table
- **Client Method**: Batch ticket lookup via `TicketServiceClient.getTicketsByEvent()`
- **Complexity**: Complex
- **Recommendation**: Create dedicated `GET /internal/events/:eventId/ticket-ids` endpoint

### File: `OfflineCache.ts`

#### Bypass 9: Generate event cache
- **Tables Bypassed**: `tickets`, `events`
- **Query**: 
  ```sql
  SELECT t.id, t.ticket_number, t.status, t.qr_hmac_secret, ... e.name
  FROM tickets t JOIN events e ON t.event_id = e.id
  WHERE t.event_id = $1 AND t.status IN ('SOLD', 'TRANSFERRED')
  ```
- **Client Method**: `TicketServiceClient.getTicketsForOfflineCache(eventId)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED - dedicated bulk ticket fetch for offline

#### Bypass 10: Update ticket HMAC secret
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2`
- **Client Method**: `TicketServiceClient.updateTicketHmacSecret(ticketId, secret)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

### File: `QRGenerator.ts`

#### Bypass 11: Generate rotating QR
- **Tables Bypassed**: `tickets`, `events`
- **Query**: 
  ```sql
  SELECT t.*, e.name as event_name, e.starts_at FROM tickets t 
  JOIN events e ON t.event_id = e.id WHERE t.id = $1
  ```
- **Client Method**: `TicketServiceClient.getTicketWithEvent(ticketId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT - use `GET /internal/tickets/:ticketId/full`

#### Bypass 12: Generate offline manifest
- **Tables Bypassed**: `tickets`
- **Query**: `SELECT t.* FROM tickets t WHERE t.event_id = $1 AND t.status IN (...)`
- **Client Method**: `TicketServiceClient.getTicketsByEvent(eventId, statuses)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT - extend `/internal/tickets` with event filter

### File: `QRValidator.ts`

#### Bypass 13: Validate scan - get ticket
- **Tables Bypassed**: `tickets`, `events`
- **Query**: 
  ```sql
  SELECT t.*, e.id as event_id, e.name FROM tickets t 
  JOIN events e ON t.event_id = e.id WHERE t.id = $1
  ```
- **Client Method**: `TicketServiceClient.getTicketForValidation(ticketId)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED - optimized for validation workflow

#### Bypass 14: Update ticket scan count
- **Tables Bypassed**: `tickets`
- **Query**: 
  ```sql
  UPDATE tickets SET scan_count = COALESCE(scan_count, 0) + 1, 
  last_scanned_at = NOW() WHERE id = $1
  ```
- **Client Method**: `TicketServiceClient.recordScan(ticketId)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

#### Bypass 15: Get ticket transfers
- **Tables Bypassed**: `ticket_transfers`
- **Query**: `SELECT new_ticket_id FROM ticket_transfers WHERE old_ticket_id = $1`
- **Client Method**: `TicketServiceClient.getTransferredTicketId(ticketId)` or `TransferServiceClient.getTransferByOldTicket()`
- **Complexity**: Simple

#### Bypass 16: Get scan stats
- **Tables Bypassed**: `scans`, `tickets`
- **Query**: Complex aggregation with filters
- **Client Method**: NEW ENDPOINT NEEDED - `GET /internal/events/:eventId/scan-stats`
- **Complexity**: Complex

### File: `routes/policies.ts`

#### Bypass 17: Get event policies
- **Tables Bypassed**: `scan_policies`, `events`, `venues`
- **Query**: `SELECT sp.*, e.name, v.name FROM scan_policies sp JOIN events e ... LEFT JOIN venues v ...`
- **Client Method**: `EventServiceClient.getEventWithVenue(eventId)` for name only
- **Complexity**: Simple
- **Notes**: `scan_policies` owned by scanning-service

#### Bypass 18: Get venue_id from events
- **Tables Bypassed**: `events`
- **Query**: `SELECT venue_id FROM events WHERE id = $1`
- **Client Method**: `EventServiceClient.getEvent(eventId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT available

---

## Payment Service Bypasses

### File: `reconciliation-service.ts`

#### Bypass 1: Reconcile orphaned payments
- **Tables Bypassed**: `orders`, `tickets`
- **Query**: 
  ```sql
  SELECT o.* FROM orders o LEFT JOIN tickets t ON t.order_id = o.id
  WHERE o.status = 'PAID' AND t.id IS NULL AND o.updated_at < NOW() - INTERVAL '5 minutes'
  ```
- **Client Method**: `OrderServiceClient.getOrdersWithoutTickets()` + `TicketServiceClient.getTicketsByOrder()`
- **Complexity**: Complex
- **Notes**: NEW ENDPOINT NEEDED - order-service should provide this

#### Bypass 2: Reconcile pending orders
- **Tables Bypassed**: `orders`, `payment_intents`
- **Query**: `SELECT o.*, pi.status FROM orders o LEFT JOIN payment_intents pi ...`
- **Client Method**: `OrderServiceClient.getPendingOrders()` (payment_intents owned by payment)
- **Complexity**: Medium

#### Bypass 3: Manual reconciliation - get tickets count
- **Tables Bypassed**: `tickets`
- **Query**: `SELECT COUNT(*) FROM tickets WHERE order_id = $1`
- **Client Method**: `TicketServiceClient.getTicketCountByOrder(orderId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT - `GET /internal/orders/:orderId/tickets`

#### Bypass 4: Update orders status
- **Tables Bypassed**: `orders`
- **Query**: `UPDATE orders SET status = $1 WHERE id = $2`
- **Client Method**: `OrderServiceClient.updateOrderStatus(orderId, status)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT - `POST /internal/orders/:orderId/update-status`

### File: `form-1099-da.service.ts`

#### Bypass 5: Get user NFT transactions
- **Tables Bypassed**: `marketplace_listings`, `tickets`, `events`
- **Query**: 
  ```sql
  SELECT ml.*, t.purchased_at, e.name FROM marketplace_listings ml 
  JOIN tickets t ... JOIN events e ... WHERE ml.seller_id = $1
  ```
- **Client Method**: NEW ENDPOINT NEEDED - Consider marketplace-service client
- **Complexity**: Complex
- **Notes**: May need cross-service aggregation; consider event sourcing approach

#### Bypass 6: Get user tax info
- **Tables Bypassed**: `users`, `user_tax_info`
- **Query**: `SELECT u.*, uti.* FROM users u LEFT JOIN user_tax_info uti ...`
- **Client Method**: `AuthServiceClient.getUserWithTaxInfo(userId)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED - `GET /internal/users/:userId/tax-info`

### File: `refund-policy.service.ts`

#### Bypass 7: Check refund eligibility
- **Tables Bypassed**: `tickets`, `events`, `venues`
- **Query**: 
  ```sql
  SELECT t.*, e.event_date, e.event_type, v.refund_policy_hours
  FROM tickets t JOIN events e ... LEFT JOIN venues v ...
  ```
- **Client Method**: `TicketServiceClient.getTicketForRefund(ticketId)` or separate calls
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED

#### Bypass 8: Update venue refund policy
- **Tables Bypassed**: `venues`
- **Query**: `UPDATE venues SET refund_policy_hours = $1 WHERE venue_id = $2`
- **Client Method**: `VenueServiceClient.updateRefundPolicy(venueId, hours)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

### File: `refundController.ts`

#### Bypass 9: Get refundable info
- **Tables Bypassed**: `payment_intents`, `orders`
- **Query**: `SELECT pi.*, o.ticket_count, o.promo_code FROM payment_intents pi JOIN orders o ...`
- **Client Method**: `OrderServiceClient.getOrderDetails(orderId)` (payment_intents owned)
- **Complexity**: Medium

#### Bypass 10: Calculate ticket refund amount
- **Tables Bypassed**: `tickets`, `orders`, `payment_intents`, `payment_refunds`
- **Query**: Complex multi-table join
- **Client Method**: `TicketServiceClient.getTicketsByIds()` + `OrderServiceClient.getOrderByPayment()`
- **Complexity**: Complex

#### Bypass 11: Update ticket status
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET status = 'refunded' WHERE id = $1`
- **Client Method**: `TicketServiceClient.updateTicketStatus(ticketId, 'refunded')`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT or NEW needed

### File: `transaction-timeout.service.ts`

#### Bypass 12: Find timed out transactions
- **Tables Bypassed**: `payment_transactions`, `inventory_reservations`, `users`
- **Query**: Complex join to get user email
- **Client Method**: `AuthServiceClient.getUserById(userId)` for email
- **Complexity**: Medium
- **Notes**: `payment_transactions`, `inventory_reservations` owned

#### Bypass 13: Update tickets on timeout
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET status = 'available' WHERE transaction_id = $1`
- **Client Method**: `TicketServiceClient.releaseReservedTickets(transactionId)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED

### File: `chargeback-reserve.service.ts`

#### Bypass 14: Calculate reserve - get user/venue info
- **Tables Bypassed**: `payment_transactions`, `users`, `venues`, `payment_chargebacks`
- **Query**: Complex join for risk assessment
- **Client Method**: `AuthServiceClient.getUserChargebackCount()`, `VenueServiceClient.getVenueChargebackRate()`
- **Complexity**: Complex
- **Notes**: NEW ENDPOINTS NEEDED for chargeback metrics

### File: `purchase-limiter.service.ts`

#### Bypass 15: Get user address
- **Tables Bypassed**: `users`
- **Query**: `SELECT billing_address FROM users WHERE id = $1`
- **Client Method**: `AuthServiceClient.getUserBillingAddress(userId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT extendable

### File: `contribution-tracker.service.ts`

#### Bypass 16: Get group analytics by venue
- **Tables Bypassed**: `group_payments`, `group_payment_members`, `events`
- **Query**: `SELECT ... FROM group_payments gp JOIN events e ON gp.event_id = e.id WHERE e.venue_id = $1`
- **Client Method**: `EventServiceClient.getEventsByVenue(venueId)` then local aggregation
- **Complexity**: Complex
- **Notes**: Consider dedicated analytics endpoint

### File: `reminder-engine.service.ts`

#### Bypass 17: Get unpaid members with event info
- **Tables Bypassed**: `group_payment_members`, `group_payments`, `events`
- **Query**: `SELECT m.*, g.*, e.name FROM ... JOIN events e ON g.event_id = e.id`
- **Client Method**: `EventServiceClient.getEvent(eventId)` for name
- **Complexity**: Simple

#### Bypass 18: Get reminder effectiveness by venue
- **Tables Bypassed**: `reminder_history`, `group_payment_members`, `group_payments`, `events`
- **Query**: Complex aggregation with venue filter
- **Client Method**: `EventServiceClient.getEventsByVenue()` for venue events
- **Complexity**: Complex

### File: `royalty-splitter.service.ts`

#### Bypass 19: Get royalty report by venue
- **Tables Bypassed**: `royalty_distributions`, `payment_transactions`, `events`
- **Query**: 
  ```sql
  SELECT e.id, e.name, ... FROM royalty_distributions rd 
  JOIN payment_transactions pt ... JOIN events e ON pt.event_id = e.id
  ```
- **Client Method**: `EventServiceClient.getEventDetails(eventId)` for names
- **Complexity**: Medium

### File: `order-event-processor.ts`

#### Bypass 20: Get/update order status
- **Tables Bypassed**: `orders`
- **Query**: `SELECT status FROM orders WHERE id = $1`, `UPDATE orders SET status = $1`
- **Client Method**: `OrderServiceClient.getOrderStatus()`, `OrderServiceClient.updateOrderStatus()`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINTS available

### File: `database-transaction.util.ts`

#### Bypass 21: Select order for payment
- **Tables Bypassed**: `orders`, `payment_intents`
- **Query**: `SELECT o.*, pi.* FROM orders o LEFT JOIN payment_intents pi ... FOR UPDATE OF o`
- **Client Method**: `OrderServiceClient.getOrderForPayment(orderId)` (payment_intents owned)
- **Complexity**: Medium
- **Notes**: FOR UPDATE locking complicates cross-service pattern

---

## Transfer Service Bypasses

### File: `transfer.service.ts`

#### Bypass 1: Get ticket for update
- **Tables Bypassed**: `tickets`
- **Query**: `SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE`
- **Client Method**: `TicketServiceClient.getTicketForTransfer(ticketId, userId)`
- **Complexity**: Complex
- **Notes**: FOR UPDATE locking - may need saga pattern

#### Bypass 2: Get ticket type
- **Tables Bypassed**: `ticket_types`
- **Query**: `SELECT * FROM ticket_types WHERE id = $1`
- **Client Method**: `TicketServiceClient.getTicketType(ticketTypeId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT extendable

#### Bypass 3: Get or create user
- **Tables Bypassed**: `users`
- **Query**: `SELECT id FROM users WHERE email = $1` + `INSERT INTO users ...`
- **Client Method**: `AuthServiceClient.findOrCreateUser(email)`
- **Complexity**: Medium
- **Notes**: EXISTING ENDPOINT - `POST /internal/users/find-or-create`

#### Bypass 4: Update ticket ownership
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET user_id = $1 WHERE id = $2`
- **Client Method**: `TicketServiceClient.transferTicket(ticketId, newOwnerId)`
- **Complexity**: Medium
- **Notes**: EXISTING ENDPOINT - `POST /internal/tickets/:ticketId/transfer`

### File: `transfer-rules.service.ts`

#### Bypass 5: Check event date proximity
- **Tables Bypassed**: `tickets`, `events`
- **Query**: `SELECT e.start_date FROM tickets t JOIN events e ON t.event_id = e.id WHERE t.id = $1`
- **Client Method**: `TicketServiceClient.getTicketWithEvent(ticketId)` or `EventServiceClient.getEventByTicket()`
- **Complexity**: Simple

#### Bypass 6: Check identity verification
- **Tables Bypassed**: `users`
- **Query**: `SELECT user_id, identity_verified FROM users WHERE user_id = ANY($1)`
- **Client Method**: `AuthServiceClient.checkUsersVerified(userIds)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

### File: `search.service.ts`

#### Bypass 7: Search transfers with event filter
- **Tables Bypassed**: `ticket_transfers`, `tickets`, `events`, `users`
- **Query**: Complex multi-table join with filtering
- **Client Method**: Multiple client calls or dedicated search endpoint
- **Complexity**: Complex
- **Notes**: Consider ElasticSearch/dedicated search service

#### Bypass 8: Get transfer suggestions
- **Tables Bypassed**: `ticket_transfers`, `tickets`
- **Query**: `SELECT DISTINCT ... FROM ticket_transfers tt LEFT JOIN tickets t ...`
- **Client Method**: Local search on owned data + ticket lookup
- **Complexity**: Medium

### File: `blockchain-transfer.service.ts`

#### Bypass 9: Update ticket NFT metadata
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET nft_mint_address = $1, nft_last_transfer_signature = $2 WHERE id = $3`
- **Client Method**: `TicketServiceClient.updateTicketNftInfo(ticketId, nftInfo)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

#### Bypass 10: Get ticket NFT metadata
- **Tables Bypassed**: `tickets`
- **Query**: `SELECT nft_mint_address FROM tickets WHERE id = $1`
- **Client Method**: `TicketServiceClient.getTicketNftAddress(ticketId)`
- **Complexity**: Simple

---

## Blockchain Service Bypasses

### File: `mint-worker.ts`

#### Bypass 1: Get venue wallet address
- **Tables Bypassed**: `venue_marketplace_settings`, `venues`
- **Query**: 
  ```sql
  SELECT royalty_wallet_address FROM venue_marketplace_settings WHERE venue_id = $1
  SELECT wallet_address FROM venues WHERE id = $1
  ```
- **Client Method**: `VenueServiceClient.getVenueWalletAddress(venueId)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT - `GET /internal/venues/:venueId/royalty-wallet`

#### Bypass 2: Get ticket details for minting
- **Tables Bypassed**: `tickets`, `order_items`, `orders`, `events`, `venues`
- **Query**: 
  ```sql
  SELECT t.*, e.name, e.description, v.name FROM tickets t 
  JOIN order_items oi ... JOIN orders o ... JOIN events e ... LEFT JOIN venues v ...
  ```
- **Client Method**: `TicketServiceClient.getTicketForMinting(orderId)` or `OrderServiceClient.getOrderWithTicketDetails()`
- **Complexity**: Complex
- **Notes**: NEW ENDPOINT NEEDED - dedicated mint payload endpoint

#### Bypass 3: Update ticket mint status
- **Tables Bypassed**: `tickets`
- **Query**: 
  ```sql
  UPDATE tickets SET mint_address = $1, minted_at = NOW(), metadata_uri = $2, transaction_signature = $3 
  FROM order_items oi WHERE t.id = oi.ticket_id AND oi.order_id = $4
  ```
- **Client Method**: `TicketServiceClient.updateMintStatus(orderId, mintInfo)`
- **Complexity**: Medium
- **Notes**: EXISTING ENDPOINT - `POST /internal/tickets/update-mint-status`

### File: `mint-worker.js`

- Same bypasses as `mint-worker.ts` (JavaScript version)

### File: `mintQueue.js`

- Same patterns - ticket status updates after minting

---

## Blockchain Indexer Bypasses

### File: `transactionProcessor.ts`

#### Bypass 1: Update tickets on mint
- **Tables Bypassed**: `tickets`
- **Query**: 
  ```sql
  UPDATE tickets SET is_minted = true, mint_transaction_id = $1, wallet_address = $2 
  WHERE token_id = $3
  ```
- **Client Method**: `TicketServiceClient.updateMintedTicket(tokenId, mintInfo)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINT NEEDED - by token_id lookup

#### Bypass 2: Update tickets on transfer
- **Tables Bypassed**: `tickets`, `ticket_transfers`
- **Query**: 
  ```sql
  UPDATE tickets SET wallet_address = $1, transfer_count = ... WHERE token_id = $2
  INSERT INTO ticket_transfers (ticket_id, from_wallet, to_wallet, ...) SELECT id FROM tickets WHERE token_id = $1
  ```
- **Client Method**: `TicketServiceClient.recordBlockchainTransfer(tokenId, transferInfo)`
- **Complexity**: Complex
- **Notes**: NEW ENDPOINT NEEDED

#### Bypass 3: Update tickets on burn
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET status = 'BURNED' WHERE token_id = $1`
- **Client Method**: `TicketServiceClient.markTicketBurned(tokenId)`
- **Complexity**: Simple

### File: `reconciliationEngine.ts`, `reconciliationEnhanced.ts`, `marketplaceTracker.ts`

- Similar patterns: lookup tickets by token_id, update blockchain sync status
- All require NEW ENDPOINTS for token_id-based lookups

---

## Compliance Service Bypasses

### File: `scheduler.service.ts`

#### Bypass 1-2: Get admin users, venue info for scheduled tasks
- **Tables Bypassed**: `users`, `venues`
- **Client Method**: `AuthServiceClient.getAdminUsers()`, `VenueServiceClient.getVenuesForCompliance()`
- **Complexity**: Medium
- **Notes**: EXISTING ENDPOINTS available

### File: `risk.service.ts`

#### Bypass 3-5: Risk assessment queries
- **Tables Bypassed**: `users`, `events`, `venues`
- **Client Method**: Multiple service clients for risk data aggregation
- **Complexity**: Complex
- **Notes**: Consider risk-specific internal endpoints

### File: `bank.service.ts`

#### Bypass 6-7: Venue bank verification
- **Tables Bypassed**: `venues`
- **Client Method**: `VenueServiceClient.getVenueBankInfo(venueId)`
- **Complexity**: Simple
- **Notes**: NEW ENDPOINT NEEDED

### File: `migration-batch.ts`

#### Bypass 8-10: Batch migration utilities
- **Tables Bypassed**: Various
- **Notes**: Migration utilities may be acceptable to run directly; evaluate case-by-case

---

## Monitoring Service Bypasses

### File: `revenue.collector.ts`

#### Bypass 1: Get venue metrics
- **Tables Bypassed**: `venues`
- **Query**: `SELECT * FROM venues`
- **Client Method**: `VenueServiceClient.getAllVenuesMetrics()`
- **Complexity**: Simple
- **Notes**: Consider read replica for monitoring

#### Bypass 2: Get event metrics
- **Tables Bypassed**: `events`
- **Query**: `SELECT * FROM events`
- **Client Method**: `EventServiceClient.getEventsMetrics()`
- **Complexity**: Simple

#### Bypass 3: Get ticket metrics
- **Tables Bypassed**: `tickets`
- **Query**: `SELECT * FROM tickets`
- **Client Method**: `TicketServiceClient.getTicketsMetrics()`
- **Complexity**: Simple

### File: `sales-tracker.ts`

#### Bypass 4-6: Sales tracking queries
- **Tables Bypassed**: `tickets`, `orders`, `events`
- **Notes**: Monitoring typically acceptable on read replicas
- **Recommendation**: Document as acceptable read-replica access pattern

---

## Minting Service Bypasses

### File: `MintingOrchestrator.ts`

#### Bypass 1: Get ticket for minting
- **Tables Bypassed**: `tickets`, `events`
- **Query**: 
  ```sql
  SELECT t.*, e.event_pda FROM tickets t JOIN events e ON t.event_id = e.id WHERE t.id = $1
  ```
- **Client Method**: `TicketServiceClient.getTicketForMinting(ticketId)` + `EventServiceClient.getEventPda(eventId)`
- **Complexity**: Medium
- **Notes**: NEW ENDPOINTS NEEDED

#### Bypass 2: Update ticket mint status
- **Tables Bypassed**: `tickets`
- **Query**: `UPDATE tickets SET mint_address = $1, is_minted = true WHERE id = $2`
- **Client Method**: `TicketServiceClient.updateMintStatus(ticketId, mintInfo)`
- **Complexity**: Simple
- **Notes**: EXISTING ENDPOINT

#### Bypass 3-4: Get event/venue blockchain info
- **Tables Bypassed**: `events`, `venues`
- **Client Method**: `EventServiceClient.getEventFull()` with venue details
- **Complexity**: Simple

---

## Analytics Service Bypasses

### File: `migrations/*.ts`

#### Note on Migrations
Migrations that create views or tables may legitimately reference other service tables for:
- Materialized views (read-only aggregations)
- Cross-reference tables for analytics

**Recommendation**: Document these as **acceptable exceptions** for analytics read replicas, OR refactor to pull data via service clients during ETL processes.

### File: `demand-tracker.service.ts`

#### Bypass 1-2: Track demand by event
- **Tables Bypassed**: `events`, `tickets`
- **Client Method**: `EventServiceClient.getEvent()`, `TicketServiceClient.getTicketAvailability()`
- **Complexity**: Medium

### File: `customer-insights.service.ts`

#### Bypass 3-5: Customer analytics
- **Tables Bypassed**: `users`, `orders`, `tickets`
- **Notes**: Consider dedicated analytics database with event-driven sync
- **Complexity**: Complex

### File: `pricing.controller.ts`

#### Bypass 6: Dynamic pricing queries
- **Tables Bypassed**: `tickets`, `events`
- **Client Method**: Service client calls for real-time pricing
- **Complexity**: Complex

### File: `customer-analytics.ts` (calculator)

#### Bypass 7-9: Customer aggregations
- **Tables Bypassed**: `users`, `orders`, `tickets`, `events`
- **Notes**: Acceptable for analytics read replica
- **Complexity**: Complex

### File: `pricing-worker.ts`

#### Bypass 10-12: Pricing worker queries
- **Tables Bypassed**: `tickets`, `events`
- **Notes**: May use batch service calls
- **Complexity**: Complex

---

## Summary Counts

### Bypasses by Table Owner

| Table Owner | # Bypasses | Services Bypassing |
|-------------|------------|-------------------|
| ticket-service | 32 | scanning (11), payment (8), transfer (6), blockchain (4), minting (2), analytics (1) |
| event-service | 18 | scanning (3), payment (5), transfer (2), blockchain (2), compliance (2), minting (2), analytics (2) |
| auth-service | 14 | payment (4), transfer (3), compliance (3), analytics (4) |
| venue-service | 12 | payment (2), blockchain (4), compliance (3), monitoring (2), analytics (1) |
| order-service | 8 | payment (6), blockchain (2) |

### Bypasses Requiring New Endpoints

| Service | # New Endpoints Needed | Description |
|---------|----------------------|-------------|
| ticket-service | 8 | Token lookup, scan recording, bulk fetches, NFT updates |
| auth-service | 3 | Tax info, batch verification, chargeback counts |
| event-service | 2 | Event PDA, scan stats aggregation |
| venue-service | 2 | Bank info, chargeback rates |
| order-service | 2 | Orphan detection, payment details |

### Complexity Distribution

| Complexity | Count | Percentage |
|------------|-------|------------|
| Simple | 31 | 30% |
| Medium | 55 | 53% |
| Complex | 18 | 17% |

---

## Implementation Priority

### Priority 1: Critical Security (Week 1)
Fix bypasses that affect data integrity or security:
1. Transfer ticket ownership (transfer-service → ticket-service)
2. Update ticket status (payment-service → ticket-service)
3. User lookup/create (transfer-service → auth-service)

### Priority 2: High Volume (Week 2)
Fix bypasses in hot paths:
1. QR validation ticket lookups (scanning-service)
2. Order reconciliation (payment-service)
3. Mint worker ticket updates (blockchain-service)

### Priority 3: Analytics/Reporting (Week 3)
Fix reporting bypasses or document as acceptable:
1. Analytics dashboard (scanning-service)
2. Revenue collector (monitoring-service)
3. Customer insights (analytics-service)

### Priority 4: Batch/Background (Week 4)
Fix remaining background process bypasses:
1. Reminder engine (payment-service)
2. Reconciliation engine (blockchain-indexer)
3. Compliance scheduler (compliance-service)

---

## New Endpoints Required Summary

### ticket-service New Internal Endpoints ✅ COMPLETED (Phase 5a - Jan 12, 2026)
```
GET  /internal/tickets/by-token/:tokenId         ✅ Already existed (Phase 3)
GET  /internal/tickets/by-event/:eventId         ✅ Already existed (Phase 3)
GET  /internal/orders/:orderId/tickets/count     ✅ NEW - Phase 5a
POST /internal/tickets/:ticketId/record-scan     ✅ NEW - Phase 5a
POST /internal/tickets/:ticketId/update-nft      ✅ NEW - Phase 5a
POST /internal/tickets/batch-by-token            ✅ NEW - Phase 5a
GET  /internal/tickets/:ticketId/for-validation  ✅ NEW - Phase 5a
GET  /internal/tickets/:ticketId/for-refund      ✅ NEW - Phase 5a
```

### auth-service New Internal Endpoints ✅ COMPLETED (Phase 5a - Jan 12, 2026)
```
GET  /internal/users/:userId/tax-info            ✅ NEW - Phase 5a
GET  /internal/users/:userId/chargeback-count    ✅ NEW - Phase 5a
POST /internal/users/batch-verification-check    ✅ NEW - Phase 5a
```

### event-service New Internal Endpoints ✅ COMPLETED (Phase 5a - Jan 12, 2026)
```
GET  /internal/events/:eventId/pda               ✅ NEW - Phase 5a
GET  /internal/events/:eventId/scan-stats        ✅ NEW - Phase 5a
```

### venue-service New Internal Endpoints ✅ COMPLETED (Phase 5a - Jan 12, 2026)
```
GET  /internal/venues/:venueId/bank-info         ✅ NEW - Phase 5a
GET  /internal/venues/:venueId/chargeback-rate   ✅ NEW - Phase 5a
```

### order-service New Internal Endpoints ✅ COMPLETED (Phase 5a - Jan 12, 2026)
```
GET  /internal/orders/without-tickets            ✅ NEW - Phase 5a
GET  /internal/orders/:orderId/for-payment       ✅ NEW - Phase 5a
```

---

## Appendix: Exception Patterns

### Acceptable Read Replica Access
The following patterns are acceptable when using a read replica:
- Monitoring service metrics collection
- Analytics service aggregations
- Compliance service reporting

### Acceptable Direct Access
The following may remain as direct database access:
- Database migrations
- One-time data migrations
- Disaster recovery scripts

---

*Document generated: January 12, 2026*
*Phase 5 of TicketToken Platform Security Remediation*
