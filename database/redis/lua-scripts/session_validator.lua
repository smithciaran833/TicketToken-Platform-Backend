-- Enhanced error handling wrapper for: 
-- session_validator.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Validate and manage user sessions with security checks
    -- 
    -- Features:
    -- 1. Basic session validation with device fingerprinting
    -- 2. IP validation and risk scoring
    -- 3. Session management operations (create, invalidate, refresh)
    -- 4. Concurrent session limiting
    
    -- =============================================================================
    -- BASIC SESSION VALIDATION
    -- =============================================================================
    -- Validates session token and updates activity
    
    local function validate_session()
        local session_key = KEYS[1]
        local user_id = ARGV[1]
        local device_fingerprint = ARGV[2]
        local ip_address = ARGV[3]
        local current_time = tonumber(ARGV[4])
        
        -- Check if session exists
        local session_exists = redis.call('EXISTS', session_key)
        if session_exists == 0 then
            return {0, "Session not found"}
        end
        
        -- Get session data
        local session_data = redis.call('HGETALL', session_key)
        local session = {}
        for i = 1, #session_data, 2 do
            session[session_data[i]] = session_data[i + 1]
        end
        
        -- Check if session is expired
        local expires_at = tonumber(session.expires_at or 0)
        if expires_at < current_time then
            redis.call('DEL', session_key)
            return {0, "Session expired"}
        end
        
        -- Validate device fingerprint
        if session.device_fingerprint and session.device_fingerprint ~= device_fingerprint then
            -- Log suspicious activity
            redis.call('HINCRBY', 'security:alerts:' .. user_id, 'device_mismatch', 1)
            return {0, "Device fingerprint mismatch"}
        end
        
        return {1, session}
    end
    
    -- =============================================================================
    -- IP VALIDATION AND RISK SCORING
    -- =============================================================================
    -- Checks IP reputation and calculates risk score
    
    local function check_ip_risk(user_id, ip_address, session)
        local risk_score = 0
        local risk_factors = {}
        
        -- Check if IP is blocked
        local blocked = redis.call('EXISTS', 'blocked:ip:' .. ip_address)
        if blocked == 1 then
            return {0, "IP address blocked", 100}
        end
        
        -- Check IP change frequency
        local ip_history_key = 'user:ip_history:' .. user_id
        local recent_ips = redis.call('ZREVRANGE', ip_history_key, 0, 9, 'WITHSCORES')
        
        -- Count unique IPs in last hour
        local unique_ips = {}
        local one_hour_ago = tonumber(ARGV[4]) - 3600
        
        for i = 1, #recent_ips, 2 do
            local ip = recent_ips[i]
            local timestamp = tonumber(recent_ips[i + 1])
            if timestamp > one_hour_ago then
                unique_ips[ip] = true
            end
        end
        
        local ip_count = 0
        for _ in pairs(unique_ips) do
            ip_count = ip_count + 1
        end
        
        -- Risk scoring based on IP changes
        if ip_count > 5 then
            risk_score = risk_score + 50
            table.insert(risk_factors, "High IP variation")
        elseif ip_count > 3 then
            risk_score = risk_score + 20
            table.insert(risk_factors, "Moderate IP variation")
        end
        
        -- Check if IP is from different country than usual
        if session.primary_country and session.last_ip then
            -- In production, would use GeoIP lookup
            -- For now, simulate with IP prefix check
            local current_prefix = string.match(ip_address, "^(%d+%.%d+)")
            local last_prefix = string.match(session.last_ip or "", "^(%d+%.%d+)")
            
            if current_prefix ~= last_prefix then
                risk_score = risk_score + 30
                table.insert(risk_factors, "Geographic anomaly")
            end
        end
        
        -- Record IP usage
        redis.call('ZADD', ip_history_key, ARGV[4], ip_address)
        redis.call('EXPIRE', ip_history_key, 86400) -- 24 hour history
        
        return {1, risk_score, risk_factors}
    end
    
    -- =============================================================================
    -- SESSION MANAGEMENT OPERATIONS
    -- =============================================================================
    
    -- Create new session
    local function create_session()
        local user_id = ARGV[1]
        local session_token = ARGV[2]
        local device_fingerprint = ARGV[3]
        local ip_address = ARGV[4]
        local current_time = tonumber(ARGV[5])
        local role = ARGV[6] or "customer"
        
        -- Check concurrent session limit
        local user_sessions_key = 'user:sessions:' .. user_id
        local active_sessions = redis.call('SMEMBERS', user_sessions_key)
        
        -- Limit to 5 concurrent sessions
        if #active_sessions >= 5 then
            -- Remove oldest session
            local oldest_session = nil
            local oldest_time = current_time
            
            for _, session_id in ipairs(active_sessions) do
                local created = redis.call('HGET', session_id, 'created_at')
                if created and tonumber(created) < oldest_time then
                    oldest_time = tonumber(created)
                    oldest_session = session_id
                end
            end
            
            if oldest_session then
                redis.call('DEL', oldest_session)
                redis.call('SREM', user_sessions_key, oldest_session)
            end
        end
        
        -- Create session
        local session_key = 'session:' .. user_id .. ':' .. session_token
        redis.call('HSET', session_key,
            'user_id', user_id,
            'session_token', session_token,
            'device_fingerprint', device_fingerprint,
            'ip_address', ip_address,
            'created_at', current_time,
            'last_activity', current_time,
            'expires_at', current_time + 7200, -- 2 hours
            'role', role,
            'requests_count', 0
        )
        
        -- Add to user's active sessions
        redis.call('SADD', user_sessions_key, session_key)
        redis.call('EXPIRE', user_sessions_key, 86400) -- 24 hours
        
        -- Set session TTL
        redis.call('EXPIRE', session_key, 7200)
        
        return {1, "Session created", session_key}
    end
    
    -- Invalidate session
    local function invalidate_session()
        local session_key = KEYS[1]
        local user_id = ARGV[1]
        
        -- Remove from active sessions
        redis.call('SREM', 'user:sessions:' .. user_id, session_key)
        
        -- Delete session
        redis.call('DEL', session_key)
        
        return {1, "Session invalidated"}
    end
    
    -- Refresh session
    local function refresh_session()
        local session_key = KEYS[1]
        local current_time = tonumber(ARGV[4])
        
        -- Extend expiration
        redis.call('HSET', session_key,
            'expires_at', current_time + 7200,
            'last_refresh', current_time
        )
        redis.call('EXPIRE', session_key, 7200)
        
        return {1, "Session refreshed"}
    end
    
    -- =============================================================================
    -- MAIN DISPATCHER
    -- =============================================================================
    -- ARGV[5] = operation (validate, create, invalidate, refresh)
    
    local operation = ARGV[5] or "validate"
    
    if operation == "validate" then
        -- Validate basic session
        local session_result = validate_session()
        if session_result[1] == 0 then
            return session_result
        end
        
        local session = session_result[2]
        
        -- Check IP risk
        local ip_result = check_ip_risk(ARGV[1], ARGV[3], session)
        if ip_result[1] == 0 then
            return {0, ip_result[2], ip_result[3]}
        end
        
        local risk_score = ip_result[2]
        local risk_factors = ip_result[3]
        
        -- Update session with risk assessment
        redis.call('HSET', KEYS[1],
            'last_activity', ARGV[4],
            'last_ip', ARGV[3],
            'requests_count', (tonumber(session.requests_count or 0) + 1),
            'risk_score', risk_score,
            'risk_factors', table.concat(risk_factors, ",")
        )
        
        -- Extend session TTL (30 minutes from last activity)
        redis.call('EXPIRE', KEYS[1], 1800)
        
        -- Return validation result with risk assessment
        return {1, "Session valid", session.user_id, session.role, risk_score, risk_factors}
    
    elseif operation == "create" then
        return create_session()
    
    elseif operation == "invalidate" then
        return invalidate_session()
    
    elseif operation == "refresh" then
        return refresh_session()
    
    else
        return {0, "Unknown operation: " .. operation}
    end
end

local status, result = pcall(safe_execute)
if not status then
    redis.log(redis.LOG_WARNING, "Error in script: " .. tostring(result))
    return redis.error_reply("Script error: " .. tostring(result))
end
return result
