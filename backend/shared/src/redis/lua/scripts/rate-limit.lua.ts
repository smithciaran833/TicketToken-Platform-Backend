/**
 * Rate Limit Lua Script
 * 
 * Atomic sliding window rate limiting using sorted sets.
 * More accurate than fixed window, prevents burst at boundaries.
 */

export const RATE_LIMIT_SCRIPT = `
-- KEYS[1]: rate limit key
-- ARGV[1]: current timestamp (milliseconds)
-- ARGV[2]: window size (milliseconds)
-- ARGV[3]: max requests allowed

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])

-- Remove old entries outside the window
local window_start = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current requests in window
local current = redis.call('ZCARD', key)

-- Check if limit exceeded
if current < max_requests then
  -- Add current request with timestamp as score
  redis.call('ZADD', key, now, now)
  -- Set expiry on key
  redis.call('PEXPIRE', key, window)
  -- Return: allowed, remaining, reset_at
  return {1, max_requests - current - 1, now + window}
else
  -- Get oldest entry to calculate reset time
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_at = tonumber(oldest[2]) + window
  -- Return: denied, remaining (0), reset_at
  return {0, 0, reset_at}
end
`;
