# OAuth Refactor Task

**Created:** $(date +%Y-%m-%d)
**Priority:** Medium
**Type:** Refactor + Bug Fix

---

## Summary

Integration testing revealed that OAuth implementation is inconsistent between validator and service layers. GitHub OAuth is implemented but not needed for a ticketing platform. Apple OAuth is validated but not implemented.

---

## Current State (Broken)

| Layer | Google | GitHub | Apple | Facebook |
|-------|--------|--------|-------|----------|
| Validator (`auth.validators.ts`) | ✅ | ❌ | ✅ | ✅ |
| Service (`oauth.service.ts`) | ✅ | ✅ | ❌ | ❌ |

**Result:** 
- GitHub requests fail validation (400) before reaching service
- Apple/Facebook pass validation but fail in service (returns 401)

---

## Target State

| Layer | Google | Apple | Facebook | GitHub |
|-------|--------|-------|----------|--------|
| Validator | ✅ | ✅ | ❌ (future) | ❌ REMOVE |
| Service | ✅ | ✅ | ❌ (future) | ❌ REMOVE |

---

## Tasks

### 1. Remove GitHub OAuth
- [ ] `src/services/oauth.service.ts` - Remove `exchangeGitHubCode()` method
- [ ] `src/services/oauth.service.ts` - Remove GitHub circuit breaker functions
- [ ] `src/services/oauth.service.ts` - Remove GitHub branch in `authenticate()`
- [ ] `src/config/oauth.ts` - Remove GitHub config
- [ ] `src/config/env.ts` - Remove `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`
- [ ] `tests/unit/services/oauth.service.test.ts` - Remove all GitHub tests
- [ ] `.env.example` - Remove GitHub env vars

### 2. Implement Apple OAuth (Optional - Phase 2)
- [ ] Research Apple Sign-In requirements
- [ ] Add `exchangeAppleCode()` method to service
- [ ] Add Apple config to `oauth.ts`
- [ ] Add env vars
- [ ] Add tests

### 3. Fix Validator/Service Alignment
- [ ] `src/validators/auth.validators.ts` - Update `providerParamSchema`:
```typescript
  // From:
  provider: Joi.string().valid('google', 'apple', 'facebook').required()
  // To (for now, until Apple implemented):
  provider: Joi.string().valid('google').required()
```

### 4. Update Integration Tests
- [ ] Remove all GitHub OAuth tests
- [ ] Remove skipped tests
- [ ] Fix Google OAuth mock issues (500 errors)
- [ ] Add `it.todo()` for Apple OAuth (future)

---

## Files Affected
```
src/
├── services/oauth.service.ts      # Main refactor
├── config/oauth.ts                # Remove GitHub config
├── config/env.ts                  # Remove GitHub env vars
├── validators/auth.validators.ts  # Fix provider enum

tests/
├── unit/services/oauth.service.test.ts        # Remove GitHub tests
├── integration/oauth-flow.integration.test.ts # Fix/rewrite

docs/
├── (various) - Search for GitHub OAuth references
```

---

## Test Results That Revealed This
```
Tests: 12 failed, 2 skipped, 18 passed, 32 total

Key Failures:
- Google OAuth returns 500 (mock not working properly)
- Apple/Facebook return 401 with "Validation failed" 
- GitHub returns 400 (not in validator)
```

---

## Notes

- Apple Sign-In is **required** by App Store if app has any social login
- Facebook is declining in popularity, low priority
- Google is essential - most users have Gmail
- GitHub makes zero sense for ticket buyers

---

## Definition of Done

- [ ] All GitHub OAuth code removed
- [ ] Validator only accepts implemented providers
- [ ] Google OAuth integration tests pass
- [ ] Unit tests updated and passing
- [ ] No references to GitHub OAuth in codebase
