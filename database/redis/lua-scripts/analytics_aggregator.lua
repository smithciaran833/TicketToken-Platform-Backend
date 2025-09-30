-- Enhanced error handling wrapper for: 
-- analytics_aggregator.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Aggregate analytics data for reporting and insights
    -- 
    -- Features:
    -- 1. Basic metric aggregation (revenue, attendance, sales, performance)
    -- 2. Rollup from hourly to daily, daily to weekly, etc.
    -- 3. Time-based queries and range searches
    -- 4. Period comparisons (vs last week, month, year)
    -- 5. Trend analysis and moving averages
    
    -- =============================================================================
    -- MOVING AVERAGE
    -- =============================================================================
    -- Update moving average for trend analysis (defined first to avoid forward reference)
    
    local function update_moving_average(base_key, metric_type, value, period_key)
        local ma_key = base_key .. ":moving_avg"
        
        -- Add to sorted set with period_key as score (convert to number if possible)
        local score = tonumber(period_key) or 0
        redis.call('ZADD', ma_key, score, value)
        
        -- Keep only last 30 entries
        local count = redis.call('ZCARD', ma_key)
        if count > 30 then
            redis.call('ZREMRANGEBYRANK', ma_key, 0, count - 31)
        end
        
        -- Calculate average
        local values = redis.call('ZRANGE', ma_key, 0, -1)
        local sum = 0
        for _, v in ipairs(values) do
            sum = sum + tonumber(v)
        end
        
        if #values > 0 then
            local avg = sum / #values
            redis.call('SET', ma_key .. ":value", avg)
            redis.call('EXPIRE', ma_key .. ":value", 86400)
        end
    end
    
    -- =============================================================================
    -- BASIC METRIC AGGREGATION
    -- =============================================================================
    -- Aggregate metrics for a specific entity and time period
    
    local function aggregate_metric(agg_key, metric_type, entity_id, value, timestamp, period, period_key)
        -- If no period_key provided, use timestamp as-is
        if not period_key or period_key == "" then
            period_key = tostring(timestamp)
        end
        
        -- Aggregate the metric
        local full_key = agg_key .. ":" .. period .. ":" .. period_key
        
        -- Increment counters based on metric type
        if metric_type == "revenue" then
            redis.call('HINCRBYFLOAT', full_key, 'total', value)
            redis.call('HINCRBY', full_key, 'transactions', 1)
            
            -- Update min/max
            local current_min = redis.call('HGET', full_key, 'min')
            local current_max = redis.call('HGET', full_key, 'max')
            
            if not current_min or tonumber(current_min) > value then
                redis.call('HSET', full_key, 'min', value)
            end
            
            if not current_max or tonumber(current_max) < value then
                redis.call('HSET', full_key, 'max', value)
            end
            
        elseif metric_type == "attendance" then
            redis.call('HINCRBY', full_key, 'total', value)
            redis.call('HINCRBY', full_key, 'events', 1)
            
        elseif metric_type == "sales" then
            redis.call('HINCRBY', full_key, 'tickets_sold', value)
            redis.call('HINCRBY', full_key, 'sales_count', 1)
            
        elseif metric_type == "performance" then
            redis.call('HINCRBYFLOAT', full_key, 'response_time_total', value)
            redis.call('HINCRBY', full_key, 'request_count', 1)
            
            -- Calculate average
            local total = tonumber(redis.call('HGET', full_key, 'response_time_total'))
            local count = tonumber(redis.call('HGET', full_key, 'request_count'))
            if count > 0 then
                redis.call('HSET', full_key, 'average', total / count)
            end
        end
        
        -- Update metadata
        redis.call('HSET', full_key, 'last_updated', timestamp)
        redis.call('HSET', full_key, 'entity_id', entity_id)
        redis.call('HSET', full_key, 'metric_type', metric_type)
        
        -- Set expiration based on period
        local ttl = 86400 * 30  -- 30 days default
        if period == "hourly" then
            ttl = 86400 * 7      -- 7 days for hourly
        elseif period == "monthly" then
            ttl = 86400 * 365    -- 1 year for monthly
        end
        redis.call('EXPIRE', full_key, ttl)
        
        -- Update summary statistics
        local summary_key = 'analytics:summary:' .. metric_type .. ':' .. entity_id
        redis.call('HINCRBY', summary_key, 'total_data_points', 1)
        redis.call('HSET', summary_key, 'last_aggregation', timestamp)
        
        -- Update moving average
        update_moving_average(agg_key, metric_type, value, period_key)
        
        return full_key
    end
    
    -- =============================================================================
    -- ROLLUP AGGREGATION
    -- =============================================================================
    -- Roll up data from smaller to larger time periods
    
    local function rollup_data(source_pattern, target_key, metric_type)
        -- Get all keys matching the source pattern
        local source_keys = redis.call('KEYS', source_pattern)
        
        if #source_keys == 0 then
            return {0, "No data to rollup"}
        end
        
        local total = 0
        local count = 0
        local min_val = nil
        local max_val = nil
        
        -- Aggregate data from all source keys
        for _, key in ipairs(source_keys) do
            if metric_type == "revenue" then
                local key_total = tonumber(redis.call('HGET', key, 'total') or 0)
                local key_count = tonumber(redis.call('HGET', key, 'transactions') or 0)
                local key_min = tonumber(redis.call('HGET', key, 'min'))
                local key_max = tonumber(redis.call('HGET', key, 'max'))
                
                total = total + key_total
                count = count + key_count
                
                if key_min and (not min_val or key_min < min_val) then
                    min_val = key_min
                end
                
                if key_max and (not max_val or key_max > max_val) then
                    max_val = key_max
                end
                
            elseif metric_type == "attendance" then
                local key_total = tonumber(redis.call('HGET', key, 'total') or 0)
                local key_events = tonumber(redis.call('HGET', key, 'events') or 0)
                
                total = total + key_total
                count = count + key_events
                
            elseif metric_type == "performance" then
                local key_total = tonumber(redis.call('HGET', key, 'response_time_total') or 0)
                local key_count = tonumber(redis.call('HGET', key, 'request_count') or 0)
                
                total = total + key_total
                count = count + key_count
            end
        end
        
        -- Store rolled up data
        if metric_type == "revenue" then
            redis.call('HSET', target_key, 'total', total)
            redis.call('HSET', target_key, 'transactions', count)
            if min_val then redis.call('HSET', target_key, 'min', min_val) end
            if max_val then redis.call('HSET', target_key, 'max', max_val) end
            
        elseif metric_type == "attendance" then
            redis.call('HSET', target_key, 'total', total)
            redis.call('HSET', target_key, 'events', count)
            
        elseif metric_type == "performance" then
            redis.call('HSET', target_key, 'response_time_total', total)
            redis.call('HSET', target_key, 'request_count', count)
            if count > 0 then
                redis.call('HSET', target_key, 'average', total / count)
            end
        end
        
        redis.call('HSET', target_key, 'metric_type', metric_type)
        redis.call('HSET', target_key, 'rollup_from', source_pattern)
        redis.call('HSET', target_key, 'rollup_at', ARGV[6] or "0")
        redis.call('HSET', target_key, 'source_keys', #source_keys)
        
        -- Set longer expiration for rollups
        redis.call('EXPIRE', target_key, 86400 * 90)  -- 90 days
        
        return {1, "Rolled up " .. #source_keys .. " keys", total, count}
    end
    
    -- =============================================================================
    -- PERIOD COMPARISON
    -- =============================================================================
    -- Compare current period with previous period
    
    local function compare_periods(current_key, previous_key, metric_type)
        local current_total = 0
        local previous_total = 0
        
        if metric_type == "revenue" then
            current_total = tonumber(redis.call('HGET', current_key, 'total') or 0)
            previous_total = tonumber(redis.call('HGET', previous_key, 'total') or 0)
        elseif metric_type == "attendance" then
            current_total = tonumber(redis.call('HGET', current_key, 'total') or 0)
            previous_total = tonumber(redis.call('HGET', previous_key, 'total') or 0)
        elseif metric_type == "performance" then
            current_total = tonumber(redis.call('HGET', current_key, 'average') or 0)
            previous_total = tonumber(redis.call('HGET', previous_key, 'average') or 0)
        end
        
        local change = 0
        local percent_change = 0
        
        if previous_total > 0 then
            change = current_total - previous_total
            percent_change = (change / previous_total) * 100
        end
        
        -- Store comparison results in Redis instead of returning complex table
        local comparison_key = current_key .. ":comparison"
        redis.call('HSET', comparison_key, 'current', current_total)
        redis.call('HSET', comparison_key, 'previous', previous_total)
        redis.call('HSET', comparison_key, 'change', change)
        redis.call('HSET', comparison_key, 'percent_change', percent_change)
        redis.call('HSET', comparison_key, 'trend', change > 0 and "up" or (change < 0 and "down" or "flat"))
        redis.call('EXPIRE', comparison_key, 3600)
        
        return {1, "Comparison stored", percent_change}
    end
    
    -- =============================================================================
    -- MAIN DISPATCHER
    -- =============================================================================
    -- KEYS[1] = aggregation key
    -- ARGV[1] = operation (aggregate, rollup, query, compare)
    -- ARGV[2] = metric type or source pattern
    -- ARGV[3] = entity id or target key
    -- ARGV[4] = value or current period key
    -- ARGV[5] = timestamp or previous period key
    -- ARGV[6] = period or timestamp
    -- ARGV[7] = period_key
    
    local operation = ARGV[1] or "aggregate"
    
    if operation == "aggregate" then
        -- Basic aggregation
        local agg_key = KEYS[1]
        local metric_type = ARGV[2]
        local entity_id = ARGV[3]
        local value = tonumber(ARGV[4])
        local timestamp = tonumber(ARGV[5])
        local period = ARGV[6] or "daily"
        local period_key = ARGV[7]
        
        local full_key = aggregate_metric(agg_key, metric_type, entity_id, value, timestamp, period, period_key)
        
        return {1, "Aggregated", period_key, full_key}
    
    elseif operation == "rollup" then
        -- Rollup data from one period to another
        local source_pattern = ARGV[2]
        local target_key = ARGV[3]
        local metric_type = ARGV[4] or "revenue"
        
        return rollup_data(source_pattern, target_key, metric_type)
    
    elseif operation == "compare" then
        -- Compare periods
        local current_key = ARGV[2]
        local previous_key = ARGV[3]
        local metric_type = ARGV[4] or "revenue"
        
        return compare_periods(current_key, previous_key, metric_type)
    
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
