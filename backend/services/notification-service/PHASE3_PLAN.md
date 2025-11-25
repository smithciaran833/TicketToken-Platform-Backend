# 📋 NOTIFICATION SERVICE - PHASE 3: MAKE IT TESTABLE

**Phase:** Testing & Quality Assurance  
**Goal:** Achieve 60%+ code coverage and validate all Phase 1 & 2 work  
**Estimated Effort:** 55 hours (7 working days with 1 engineer)  
**Status:** 📝 PLANNED

---

## 🎯 OBJECTIVES

1. **Validate Security:** Test all authentication and authorization from Phase 2
2. **Validate Providers:** Test SendGrid and Twilio integrations from Phase 1
3. **Coverage Target:** Achieve minimum 60% code coverage
4. **Quality Assurance:** Ensure error handling and edge cases are covered
5. **CI/CD Ready:** All tests passing and ready for automated testing

---

## 📊 CURRENT STATE

### What Exists (Phase 1 & 2 Complete)
- ✅ SendGrid email provider implemented
- ✅ Twilio SMS provider implemented
- ✅ All 12 email templates have unsubscribe links
- ✅ Authentication on all sensitive routes
- ✅ Role-based access control (user vs admin)
- ✅ Campaign routes secured (admin-only)
- ✅ Rate limiting configured
- ✅ Input validation middleware

### What's Missing (Phase 3 Needed)
- ❌ **Zero test files** (only setup.ts and fixtures exist)
- ❌ TypeScript errors in campaign.routes.ts
- ❌ No validation of security changes
- ❌ No provider integration tests
- ❌ No coverage reports

---

## 🗂️ TASK BREAKDOWN

### **GROUP 1: TypeScript Fixes** (1 hour)

Before writing tests, fix compilation errors:

#### Task 1.1: Fix Campaign Routes Type Errors (1 hour)
**File:** `src/routes/campaign.routes.ts`

**Problem:** 5 TypeScript errors - `request.body` typed as `unknown`

**Solution:**
```typescript
// Create types file
interface CreateCampaignRequest {
  venueId: string;
  name: string;
  templateId: string;
  segmentId?: string;
  // ... other fields
}

// Use in routes
const body = request.body as CreateCampaignRequest;
const campaignId = await campaignService.createCampaign(body);
```

**Files to Create/Modify:**
- `src/types/campaign.types.ts` (NEW) - Campaign request interfaces
- `src/routes/campaign.routes.ts` (MODIFY) - Add type assertions

**Acceptance Criteria:**
- ✅ No TypeScript compilation errors
- ✅ All campaign routes properly typed
- ✅ Type safety maintained

---

### **GROUP 2: Authentication & Authorization Tests** (12 hours)

Test all Phase 2 security implementations:

#### Task 2.1: Preference Routes Security Tests (3 hours)
**File:** `tests/integration/preferences-auth.test.ts` (NEW)

**Tests to Write:**
1. `GET /preferences/:userId` without auth → 401
2. `GET /preferences/:userId` as different user → 403
3. `GET /preferences/:userId` as same user → 200
4. `GET /preferences/:userId` as admin → 200
5. `PUT /preferences/:userId` without auth → 401
6. `PUT /preferences/:userId` as different user → 403
7. `PUT /preferences/:userId` as same user → 200
8. Security logging verification

**Mocks Needed:**
- JWT tokens (user & admin)
- Database responses

---

#### Task 2.2: Analytics Routes Security Tests (2 hours)
**File:** `tests/integration/analytics-auth.test.ts` (NEW)

**Tests to Write:**
1. `GET /analytics/metrics` without auth → 401
2. `GET /analytics/metrics` as regular user → 403
3. `GET /analytics/metrics` as admin → 200
4. `GET /analytics/channels` as regular user → 403
5. `GET /analytics/channels` as admin → 200
6. Security logging verification

**Mocks Needed:**
- JWT tokens (user & admin)
- Analytics data

---

#### Task 2.3: Campaign Routes Security Tests (3 hours)
**File:** `tests/integration/campaign-auth.test.ts` (NEW)

**Tests to Write (10 endpoints × 3 scenarios = 30 tests):**

For each endpoint:
- Without auth → 401
- As regular user → 403
- As admin → 200

