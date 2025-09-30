-- Enhanced error handling wrapper for: 
-- blockchain_cache.lua

local function safe_execute()
    -- Original script content will be inserted here
    -- Purpose: Cache blockchain data for NFT tickets and transactions
    -- 
    -- Features:
    -- 1. Transaction caching with confirmation tracking
    -- 2. NFT metadata caching with event indexing
    -- 3. Gas price caching with historical tracking
    -- 4. Block information caching
    -- 5. Smart contract ABI caching
    
    -- =============================================================================
    -- TRANSACTION CACHE
    -- =============================================================================
    -- Cache blockchain transaction data
    
    local function cache_transaction(tx_hash, tx_data, timestamp, ttl)
        local tx_key = "blockchain:tx:" .. tx_hash
        
        -- Parse transaction data
        local success, parsed_data = pcall(cjson.decode, tx_data)
        if not success then
            return {0, "Invalid JSON data"}
        end
        
        -- Store transaction details
        redis.call('HSET', tx_key,
            'hash', tx_hash,
            'data', tx_data,
            'cached_at', timestamp,
            'block_number', tostring(parsed_data.blockNumber or 0),
            'confirmations', tostring(parsed_data.confirmations or 0),
            'status', parsed_data.status or "pending"
        )
        
        -- Set expiration based on confirmation status
        if parsed_data.confirmations and tonumber(parsed_data.confirmations) >= 12 then
            -- Confirmed transactions cached longer
            redis.call('EXPIRE', tx_key, 86400)  -- 24 hours
        else
            -- Pending/unconfirmed cached shorter
            redis.call('EXPIRE', tx_key, ttl)
        end
        
        -- Update transaction index
        redis.call('ZADD', 'blockchain:tx:index', timestamp, tx_hash)
        
        -- Update stats
        redis.call('HINCRBY', 'blockchain:stats', 'transactions_cached', 1)
        
        return {1, "Transaction cached", tx_hash}
    end
    
    local function get_transaction(tx_hash, timestamp)
        local tx_key = "blockchain:tx:" .. tx_hash
        local exists = redis.call('EXISTS', tx_key)
        
        if exists == 1 then
            -- Update access stats
            redis.call('HINCRBY', 'blockchain:stats', 'cache_hits', 1)
            redis.call('HSET', tx_key, 'last_accessed', timestamp)
            
            -- Get all transaction data
            local tx_info = redis.call('HGETALL', tx_key)
            
            return {1, tx_info}
        else
            redis.call('HINCRBY', 'blockchain:stats', 'cache_misses', 1)
            return {0, "Transaction not in cache"}
        end
    end
    
    -- =============================================================================
    -- NFT METADATA CACHE
    -- =============================================================================
    -- Cache NFT ticket metadata
    
    local function cache_nft_metadata(token_id, metadata, timestamp)
        local nft_key = "blockchain:nft:" .. token_id
        
        -- Parse metadata
        local success, parsed_meta = pcall(cjson.decode, metadata)
        if not success then
            return {0, "Invalid metadata JSON"}
        end
        
        -- Store NFT metadata
        redis.call('HSET', nft_key,
            'token_id', token_id,
            'metadata', metadata,
            'cached_at', timestamp,
            'event_id', parsed_meta.event_id or "",
            'seat_number', parsed_meta.seat_number or "",
            'ticket_type', parsed_meta.ticket_type or "general",
            'transferable', tostring(parsed_meta.transferable or true)
        )
        
        -- Cache for 7 days (metadata rarely changes)
        redis.call('EXPIRE', nft_key, 604800)
        
        -- Index by event
        if parsed_meta.event_id then
            redis.call('SADD', 'blockchain:nft:event:' .. parsed_meta.event_id, token_id)
            redis.call('EXPIRE', 'blockchain:nft:event:' .. parsed_meta.event_id, 604800)
        end
        
        redis.call('HINCRBY', 'blockchain:stats', 'nft_metadata_cached', 1)
        
        return {1, "NFT metadata cached", token_id}
    end
    
    -- =============================================================================
    -- GAS PRICE CACHE
    -- =============================================================================
    -- Cache current gas prices for transaction estimation
    
    local function cache_gas_prices(gas_data, timestamp)
        local gas_key = "blockchain:gas:current"
        
        -- Parse gas data
        local success, parsed_gas = pcall(cjson.decode, gas_data)
        if not success then
            return {0, "Invalid gas data JSON"}
        end
        
        -- Store gas prices
        redis.call('HSET', gas_key,
            'fast', tostring(parsed_gas.fast or 0),
            'standard', tostring(parsed_gas.standard or 0),
            'slow', tostring(parsed_gas.slow or 0),
            'updated_at', timestamp
        )
        
        -- Short TTL for gas prices (2 minutes)
        redis.call('EXPIRE', gas_key, 120)
        
        -- Keep historical gas prices (use timestamp as key instead of date)
        local history_key = "blockchain:gas:history"
        redis.call('ZADD', history_key, timestamp, gas_data)
        
        -- Trim old entries (keep last 1000)
        local count = redis.call('ZCARD', history_key)
        if count > 1000 then
            redis.call('ZREMRANGEBYRANK', history_key, 0, count - 1001)
        end
        
        redis.call('HINCRBY', 'blockchain:stats', 'gas_prices_cached', 1)
        
        return {1, "Gas prices cached"}
    end
    
    -- =============================================================================
    -- BLOCK CACHE
    -- =============================================================================
    -- Cache block information
    
    local function cache_block(block_number, block_data, timestamp)
        local block_key = "blockchain:block:" .. block_number
        
        -- Parse block data
        local success, parsed_block = pcall(cjson.decode, block_data)
        if not success then
            return {0, "Invalid block data JSON"}
        end
        
        -- Store block information
        redis.call('HSET', block_key,
            'number', block_number,
            'hash', parsed_block.hash or "",
            'timestamp', parsed_block.timestamp or 0,
            'transaction_count', tostring(parsed_block.transactions and #parsed_block.transactions or 0),
            'cached_at', timestamp,
            'data', block_data
        )
        
        -- Cache for 1 hour (blocks are immutable)
        redis.call('EXPIRE', block_key, 3600)
        
        -- Update block index
        redis.call('ZADD', 'blockchain:block:index', tonumber(block_number), block_number)
        
        redis.call('HINCRBY', 'blockchain:stats', 'blocks_cached', 1)
        
        return {1, "Block cached", block_number}
    end
    
    -- =============================================================================
    -- CONTRACT ABI CACHE
    -- =============================================================================
    -- Cache smart contract ABIs
    
    local function cache_contract_abi(contract_address, abi_data, timestamp)
        local abi_key = "blockchain:abi:" .. contract_address
        
        -- Store ABI data
        redis.call('HSET', abi_key,
            'address', contract_address,
            'abi', abi_data,
            'cached_at', timestamp
        )
        
        -- ABIs rarely change, cache for 30 days
        redis.call('EXPIRE', abi_key, 2592000)
        
        redis.call('HINCRBY', 'blockchain:stats', 'abi_cached', 1)
        
        return {1, "Contract ABI cached", contract_address}
    end
    
    -- =============================================================================
    -- MAIN DISPATCHER
    -- =============================================================================
    -- KEYS[1] = dummy key (not used, but required)
    -- ARGV[1] = operation (cache_tx, get_tx, cache_nft, get_nft, cache_gas, get_gas, cache_block, get_block, cache_abi, get_abi)
    -- ARGV[2] = identifier (tx_hash, token_id, block_number, contract_address)
    -- ARGV[3] = data (JSON)
    -- ARGV[4] = timestamp
    -- ARGV[5] = ttl (seconds, optional)
    
    local operation = ARGV[1]
    local identifier = ARGV[2]
    local data = ARGV[3]
    local timestamp = tonumber(ARGV[4])
    local ttl = tonumber(ARGV[5] or 3600)
    
    if operation == "cache_tx" then
        return cache_transaction(identifier, data, timestamp, ttl)
        
    elseif operation == "get_tx" then
        return get_transaction(identifier, timestamp)
        
    elseif operation == "cache_nft" then
        return cache_nft_metadata(identifier, data, timestamp)
        
    elseif operation == "get_nft" then
        local nft_key = "blockchain:nft:" .. identifier
        local exists = redis.call('EXISTS', nft_key)
        
        if exists == 1 then
            local nft_data = redis.call('HGETALL', nft_key)
            redis.call('HINCRBY', 'blockchain:stats', 'cache_hits', 1)
            return {1, nft_data}
        else
            redis.call('HINCRBY', 'blockchain:stats', 'cache_misses', 1)
            return {0, "NFT metadata not in cache"}
        end
        
    elseif operation == "cache_gas" then
        return cache_gas_prices(data, timestamp)
        
    elseif operation == "get_gas" then
        local gas_data = redis.call('HGETALL', 'blockchain:gas:current')
        if #gas_data > 0 then
            redis.call('HINCRBY', 'blockchain:stats', 'cache_hits', 1)
            return {1, gas_data}
        else
            redis.call('HINCRBY', 'blockchain:stats', 'cache_misses', 1)
            return {0, "Gas prices not in cache"}
        end
        
    elseif operation == "cache_block" then
        return cache_block(identifier, data, timestamp)
        
    elseif operation == "get_block" then
        local block_key = "blockchain:block:" .. identifier
        local exists = redis.call('EXISTS', block_key)
        
        if exists == 1 then
            local block_data = redis.call('HGETALL', block_key)
            redis.call('HINCRBY', 'blockchain:stats', 'cache_hits', 1)
            return {1, block_data}
        else
            redis.call('HINCRBY', 'blockchain:stats', 'cache_misses', 1)
            return {0, "Block not in cache"}
        end
        
    elseif operation == "cache_abi" then
        return cache_contract_abi(identifier, data, timestamp)
        
    elseif operation == "get_abi" then
        local abi_key = "blockchain:abi:" .. identifier
        local abi_data = redis.call('HGET', abi_key, 'abi')
        
        if abi_data then
            redis.call('HINCRBY', 'blockchain:stats', 'cache_hits', 1)
            return {1, abi_data}
        else
            redis.call('HINCRBY', 'blockchain:stats', 'cache_misses', 1)
            return {0, "Contract ABI not in cache"}
        end
        
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
