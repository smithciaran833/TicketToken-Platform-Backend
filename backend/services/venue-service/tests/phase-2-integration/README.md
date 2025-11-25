# PHASE 2 - INTEGRATIONS & ANALYTICS 🔗

**Priority:** HIGH  
**Time Estimate:** 5-6 hours  
**Goal:** Test third-party integrations and analytics

---

## TEST FILES TO CREATE

### 1. `venue-integrations.test.ts`
**Third-party integration management**
- Add Ticketmaster integration
- Add Eventbrite integration
- Add Stripe payment integration
- Update integration credentials
- Test integration connection
- Disable integration
- Enable integration
- Remove integration
- Integration status checking
- Webhook configuration
- OAuth flow for integrations

**Files Tested:**
- controllers/integrations.controller.ts (13KB)
- services/integration.service.ts
- models/integration.model.ts
- schemas/integration.schema.ts

---

### 2. `venue-analytics.test.ts`
**Analytics and reporting**
- Total events hosted
- Total tickets sold through venue
- Revenue by time period
- Occupancy rates
- Popular event types
- Busiest days/times
- Average ticket price
- Customer demographics
- Repeat visitor rate
- Analytics date range filtering

**Files Tested:**
- controllers/analytics.controller.ts
- services/analytics.service.ts

---

### 3. `venue-onboarding.test.ts`
**New venue onboarding flow**
- Start onboarding process
- Complete venue details step
- Upload venue photos
- Configure payment methods
- Set operational hours
- Complete verification step
- Onboarding progress tracking
- Resume incomplete onboarding
- Onboarding completion notification

**Files Tested:**
- services/onboarding.service.ts
- services/venue.service.ts

---

### 4. `venue-verification.test.ts`
**Venue verification process**
- Submit venue for verification
- Admin review venue
- Approve venue
- Reject venue with reason
- Request additional information
- Resubmit after rejection
- Verification status tracking
- Verification badges
- Reverify after major changes

**Files Tested:**
- services/verification.service.ts
- services/venue.service.ts

---

### 5. `internal-api.test.ts`
**Internal service communication**
- Validate venue exists (for event-service)
- Check venue capacity available
- Reserve capacity
- Release capacity
- Get venue details for booking
- Venue availability check
- Internal auth validation

**Files Tested:**
- routes/internal-validation.routes.ts
- services/venue.service.ts

---

### 6. `event-publishing.test.ts`
**Event bus integration**
- Publish venue created event
- Publish venue updated event
- Publish venue deleted event
- Publish staff added event
- Event message format
- RabbitMQ integration
- Failed publish retry
- Dead letter queue

**Files Tested:**
- services/eventPublisher.ts

---

## SUCCESS CRITERIA

- ✅ All 6 test files created
- ✅ Integrations working
- ✅ Analytics calculating correctly
- ✅ Onboarding flow complete
- ✅ Verification process working
- ✅ Internal APIs functional
- ✅ Event publishing working
