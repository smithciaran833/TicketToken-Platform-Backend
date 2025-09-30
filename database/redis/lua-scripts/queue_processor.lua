-- Enhanced error handling wrapper for: 
-- queue_processor.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Process various queues with retry logic and dead letter handling
    -- 
    -- Features:
    -- 1. Basic queue processing with atomic operations
    -- 2. Retry logic with exponential backoff
    -- 3. Dead letter queue for failed jobs
    -- 4. Priority queue support
    -- 5. Queue monitoring and health checks
    
    -- =============================================================================
    -- BASIC QUEUE PROCESSING
    -- =============================================================================
    -- Process items from queue with error handling
    
    local function process_queue(source_queue, processing_queue, batch_size, processor_id, timestamp)
        local items = {}
        
        for i = 1, batch_size do
            -- Use RPOPLPUSH for atomic move
            local item = redis.call('RPOPLPUSH', source_queue, processing_queue)
            
            if item then
                -- Parse the job data
                local job = cjson.decode(item)
                
                -- Add processing metadata
                job.processor_id = processor_id
                job.processing_started = timestamp
                job.retry_count = job.retry_count or 0
                
                -- Update the item in processing queue
                local updated_item = cjson.encode(job)
                
                -- Store processing info
                redis.call('HSET', 'queue:processing:' .. job.id,
                    'processor', processor_id,
                    'started', timestamp,
                    'queue', source_queue,
                    'data', updated_item
                )
                
                -- Set processing timeout (5 minutes)
                redis.call('EXPIRE', 'queue:processing:' .. job.id, 300)
                
                table.insert(items, {job.id, updated_item})
            else
                -- No more items
                break
            end
        end
        
        -- Update queue statistics
        if #items > 0 then
            redis.call('HINCRBY', 'queue:stats:' .. source_queue, 'processed', #items)
            redis.call('HSET', 'queue:stats:' .. source_queue, 'last_processed', timestamp)
        end
        
        return items
    end
    
    -- =============================================================================
    -- PRIORITY QUEUE PROCESSING
    -- =============================================================================
    -- Process items from priority queue (sorted set)
    
    local function process_priority_queue(source_queue, processing_queue, batch_size, processor_id, timestamp)
        local items = {}
        
        for i = 1, batch_size do
            -- Get highest priority item
            local result = redis.call('ZPOPMAX', source_queue)
            
            if #result > 0 then
                local item = result[1]
                local priority = result[2]
                
                -- Parse the job data
                local job = cjson.decode(item)
                job.priority = priority
                job.processor_id = processor_id
                job.processing_started = timestamp
                job.retry_count = job.retry_count or 0
                
                -- Add to processing queue
                local updated_item = cjson.encode(job)
                redis.call('LPUSH', processing_queue, updated_item)
                
                -- Store processing info
                redis.call('HSET', 'queue:processing:' .. job.id,
                    'processor', processor_id,
                    'started', timestamp,
                    'queue', source_queue,
                    'priority', priority,
                    'data', updated_item
                )
                
                -- Set processing timeout
                redis.call('EXPIRE', 'queue:processing:' .. job.id, 300)
                
                table.insert(items, {job.id, updated_item, priority})
            else
                break
            end
        end
        
        -- Update statistics
        if #items > 0 then
            redis.call('HINCRBY', 'queue:stats:' .. source_queue, 'processed', #items)
            redis.call('HSET', 'queue:stats:' .. source_queue, 'last_processed', timestamp)
        end
        
        return items
    end
    
    -- =============================================================================
    -- JOB COMPLETION
    -- =============================================================================
    -- Mark job as completed and remove from processing
    
    local function complete_job(job_id, processing_queue)
        -- Get job data
        local job_data = redis.call('HGET', 'queue:processing:' .. job_id, 'data')
        
        if not job_data then
            return {0, "Job not found"}
        end
        
        -- Parse job to get timing info
        local job = cjson.decode(job_data)
        local started = tonumber(redis.call('HGET', 'queue:processing:' .. job_id, 'started'))
        local duration = tonumber(ARGV[3]) - started
        
        -- Remove from processing queue
        local removed = redis.call('LREM', processing_queue, 1, job_data)
        
        -- Clean up processing metadata
        redis.call('DEL', 'queue:processing:' .. job_id)
        
        -- Update stats
        redis.call('HINCRBY', 'queue:stats:completed', 'total', 1)
        redis.call('HSET', 'queue:stats:completed', 'last_completed', ARGV[3])
        redis.call('HINCRBY', 'queue:stats:completed', 'total_duration', duration)
        
        -- Track average processing time
        local total_completed = redis.call('HGET', 'queue:stats:completed', 'total')
        local total_duration = redis.call('HGET', 'queue:stats:completed', 'total_duration')
        local avg_duration = total_duration / total_completed
        redis.call('HSET', 'queue:stats:completed', 'avg_duration', avg_duration)
        
        return {1, "Job completed", duration}
    end
    
    -- =============================================================================
    -- RETRY MECHANISM
    -- =============================================================================
    -- Retry failed jobs with exponential backoff
    
    local function retry_job(job_id, processing_queue, error_message, max_retries)
        -- Get job data
        local job_data = redis.call('HGET', 'queue:processing:' .. job_id, 'data')
        local source_queue = redis.call('HGET', 'queue:processing:' .. job_id, 'queue')
        
        if not job_data then
            return {0, "Job not found"}
        end
        
        -- Parse job
        local job = cjson.decode(job_data)
        job.retry_count = job.retry_count + 1
        job.last_error = error_message
        job.last_retry_at = ARGV[3]
        
        -- Remove from processing queue
        redis.call('LREM', processing_queue, 1, job_data)
        
        -- Check retry limit
        if job.retry_count > max_retries then
            -- Move to dead letter queue
            local dead_letter_queue = source_queue .. ':dead'
            job.moved_to_dlq = ARGV[3]
            local dlq_item = cjson.encode(job)
            
            redis.call('LPUSH', dead_letter_queue, dlq_item)
            redis.call('HINCRBY', 'queue:stats:' .. dead_letter_queue, 'total', 1)
            
            -- Clean up processing metadata
            redis.call('DEL', 'queue:processing:' .. job_id)
            
            return {0, "Moved to dead letter queue", job.retry_count}
        else
            -- Calculate backoff delay (exponential: 2^retry_count seconds)
            local delay = math.pow(2, job.retry_count)
            
            -- Add to delayed queue
            local delayed_queue = source_queue .. ':delayed'
            local retry_at = tonumber(ARGV[3]) + delay
            
            redis.call('ZADD', delayed_queue, retry_at, cjson.encode(job))
            
            -- Clean up processing metadata
            redis.call('DEL', 'queue:processing:' .. job_id)
            
            -- Update retry stats
            redis.call('HINCRBY', 'queue:stats:retries', 'total', 1)
            redis.call('HINCRBY', 'queue:stats:retries', 'retry_' .. job.retry_count, 1)
            
            return {1, "Scheduled for retry", job.retry_count, retry_at}
        end
    end
    
    -- =============================================================================
    -- PROCESS DELAYED JOBS
    -- =============================================================================
    -- Move jobs from delayed queue back to main queue when ready
    
    local function process_delayed(source_queue, current_time)
        local delayed_queue = source_queue .. ':delayed'
        local moved_count = 0
        
        -- Get jobs ready to be processed
        local ready_jobs = redis.call('ZRANGEBYSCORE', delayed_queue, '-inf', current_time)
        
        for _, job_data in ipairs(ready_jobs) do
            -- Move to main queue
            redis.call('LPUSH', source_queue, job_data)
            moved_count = moved_count + 1
        end
        
        -- Remove processed jobs from delayed queue
        if moved_count > 0 then
            redis.call('ZREMRANGEBYSCORE', delayed_queue, '-inf', current_time)
            redis.call('HINCRBY', 'queue:stats:' .. source_queue, 'requeued', moved_count)
        end
        
        return moved_count
    end
    
    -- =============================================================================
    -- QUEUE HEALTH CHECK
    -- =============================================================================
    -- Monitor queue health and stuck jobs
    
    local function health_check(queue_prefix, timeout_threshold)
        local health = {
            healthy = true,
            issues = {},
            metrics = {}
        }
        
        -- Check main queue length
        local pending_queue = queue_prefix .. ':pending'
        local pending_length = redis.call('LLEN', pending_queue)
        health.metrics.pending = pending_length
        
        -- Check processing queue
        local processing_queue = queue_prefix .. ':processing'
        local processing_length = redis.call('LLEN', processing_queue)
        health.metrics.processing = processing_length
        
        -- Check delayed queue
        local delayed_queue = queue_prefix .. ':delayed'
        local delayed_count = redis.call('ZCARD', delayed_queue)
        health.metrics.delayed = delayed_count
        
        -- Check dead letter queue
        local dlq = queue_prefix .. ':dead'
        local dlq_length = redis.call('LLEN', dlq)
        health.metrics.dead_letter = dlq_length
        
        -- Check for stuck jobs
        local processing_keys = redis.call('KEYS', 'queue:processing:*')
        local stuck_count = 0
        local current_time = tonumber(ARGV[3])
        
        for _, key in ipairs(processing_keys) do
            local started = tonumber(redis.call('HGET', key, 'started') or 0)
            if current_time - started > timeout_threshold then
                stuck_count = stuck_count + 1
                local job_id = string.match(key, 'queue:processing:(.+)')
                table.insert(health.issues, {
                    type = 'stuck_job',
                    job_id = job_id,
                    duration = current_time - started
                })
            end
        end
        
        health.metrics.stuck_jobs = stuck_count
        
        -- Determine overall health
        if pending_length > 1000 then
            health.healthy = false
            table.insert(health.issues, {type = 'high_pending', count = pending_length})
        end
        
        if stuck_count > 0 then
            health.healthy = false
        end
        
        if dlq_length > 100 then
            health.healthy = false
            table.insert(health.issues, {type = 'high_dlq', count = dlq_length})
        end
        
        return health
    end
    
    -- =============================================================================
    -- MAIN DISPATCHER
    -- =============================================================================
    -- KEYS[1] = source queue
    -- KEYS[2] = processing queue
    -- ARGV[1] = batch size or job_id (for complete/retry)
    -- ARGV[2] = processor id or error message (for retry)
    -- ARGV[3] = current timestamp
    -- ARGV[4] = operation (process, process_priority, complete, retry, delayed, health)
    -- ARGV[5] = max retries (default 3) or timeout threshold (for health)
    
    local operation = ARGV[4] or "process"
    local timestamp = tonumber(ARGV[3])
    
    if operation == "process" then
        -- Process batch from regular queue
        local batch_size = tonumber(ARGV[1] or 1)
        local processor_id = ARGV[2]
        local items = process_queue(KEYS[1], KEYS[2], batch_size, processor_id, timestamp)
        return {#items, items}
    
    elseif operation == "process_priority" then
        -- Process batch from priority queue
        local batch_size = tonumber(ARGV[1] or 1)
        local processor_id = ARGV[2]
        local items = process_priority_queue(KEYS[1], KEYS[2], batch_size, processor_id, timestamp)
        return {#items, items}
    
    elseif operation == "complete" then
        -- Mark job as completed
        local job_id = ARGV[1]
        return complete_job(job_id, KEYS[2])
    
    elseif operation == "retry" then
        -- Retry failed job
        local job_id = ARGV[1]
        local error_message = ARGV[2]
        local max_retries = tonumber(ARGV[5] or 3)
        return retry_job(job_id, KEYS[2], error_message, max_retries)
    
    elseif operation == "delayed" then
        -- Process delayed jobs
        local moved = process_delayed(KEYS[1], timestamp)
        return {moved, "Moved " .. moved .. " jobs to queue"}
    
    elseif operation == "health" then
        -- Health check
        local queue_prefix = ARGV[1]
        local timeout_threshold = tonumber(ARGV[5] or 300)  -- 5 minutes default
        return health_check(queue_prefix, timeout_threshold)
    
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
