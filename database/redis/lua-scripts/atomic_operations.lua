-- Enhanced error handling wrapper for: 
-- atomic_operations.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Ensure atomic operations for critical ticket operations
    -- 
    -- This script handles:
    -- 1. Atomic ticket purchase with inventory decrement
    -- 2. Atomic seat selection with race condition prevention  
    -- 3. Atomic fund transfers with audit trail
    -- 4. Rollback capability for failed multi-step transactions
    
    -- =============================================================================
    -- ATOMIC TICKET PURCHASE
    -- =============================================================================
    -- Atomically decrements available tickets and creates purchase record
    -- KEYS[1] = event:tickets:available:{event_id}
    -- KEYS[2] = purchase:pending:{purchase_id}
    -- ARGV[1] = number of tickets requested
    -- ARGV[2] = user_id
    -- ARGV[3] = purchase_id
    -- ARGV[4] = timestamp
    
    local function atomic_ticket_purchase()
        local available_key = KEYS[1]
        local purchase_key = KEYS[2]
        local requested = tonumber(ARGV[1])
        local user_id = ARGV[2]
        local purchase_id = ARGV[3]
        local timestamp = ARGV[4]
        
        -- Get current availability
        local available = tonumber(redis.call('GET', available_key) or 0)
        
        -- Check if enough tickets available
        if available < requested then
            return {0, "Insufficient tickets. Available: " .. available}
        end
        
        -- Atomically decrement
        local new_available = redis.call('DECRBY', available_key, requested)
        
        -- Create purchase record
        redis.call('HSET', purchase_key,
            'user_id', user_id,
            'tickets', requested,
            'timestamp', timestamp,
            'status', 'pending'
        )
        
        -- Set 5-minute expiry for pending purchase
        redis.call('EXPIRE', purchase_key, 300)
        
        return {1, new_available}
    end
    
    -- =============================================================================
    -- ATOMIC SEAT SELECTION
    -- =============================================================================
    -- Atomically reserves specific seats to prevent double-booking
    -- KEYS[1] = event:seats:{event_id}:{section}
    -- KEYS[2] = seat:reservation:{reservation_id}
    -- ARGV[1] = comma-separated list of seat numbers
    -- ARGV[2] = user_id
    -- ARGV[3] = reservation_id
    -- ARGV[4] = timestamp
    
    local function atomic_seat_selection()
        local seats_key = KEYS[1]
        local reservation_key = KEYS[2]
        local seats_requested = ARGV[1]
        local user_id = ARGV[2]
        local reservation_id = ARGV[3]
        local timestamp = ARGV[4]
        
        -- Split seats into array
        local seats = {}
        for seat in string.gmatch(seats_requested, '([^,]+)') do
            table.insert(seats, seat)
        end
        
        -- Check if all seats are available
        for _, seat in ipairs(seats) do
            local status = redis.call('HGET', seats_key, seat)
            if status and status ~= 'available' then
                return {0, "Seat " .. seat .. " is not available"}
            end
        end
        
        -- Reserve all seats atomically
        for _, seat in ipairs(seats) do
            redis.call('HSET', seats_key, seat, 'reserved:' .. reservation_id)
        end
        
        -- Create reservation record
        redis.call('HSET', reservation_key,
            'user_id', user_id,
            'seats', seats_requested,
            'timestamp', timestamp,
            'status', 'reserved'
        )
        
        -- Set 10-minute expiry for reservation
        redis.call('EXPIRE', reservation_key, 600)
        
        return {1, #seats}
    end
    
    -- =============================================================================
    -- ATOMIC FUND TRANSFER
    -- =============================================================================
    -- Atomically transfers funds between accounts (for escrow, refunds, payouts)
    -- KEYS[1] = wallet:balance:{from_wallet}
    -- KEYS[2] = wallet:balance:{to_wallet}
    -- KEYS[3] = transfer:log:{transfer_id}
    -- ARGV[1] = amount to transfer (in cents)
    -- ARGV[2] = transfer_id
    -- ARGV[3] = transfer_type (purchase, refund, payout)
    -- ARGV[4] = timestamp
    
    local function atomic_fund_transfer()
        local from_wallet = KEYS[1]
        local to_wallet = KEYS[2]
        local transfer_log = KEYS[3]
        local amount = tonumber(ARGV[1])
        local transfer_id = ARGV[2]
        local transfer_type = ARGV[3]
        local timestamp = ARGV[4]
        
        -- Validate amount
        if amount <= 0 then
            return {0, "Invalid transfer amount"}
        end
        
        -- Get current balance
        local from_balance = tonumber(redis.call('GET', from_wallet) or 0)
        
        -- Check sufficient funds
        if from_balance < amount then
            return {0, "Insufficient funds. Balance: " .. from_balance}
        end
        
        -- Perform atomic transfer
        local new_from_balance = redis.call('DECRBY', from_wallet, amount)
        local new_to_balance = redis.call('INCRBY', to_wallet, amount)
        
        -- Log the transfer
        redis.call('HSET', transfer_log,
            'transfer_id', transfer_id,
            'from', from_wallet,
            'to', to_wallet,
            'amount', amount,
            'type', transfer_type,
            'timestamp', timestamp,
            'from_balance_after', new_from_balance,
            'to_balance_after', new_to_balance
        )
        
        -- Persist transfer log (no expiry for financial records)
        
        return {1, {new_from_balance, new_to_balance}}
    end
    
    -- =============================================================================
    -- ROLLBACK PURCHASE
    -- =============================================================================
    -- Rolls back a failed purchase by releasing tickets and seats
    -- KEYS[1] = event:tickets:available:{event_id}
    -- KEYS[2] = event:seats:{event_id}:{section}
    -- KEYS[3] = purchase:pending:{purchase_id}
    -- ARGV[1] = number of tickets to release
    -- ARGV[2] = comma-separated list of seats to release
    -- ARGV[3] = purchase_id
    
    local function rollback_purchase()
        local tickets_key = KEYS[1]
        local seats_key = KEYS[2]
        local purchase_key = KEYS[3]
        local tickets_to_release = tonumber(ARGV[1])
        local seats_to_release = ARGV[2]
        local purchase_id = ARGV[3]
        
        -- Release tickets back to pool
        if tickets_to_release and tickets_to_release > 0 then
            redis.call('INCRBY', tickets_key, tickets_to_release)
        end
        
        -- Release seats
        if seats_to_release and seats_to_release ~= "" then
            for seat in string.gmatch(seats_to_release, '([^,]+)') do
                local current_status = redis.call('HGET', seats_key, seat)
                if current_status == 'reserved:' .. purchase_id then
                    redis.call('HSET', seats_key, seat, 'available')
                end
            end
        end
        
        -- Mark purchase as rolled back
        redis.call('HSET', purchase_key, 'status', 'rolled_back')
        redis.call('EXPIRE', purchase_key, 86400) -- Keep for 24 hours for audit
        
        return {1, "Rollback completed"}
    end
    
    -- =============================================================================
    -- OPERATION DISPATCHER
    -- =============================================================================
    -- Determine which operation to execute based on ARGV[5]
    local operation = ARGV[5] or "purchase"
    
    if operation == "purchase" then
        return atomic_ticket_purchase()
    elseif operation == "seats" then
        return atomic_seat_selection()
    elseif operation == "transfer" then
        return atomic_fund_transfer()
    elseif operation == "rollback" then
        return rollback_purchase()
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
