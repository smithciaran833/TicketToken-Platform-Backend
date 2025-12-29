# Venue Service - 29 Resale Business Rules Audit

**Service:** venue-service
**Document:** 29-resale-business-rules.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 35% (14/40 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No price cap enforcement, No transfer limit tracking, No timing validation |
| HIGH | 5 | No jurisdiction detection, No resale approval, No transfer history, No price validation, No seller verification |
| MEDIUM | 6 | No anti-scalping measures, No fraud prevention, Basic settings only |
| LOW | 2 | Settings not exposed via API, No documentation |

---

## Key Finding

Venue-service stores configuration flags for resale but does NOT implement business rule enforcement. Actual enforcement must occur in marketplace-service or ticket-service.

---

## Price Controls (FAIL)

- No price cap logic
- No face_value field
- No jurisdiction-specific rules
- No artist policy integration

---

## Timing Rules (PARTIAL)

- transfer_deadline_hours exists
- timezone field exists
- No listing/purchase cutoff fields
- No automatic cutoff at event start

---

## Transfer Limits (FAIL)

- No transfer count tracking
- No max transfer limit field
- No transfer history table
- ticket_transfer_allowed flag exists but not enforced

---

## Existing Settings (venue_settings table)

| Field | Type | Default |
|-------|------|---------|
| max_tickets_per_order | INTEGER | 10 |
| ticket_resale_allowed | BOOLEAN | true |
| allow_print_at_home | BOOLEAN | true |
| allow_mobile_tickets | BOOLEAN | true |
| require_id_verification | BOOLEAN | false |
| ticket_transfer_allowed | BOOLEAN | true |

---

## Missing Configuration Fields

### Price Caps
- price_cap_type (NONE, FACE_VALUE, FIXED_MARKUP, PERCENTAGE)
- max_markup_amount
- max_markup_percent
- jurisdiction

### Transfer Limits
- max_transfers_per_ticket
- transfer_cooldown_hours

### Timing
- listing_cutoff_hours
- purchase_cutoff_hours
- allow_post_event_listing
- post_event_window_minutes

---

## Remediation Priority

### CRITICAL (This Week)
1. Add price cap configuration fields to venue_settings
2. Add transfer limit configuration fields
3. Add resale timing configuration fields

### HIGH (This Month)
1. Document integration requirements for marketplace-service
2. Add API endpoints to expose resale settings
3. Add jurisdiction mapping
4. Add artist policy fields

### MEDIUM (This Quarter)
1. Add approved channels configuration
2. Add event-level resale overrides
3. Add policy change webhooks
4. Add audit logging for setting changes

---

## Architecture Note

Current: Venue-service stores configuration flags only.

Required: A resale rules engine (in marketplace-service) that:
1. Reads venue settings via API
2. Enforces price caps based on jurisdiction
3. Tracks transfer history per ticket
4. Validates timing windows
5. Blocks non-compliant listings/transfers