**Endpoints:**
1. `POST /campaigns` - Create campaign
2. `POST /campaigns/:id/send` - Send campaign
3. `GET /campaigns/:id/stats` - Get stats
4. `POST /campaigns/segments` - Create segment
5. `POST /campaigns/segments/:id/refresh` - Refresh segment
6. `POST /campaigns/triggers` - Create trigger
7. `POST /campaigns/abandoned-carts` - Track cart
8. `POST /campaigns/ab-tests` - Create A/B test
9. `POST /campaigns/ab-tests/:id/start` - Start test
10. `POST /campaigns/ab-tests/:id/determine-winner` - Determine winner

**Mocks Needed:**
- Campaign service methods

---

#### Task 2.4: Notification Routes Auth Tests (2 hours)
**File:** `tests/integration/notification-auth.test.ts` (NEW)

**Tests to Write:**
1. `POST /send` without auth → 401
2. `POST /send` with valid auth → 200/202
3. `POST /send-batch` without auth → 401
4. `POST /send-batch` with valid auth → 200/202
5. `GET /status/:id` without auth → 401
6. `GET /status/:id` with valid auth → 200

**Mocks Needed:**
- Email/SMS providers

---

#### Task 2.5: Consent Routes Auth Tests (2 hours)
**File:** `tests/integration/consent-auth.test.ts` (NEW)

**Tests to Write:**
1. `POST /consent/grant` without auth → 401
2. `POST /consent/revoke` without auth → 401
3. `GET /consent/:customerId` without auth → 401
4. `GET /consent/:customerId` as different user → 403
5. `GET /consent/:customerId` as same user → 200
6. `GET /consent/:customerId` as admin → 200

---

### **GROUP 3: Provider Integration Tests** (8 hours)

Test SendGrid and Twilio implementations:

#### Task 3.1: SendGrid Provider Tests (3 hours)
**File:** `tests/unit/providers/sendgrid.test.ts` (NEW)

**Tests to Write:**
1. Successful email send returns message ID
2. Invalid API key throws error
3. Invalid recipient email handled gracefully
4. Template variables substituted correctly
5. Unsubscribe link present in HTML
6. Error responses parsed correctly
7. Provider verification works
8. Retry logic on transient failures

**Mock:** SendGrid API responses

---

#### Task 3.2: Twilio Provider Tests (3 hours)
**File:** `tests/unit/providers/twilio.test.ts` (NEW)

**Tests to Write:**
1. Successful SMS send returns message SID
2. Invalid credentials throw error
3. Invalid phone number handled gracefully
4. SMS content length validation
5. Error responses parsed correctly
6. Provider verification works
7. Retry logic on transient failures
8. Rate limit handling

**Mock:** Twilio API responses

---

#### Task 3.3: Provider Factory Tests (2 hours)
**File:** `tests/unit/providers/provider-factory.test.ts` (NEW)

**Tests to Write:**
1. Production mode returns SendGridProvider
2. Production mode returns TwilioProvider
3. Development mode returns MockEmailProvider
4. Development mode returns MockSMSProvider
5. Provider verification checks connectivity
6. Invalid mode handled gracefully
7. Missing credentials detected

---

### **GROUP 4: Template & Rendering Tests** (6 hours)

#### Task 4.1: Template Loading Tests (2 hours)
**File:** `tests/unit/services/template-loading.test.ts` (NEW)

**Tests to Write:**
1. All 12 email templates load successfully
2. All 4 SMS templates load successfully
3. Missing template errors are caught
4. Template compilation errors handled
5. Template cache works correctly
6. Invalid Handlebars syntax detected

---

#### Task 4.2: Template Rendering Tests (2 hours)
**File:** `tests/unit/services/template-rendering.test.ts` (NEW)

**Tests to Write:**
1. Variables substituted correctly
2. Missing variables handled gracefully
3. Branding data injected correctly
4. Unsubscribe URL generated
5. Preferences URL generated
6. White-label mode works
7. Special characters escaped

---

#### Task 4.3: Unsubscribe Compliance Tests (2 hours)
**File:** `tests/integration/unsubscribe.test.ts` (NEW)

**Tests to Write:**
1. All marketing emails have unsubscribe link
2. Unsubscribe token is unique
3. Unsubscribe endpoint works without auth
4. Invalid token returns 404
5. Already unsubscribed returns 200
6. Unsubscribe recorded in database
7. Preference updates work

---

### **GROUP 5: Business Logic Tests** (10 hours)

#### Task 5.1: Notification Service Tests (4 hours)
**File:** `tests/unit/services/notification.service.test.ts` (NEW)

