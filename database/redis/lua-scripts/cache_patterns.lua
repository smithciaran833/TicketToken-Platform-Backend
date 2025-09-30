-- Enhanced error handling wrapper for: 
-- cache_patterns.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Implement various caching patterns for optimal performance
    -- 
    -- Features:
    -- 1. Cache-aside pattern for read optimization
    -- 2. Write-through pattern for consistency
    -- 3. Refresh-ahead pattern for proactive updates
    -- 4. Cache warming for preloading
    -- 5. Batch operations for efficiency
    
    -- =============================================================================
    -- CACHE-ASIDE PATTERN
    -- =============================================================================
    -- Read from cache, fallback to source, update cache
    
    local function cache_aside(cache_key, entity_type, entity_id, ttl)
        local cached_data = redis.call('GET', cache_key)
        
        if cached_data then
            -- Update access stats
            redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'hits', 1)
            redis.call('HSET', 'cache:access:' .. entity_type, entity_id, ARGV[5] or "0")
            
            return {1, cached_data, "cache_hit"}
        else
            -- Cache miss
            redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'misses', 1)
            
            -- Return indication to fetch from source
            return {0, nil, "cache_miss"}
        end
    end
    
    -- =============================================================================
    -- WRITE-THROUGH PATTERN
    -- =============================================================================
    -- Write to cache and source simultaneously
    
    local function write_through(cache_key, entity_type, entity_id, data, ttl)
        -- Write to cache
        redis.call('SET', cache_key, data, 'EX', ttl)
        
        -- Also update related computed caches
        if entity_type == "event" then
            -- Update event statistics cache
            local stats_key = 'cache:' .. entity_type .. ':' .. entity_id .. ':stats'
            redis.call('HSET', stats_key, 'last_updated', ARGV[5] or "0")
            redis.call('EXPIRE', stats_key, ttl)
        elseif entity_type == "venue" then
            -- Update venue capacity cache
            local capacity_key = 'cache:' .. entity_type .. ':' .. entity_id .. ':capacity'
            redis.call('HSET', capacity_key, 'last_updated', ARGV[5] or "0")
            redis.call('EXPIRE', capacity_key, ttl)
        end
        
        -- Log write
        redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'writes', 1)
        
        return {1, "written", "write_through"}
    end
    
    -- =============================================================================
    -- REFRESH-AHEAD PATTERN
    -- =============================================================================
    -- Proactively refresh cache before expiration
    
    local function refresh_ahead(cache_key, entity_type, entity_id, ttl)
        local ttl_remaining = redis.call('TTL', cache_key)
        
        -- Check if refresh needed (less than 20% TTL remaining)
        local refresh_threshold = ttl * 0.2
        
        if ttl_remaining > 0 and ttl_remaining < refresh_threshold then
            -- Mark for refresh
            redis.call('SADD', 'cache:refresh:queue', cache_key)
            redis.call('HSET', 'cache:refresh:metadata', cache_key, 
                entity_type .. ':' .. entity_id .. ':' .. ttl)
            
            -- Log refresh request
            redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'refresh_queued', 1)
            
            return {1, ttl_remaining, "refresh_needed"}
        else
            return {0, ttl_remaining, "refresh_not_needed"}
        end
    end
    
    -- =============================================================================
    -- CACHE INVALIDATION
    -- =============================================================================
    -- Cascade invalidation for related caches
    
    local function invalidate_cascade(cache_key, entity_type, entity_id)
        -- Delete the specific key
        local deleted = redis.call('DEL', cache_key)
        
        -- Also invalidate related keys
        local pattern = 'cache:' .. entity_type .. ':' .. entity_id .. ':*'
        local related_keys = redis.call('KEYS', pattern)
        
        local total_deleted = deleted
        for _, key in ipairs(related_keys) do
            total_deleted = total_deleted + redis.call('DEL', key)
        end
        
        -- For certain entities, invalidate dependent caches
        if entity_type == "venue" then
            -- Invalidate all events at this venue
            local events_pattern = 'cache:event:*:venue:' .. entity_id
            local event_keys = redis.call('KEYS', events_pattern)
            for _, key in ipairs(event_keys) do
                total_deleted = total_deleted + redis.call('DEL', key)
            end
        end
        
        -- Log invalidation
        redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'invalidations', 1)
        
        return {1, total_deleted, "invalidated"}
    end
    
    -- =============================================================================
    -- CACHE WARMING
    -- =============================================================================
    -- Preload cache with frequently accessed data
    
    local function warm_cache(entity_type, priority_list)
        local warmed_count = 0
        local warm_key_prefix = 'cache:warm:' .. entity_type .. ':'
        
        -- Parse priority list (comma-separated IDs)
        local ids = {}
        for id in string.gmatch(priority_list, '([^,]+)') do
            table.insert(ids, id)
        end
        
        -- Mark these as high-priority for warming
        for _, id in ipairs(ids) do
            local warm_key = warm_key_prefix .. id
            redis.call('SETEX', warm_key, 3600, '1')  -- Mark for 1 hour
            
            -- Add to warming queue
            redis.call('ZADD', 'cache:warm:queue', ARGV[5] or 0, entity_type .. ':' .. id)
            warmed_count = warmed_count + 1
        end
        
        -- Log warming
        redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'warmed', warmed_count)
        
        return {1, warmed_count, "warming_queued"}
    end
    
    -- =============================================================================
    -- BATCH OPERATIONS
    -- =============================================================================
    -- Efficient batch get/set operations
    
    local function batch_operation(entity_type, operation, id_list)
        local results = {}
        local processed = 0
        
        -- Parse ID list
        local ids = {}
        for id in string.gmatch(id_list, '([^,]+)') do
            table.insert(ids, id)
        end
        
        if operation == "batch_get" then
            -- Get multiple keys efficiently
            for _, id in ipairs(ids) do
                local key = 'cache:' .. entity_type .. ':' .. id
                local value = redis.call('GET', key)
                if value then
                    table.insert(results, {id, value})
                    redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'hits', 1)
                else
                    table.insert(results, {id, nil})
                    redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'misses', 1)
                end
                processed = processed + 1
            end
            
        elseif operation == "batch_invalidate" then
            -- Invalidate multiple keys
            for _, id in ipairs(ids) do
                local key = 'cache:' .. entity_type .. ':' .. id
                local deleted = redis.call('DEL', key)
                processed = processed + deleted
            end
            redis.call('HINCRBY', 'cache:stats:' .. entity_type, 'invalidations', processed)
        end
        
        return {1, processed, operation, results}
    end
    
    -- =============================================================================
    -- MAIN DISPATCHER
    -- =============================================================================
    -- KEYS[1] = cache key
    -- ARGV[1] = entity type (user, venue, event, ticket)
    -- ARGV[2] = entity id or id list (for batch)
    -- ARGV[3] = ttl in seconds
    -- ARGV[4] = operation (get, write, refresh, invalidate, warm, batch_get, batch_invalidate)
    -- ARGV[5] = data (for write) or timestamp
    
    local cache_key = KEYS[1]
    local entity_type = ARGV[1]
    local entity_id = ARGV[2]
    local ttl = tonumber(ARGV[3] or 3600)
    local operation = ARGV[4] or "get"
    
    if operation == "get" then
        return cache_aside(cache_key, entity_type, entity_id, ttl)
        
    elseif operation == "write" then
        local data = ARGV[5] or "{}"
        return write_through(cache_key, entity_type, entity_id, data, ttl)
        
    elseif operation == "refresh" then
        return refresh_ahead(cache_key, entity_type, entity_id, ttl)
        
    elseif operation == "invalidate" then
        return invalidate_cascade(cache_key, entity_type, entity_id)
        
    elseif operation == "warm" then
        return warm_cache(entity_type, entity_id)  -- entity_id is priority list
        
    elseif operation == "batch_get" or operation == "batch_invalidate" then
        return batch_operation(entity_type, operation, entity_id)  -- entity_id is id list
        
    else
        return {0, nil, "unknown_operation"}
    end
end

local status, result = pcall(safe_execute)
if not status then
    redis.log(redis.LOG_WARNING, "Error in script: " .. tostring(result))
    return redis.error_reply("Script error: " .. tostring(result))
end
return result
