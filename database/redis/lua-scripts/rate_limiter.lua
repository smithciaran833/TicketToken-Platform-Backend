-- Enhanced error handling wrapper for: 
-- rate_limiter.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Implement sophisticated rate limiting with sliding windows
    -- 
    -- Features:
    -- 1. Sliding window rate limiting
    -- 2. Multi-level rate limiting (user, IP, device)
    -- 3. Burst allowance for temporary spikes
    -- 4. Endpoint-specific rate limits
    
    -- =============================================================================
    -- SLIDING WINDOW RATE LIMITER
    -- =============================================================================
    -- Implements a sliding window rate limiter with burst support
    -- Returns: {success, current_count, limit, retry_after}
    
    local function sliding_window_check(key, window, limit, now, request_id, burst_factor)
        -- Remove expired entries
        local expired_time = now - window
        redis.call('ZREMRANGEBYSCORE', key, '-inf', expired_time)
        
        -- Count current requests in window
        local current_count = redis.call('ZCARD', key)
        
        -- Calculate effective limit with burst
        local burst_limit = limit
        if burst_factor and burst_factor > 1 then
            -- Allow burst for first few requests
            if current_count < limit * 0.2 then
                burst_limit = math.floor(limit * burst_factor)
            end
        end
        
        -- Check if limit exceeded
        if current_count >= burst_limit then
            -- Get oldest request time to calculate retry-after
            local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
            local retry_after = 0
            if oldest[2] then
                retry_after = math.ceil(tonumber(oldest[2]) + window - now)
            end
            
            return {0, current_count, limit, retry_after}
        end
        
        -- Add current request
        redis.call('ZADD', key, now, request_id)
        
        -- Set expiry on the key
        redis.call('EXPIRE', key, window)
        
        -- Return success with current count
        return {1, current_count + 1, limit, 0}
    end
    
    -- =============================================================================
    -- ENDPOINT-SPECIFIC LIMITS
    -- =============================================================================
    -- Get rate limit configuration for specific endpoints
    
    local function get_endpoint_limits(endpoint)
        -- Define endpoint-specific limits
        local endpoint_configs = {
            ["/api/login"] = {window = 900, limit = 5, burst = 1.0},           -- 5 per 15 minutes, no burst
            ["/api/tickets/purchase"] = {window = 60, limit = 10, burst = 1.5}, -- 10 per minute, 50% burst
            ["/api/events/search"] = {window = 60, limit = 30, burst = 2.0},    -- 30 per minute, 100% burst
            ["/api/wallet/transfer"] = {window = 300, limit = 10, burst = 1.0}, -- 10 per 5 minutes, no burst
            ["default"] = {window = 3600, limit = 100, burst = 1.5}            -- Default: 100 per hour
        }
        
        return endpoint_configs[endpoint] or endpoint_configs["default"]
    end
    
    -- =============================================================================
    -- MAIN RATE LIMITER
    -- =============================================================================
    -- KEYS[1] = primary rate limit key
    -- KEYS[2] = IP rate limit key (optional)
    -- KEYS[3] = device rate limit key (optional)
    -- ARGV[1] = window size in seconds (or "auto" for endpoint-based)
    -- ARGV[2] = max requests for primary (or endpoint path)
    -- ARGV[3] = current timestamp
    -- ARGV[4] = request identifier
    -- ARGV[5] = operation type (basic, multi, endpoint)
    -- ARGV[6] = max requests for IP (if multi)
    -- ARGV[7] = max requests for device (if multi)
    
    local operation = ARGV[5] or "basic"
    local now = tonumber(ARGV[3])
    local request_id = ARGV[4]
    
    if operation == "basic" then
        -- Single level rate limiting
        return sliding_window_check(KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), 
                                   now, request_id, 1.0)
    
    elseif operation == "multi" then
        -- Multi-level rate limiting
        local window = tonumber(ARGV[1])
        
        -- Check primary limit
        local primary_limit = tonumber(ARGV[2])
        local primary_result = sliding_window_check(KEYS[1], window, primary_limit, now, request_id .. "_primary", 1.5)
        
        if primary_result[1] == 0 then
            return {0, "primary", primary_result[2], primary_result[3], primary_result[4]}
        end
        
        -- Check IP limit if provided
        if KEYS[2] and ARGV[6] then
            local ip_limit = tonumber(ARGV[6])
            local ip_result = sliding_window_check(KEYS[2], window, ip_limit, now, request_id .. "_ip", 1.0)
            
            if ip_result[1] == 0 then
                -- Rollback primary
                redis.call('ZREM', KEYS[1], request_id .. "_primary")
                return {0, "ip", ip_result[2], ip_result[3], ip_result[4]}
            end
        end
        
        -- Check device limit if provided
        if KEYS[3] and ARGV[7] then
            local device_limit = tonumber(ARGV[7])
            local device_result = sliding_window_check(KEYS[3], window, device_limit, now, request_id .. "_device", 1.0)
            
            if device_result[1] == 0 then
                -- Rollback primary and IP
                redis.call('ZREM', KEYS[1], request_id .. "_primary")
                if KEYS[2] then
                    redis.call('ZREM', KEYS[2], request_id .. "_ip")
                end
                return {0, "device", device_result[2], device_result[3], device_result[4]}
            end
        end
        
        -- All checks passed
        return {1, "all", primary_result[2], primary_limit, 0}
    
    elseif operation == "endpoint" then
        -- Endpoint-specific rate limiting
        local endpoint = ARGV[2]
        local config = get_endpoint_limits(endpoint)
        
        -- Apply endpoint-specific limits
        local result = sliding_window_check(KEYS[1], config.window, config.limit, 
                                           now, request_id, config.burst)
        
        if result[1] == 1 then
            return {1, endpoint, result[2], result[3], 0}
        else
            return {0, endpoint, result[2], result[3], result[4]}
        end
    
    else
        return {0, "error", 0, 0, 0, "Unknown operation: " .. operation}
    end
end

local status, result = pcall(safe_execute)
if not status then
    redis.log(redis.LOG_WARNING, "Error in script: " .. tostring(result))
    return redis.error_reply("Script error: " .. tostring(result))
end
return result