**Tests to Write:**
1. Send email flow end-to-end
2. Send SMS flow end-to-end
3. Batch send processes all notifications
4. Consent checking before send
5. Suppression list checking
6. Quiet hours respected
7. Frequency limits enforced
8. Retry logic triggers on failure
9. Status tracking updates correctly
10. Cost tracking works

---

#### Task 5.2: Consent & Preferences Tests (3 hours)
**File:** `tests/unit/services/consent.test.ts` (NEW)

**Tests to Write:**
1. Preference updates persist
2. Consent recorded correctly
3. Suppression list additions work
4. Quiet hours calculation correct
5. Frequency limit checking works
6. Channel preferences respected
7. Type preferences respected
8. Unsubscribe flag honored

---

#### Task 5.3: Campaign Management Tests (3 hours)
**File:** `tests/unit/services/campaign.test.ts` (NEW)

**Tests to Write:**
1. Campaign creation works
2. Campaign sending processes correctly
3. Audience segmentation filters work
4. A/B test creation works
5. Abandoned cart tracking works
6. Trigger conditions evaluate correctly
7. Campaign scheduling works

---

### **GROUP 6: Rate Limiting Tests** (4 hours)

#### Task 6.1: Rate Limit Middleware Tests (2 hours)
**File:** `tests/unit/middleware/rate-limit.test.ts` (NEW)

**Tests to Write:**
1. Email rate limit enforced (20/hour)
2. SMS rate limit enforced (5/hour)
3. Global limits enforced
4. Per-user limits enforced
5. Critical notifications bypass limits
6. Rate limit headers present
7. Reset after time window

---

#### Task 6.2: Rate Limit Integration Tests (2 hours)
**File:** `tests/integration/rate-limiting.test.ts` (NEW)

**Tests to Write:**
1. /send endpoint rate limited
2. /send-batch endpoint rate limited
3. 429 returned when exceeded
4. Retry-After header set correctly
5. Different users have separate limits

---

### **GROUP 7: Error Handling & Edge Cases** (6 hours)

#### Task 7.1: Provider Error Handling Tests (2 hours)
**File:** `tests/unit/error-handling/provider-errors.test.ts` (NEW)

**Tests to Write:**
1. Network timeout handled
2. API error response parsed
3. Invalid credentials detected
4. Rate limit from provider handled
5. Retry logic activates correctly
6. Max retries reached handled
7. Circuit breaker opens on failures

---

#### Task 7.2: Validation Error Tests (2 hours)
**File:** `tests/unit/validation/input-validation.test.ts` (NEW)

**Tests to Write:**
1. Invalid email rejected
2. Invalid phone number rejected
3. Missing required fields rejected
4. Malformed JSON rejected
5. XSS attempts sanitized
6. SQL injection attempts blocked

---

#### Task 7.3: Edge Case Tests (2 hours)
**File:** `tests/integration/edge-cases.test.ts` (NEW)

**Tests to Write:**
1. Template with all missing variables
2. Notification to suppressed address blocked
3. Notification during quiet hours queued
4. Expired notification not sent
5. Concurrent batch sends handled
6. Duplicate notification detection
7. Empty batch handled

---

### **GROUP 8: Health Check Tests** (2 hours)

#### Task 8.1: Health Endpoint Tests (2 hours)
**File:** `tests/integration/health-check.test.ts` (NEW)

**Tests to Write:**
1. /health returns 200 when healthy
2. /health/db checks database
3. Provider connectivity checked
4. 503 when providers down
5. Degraded state reported
6. Redis connectivity checked
7. RabbitMQ connectivity checked

---

### **GROUP 9: Webhook Tests** (4 hours)

#### Task 9.1: SendGrid Webhook Tests (2 hours)
**File:** `tests/integration/webhooks/sendgrid.test.ts` (NEW)

**Tests to Write:**
1. Delivery confirmation processed
2. Open event tracked
3. Click event tracked
4. Bounce recorded
5. Spam complaint recorded
6. Invalid signature rejected
7. Database updated correctly

---

#### Task 9.2: Twilio Webhook Tests (2 hours)
**File:** `tests/integration/webhooks/twilio.test.ts` (NEW)

**Tests to Write:**
1. Delivery status processed
2. Failed delivery recorded
3. Invalid signature rejected
4. Database updated correctly

---

### **GROUP 10: Coverage & Reporting** (2 hours)

#### Task 10.1: Coverage Analysis (1 hour)
**Commands to run:**
```bash
npm run test:coverage
```

