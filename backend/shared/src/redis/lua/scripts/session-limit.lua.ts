/**
 * Session Limit Lua Script
 * 
 * Atomically check user session count and create new session if under limit.
 * Prevents race conditions in concurrent login attempts.
 */

export const SESSION_LIMIT_SCRIPT = `
-- KEYS[1]: user sessions set key (e.g., "user:sessions:userId")
-- KEYS[2]: new session key (e.g., "session:sessionId")
-- ARGV[1]: max sessions per user
-- ARGV[2]: session ID to add
-- ARGV[3]: session TTL in seconds

local user_sessions_key = KEYS[1]
local session_key = KEYS[2]
local max_sessions = tonumber(ARGV[1])
local session_id = ARGV[2]
local ttl = tonumber(ARGV[3])

-- Get current session count
local current_count = redis.call('SCARD', user_sessions_key)

-- Check if under limit
if current_count < max_sessions then
  -- Add session to user's set
  redis.call('SADD', user_sessions_key, session_id)
  -- Set TTL on user sessions set
  redis.call('EXPIRE', user_sessions_key, ttl * 2)
  -- Return success with count
  return {1, current_count + 1}
else
  -- Return failure with current count
  return {0, current_count}
end
`;
