# Auth-Service Database Analysis

## Tables Used

### users (EXISTS ✓)
All required columns exist. No gaps.

### token_refresh_log (MISSING ✗)
**Referenced in:** auth.service.ts - refreshTokens()
**Operations:** INSERT
**Required schema:**
CREATE TABLE token_refresh_log (
  user_id UUID REFERENCES users(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  refreshed_at TIMESTAMPTZ DEFAULT NOW()
);

### invalidated_tokens (MISSING ✗)
**Referenced in:** auth.service.ts - logout()
**Operations:** INSERT
**Required schema:**
CREATE TABLE invalidated_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  invalidated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

### user_sessions (MISSING ✗)
**Referenced in:** auth.service.ts - logout()
**Operations:** UPDATE
**Required schema:**
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

## Summary
- Missing Tables: 3
- Missing Columns: 0

## Next Steps
1. Create migration for 3 missing tables
2. Test all auth endpoints
3. Document any additional gaps found during testing

## Known Issues

### Logout Endpoint - Database Error
**Status:** UNRESOLVED
**Error:** PostgreSQL error 42P01 "relation does not exist" at position 13
**Query:** `UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1`
**Investigation:**
- Table `user_sessions` exists in public schema ✓
- Search_path set to public ✓
- Direct psql query with same search_path works ✓
- Issue appears to be timing/async problem with pool connection handler
**Impact:** Users cannot logout via API (tokens remain valid)
**Workaround:** Tokens expire naturally after TTL
**TODO:** Investigate pool.on('connect') async timing or switch to inline search_path in queries