**Review:**
- Overall coverage percentage
- Per-file coverage
- Untested critical paths
- Coverage gaps

---

#### Task 10.2: Documentation (1 hour)
**File:** `PHASE3_COMPLETION_SUMMARY.md` (NEW)

**Document:**
- Test count by category
- Coverage report summary
- Known gaps
- CI/CD integration notes
- Future testing needs

---

## 📊 TEST SUITE SUMMARY

| Category | Files | Est. Tests | Time | Priority |
|----------|-------|------------|------|----------|
| TypeScript Fixes | 2 | - | 1h | 🔴 Critical |
| Auth Security | 5 | 40 | 12h | 🔴 Critical |
| Provider Integration | 3 | 30 | 8h | 🔴 Critical |
| Templates | 3 | 25 | 6h | 🟡 High |
| Business Logic | 3 | 35 | 10h | 🟡 High |
| Rate Limiting | 2 | 15 | 4h | 🟡 High |
| Error Handling | 3 | 20 | 6h | 🟢 Medium |
| Health Checks | 1 | 8 | 2h | 🟢 Medium |
| Webhooks | 2 | 15 | 4h | 🟢 Medium |
| Coverage | - | - | 2h | 🟢 Medium |

**Totals:**
- **24 new test files**
- **~188 tests**
- **55 hours** (7 working days)

---

## 🎯 SUCCESS CRITERIA

Phase 3 will be complete when:

- ✅ **60%+ code coverage** achieved across the service
- ✅ **All TypeScript errors fixed** in campaign routes
- ✅ **40+ authentication tests** passing (user isolation verified)
- ✅ **30+ provider tests** passing (SendGrid & Twilio validated)
- ✅ **25+ template tests** passing (unsubscribe links verified)
- ✅ **35+ business logic tests** passing (core functionality validated)
- ✅ **15+ rate limiting tests** passing (cost protection verified)
- ✅ **20+ error handling tests** passing (graceful failures)
- ✅ **8+ health check tests** passing (proper monitoring)
- ✅ **15+ webhook tests** passing (delivery tracking works)
- ✅ **Zero test failures** in CI/CD pipeline
- ✅ **PHASE3_COMPLETION_SUMMARY.md** documented

---

## 🚀 EXECUTION STRATEGY

### Week 1: Critical Path (24 hours)
**Days 1-3: Security & Providers**
- Fix TypeScript errors (1 hour)
- All authentication tests (12 hours)
- Provider integration tests (8 hours)
- Daily progress reviews

### Week 2: Core Functionality (20 hours)
**Days 4-6: Templates & Logic**
- Template tests (6 hours)
- Business logic tests (10 hours)
- Rate limiting tests (4 hours)

### Week 3: Quality & Coverage (11 hours)
**Days 7-8: Polish & Document**
- Error handling tests (6 hours)
- Health check tests (2 hours)
- Webhook tests (4 hours) - OPTIONAL if time
- Coverage analysis (1 hour)
- Documentation (1 hour)

---

## 🔧 TESTING TOOLS & SETUP

### Already Configured
- ✅ Jest test runner
- ✅ Supertest for API testing
- ✅ Test setup file (tests/setup.ts)
- ✅ Fixture data (tests/fixtures/)

### Additional Setup Needed
```bash
# Install additional testing utilities if needed
npm install --save-dev @types/supertest
npm install --save-dev nock  # For HTTP mocking
npm install --save-dev faker  # For test data generation
```

### Test Running Commands
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
npm test -- --verbose      # Detailed output
npm test -- filename.test.ts  # Specific file
```

---

## 📝 TEST FILE TEMPLATE

```typescript
import { FastifyInstance } from 'fastify';
import { buildFastifyApp } from '../../src/app';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('Feature Name', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Scenario Name', () => {
    it('should do something specific', async () => {
      // Arrange
      const request = { /* test data */};

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/endpoint',
        headers: { Authorization: 'Bearer token' },
        payload: request
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ /* expected */ });
    });
  });
});
```

---

## 🎬 NEXT STEPS

1. **Review this plan** - Confirm scope and priorities
2. **Toggle to Act Mode** - Ready to start implementation
3. **Begin with Group 1** - Fix TypeScript errors first
4. **Progress daily** - Complete one test group per day
5. **Review coverage** - After each group, check coverage impact

---

**Phase 3 Plan Created:** 2025-11-17  
**Ready to Execute:** ✅ YES  
**Estimated Completion:** 7 working days from start
