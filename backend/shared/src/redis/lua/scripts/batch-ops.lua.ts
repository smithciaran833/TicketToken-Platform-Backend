/**
 * Batch Operations Lua Script
 * 
 * Perform multiple operations atomically in a single round-trip.
 * Useful for complex multi-key operations that need consistency.
 */

export const BATCH_OPS_SCRIPT = `
-- KEYS: array of keys to operate on
-- ARGV: array of operations and values
-- Format: operation, value, operation, value, ...
-- Operations: SET, GET, INCR, DEL, EXPIRE

local results = {}
local key_idx = 1

-- Process operations in pairs
for i = 1, #ARGV, 2 do
  local operation = ARGV[i]
  local value = ARGV[i + 1]
  local key = KEYS[key_idx]
  
  if operation == 'SET' then
    redis.call('SET', key, value)
    table.insert(results, 'OK')
  elseif operation == 'GET' then
    local result = redis.call('GET', key)
    table.insert(results, result or '')
  elseif operation == 'INCR' then
    local result = redis.call('INCRBY', key, tonumber(value))
    table.insert(results, result)
  elseif operation == 'DEL' then
    local result = redis.call('DEL', key)
    table.insert(results, result)
  elseif operation == 'EXPIRE' then
    local result = redis.call('EXPIRE', key, tonumber(value))
    table.insert(results, result)
  else
    table.insert(results, 'UNKNOWN_OP')
  end
  
  key_idx = key_idx + 1
end

return results
`;
