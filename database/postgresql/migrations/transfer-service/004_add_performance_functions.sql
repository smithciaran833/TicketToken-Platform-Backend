-- Migration: 004_add_performance_functions.sql
-- Description: Add performance optimization functions and procedures
-- Phase 3: Database & Schema Improvements

-- Function to expire old pending transfers
CREATE OR REPLACE FUNCTION expire_pending_transfers()
RETURNS TABLE(expired_count BIGINT) AS $$
DECLARE
    count_expired BIGINT;
BEGIN
    UPDATE ticket_transfers
    SET 
        status = 'EXPIRED',
        updated_at = NOW()
    WHERE 
        status = 'PENDING'
        AND expires_at < NOW();
    
    GET DIAGNOSTICS count_expired = ROW_COUNT;
    
    RETURN QUERY SELECT count_expired;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_pending_transfers() 
IS 'Expires all pending transfers that have passed their expiration date';

-- Function to get transfer statistics for a user
CREATE OR REPLACE FUNCTION get_user_transfer_stats(user_uuid UUID)
RETURNS TABLE(
    total_sent BIGINT,
    total_received BIGINT,
    pending_sent BIGINT,
    pending_received BIGINT,
    completed_sent BIGINT,
    completed_received BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE from_user_id = user_uuid) AS total_sent,
        COUNT(*) FILTER (WHERE to_user_id = user_uuid) AS total_received,
        COUNT(*) FILTER (WHERE from_user_id = user_uuid AND status = 'PENDING') AS pending_sent,
        COUNT(*) FILTER (WHERE to_user_id = user_uuid AND status = 'PENDING') AS pending_received,
        COUNT(*) FILTER (WHERE from_user_id = user_uuid AND status = 'COMPLETED') AS completed_sent,
        COUNT(*) FILTER (WHERE to_user_id = user_uuid AND status = 'COMPLETED') AS completed_received
    FROM ticket_transfers
    WHERE from_user_id = user_uuid OR to_user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_transfer_stats(UUID)
IS 'Returns transfer statistics for a specific user';

-- Function to log transfer history automatically
CREATE OR REPLACE FUNCTION log_transfer_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
        INSERT INTO transfer_history (
            transfer_id,
            action,
            old_status,
            new_status,
            tenant_id,
            metadata,
            created_at
        ) VALUES (
            NEW.id,
            'STATUS_CHANGE',
            OLD.status,
            NEW.status,
            NEW.tenant_id,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'changed_at', NOW()
            ),
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic transfer history logging
CREATE TRIGGER trigger_log_transfer_change
    AFTER UPDATE ON ticket_transfers
    FOR EACH ROW
    EXECUTE FUNCTION log_transfer_change();

COMMENT ON TRIGGER trigger_log_transfer_change ON ticket_transfers
IS 'Automatically logs status changes to transfer_history table';

-- Function to check if ticket can be transferred
CREATE OR REPLACE FUNCTION can_transfer_ticket(
    p_ticket_id UUID,
    p_user_id UUID
)
RETURNS TABLE(
    can_transfer BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    ticket_record RECORD;
    pending_transfer_count INTEGER;
BEGIN
    -- Check if ticket exists and belongs to user
    SELECT * INTO ticket_record 
    FROM tickets 
    WHERE id = p_ticket_id AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Ticket not found or not owned by user';
        RETURN;
    END IF;
    
    -- Check for pending transfers
    SELECT COUNT(*) INTO pending_transfer_count
    FROM ticket_transfers
    WHERE ticket_id = p_ticket_id AND status = 'PENDING';
    
    IF pending_transfer_count > 0 THEN
        RETURN QUERY SELECT FALSE, 'Ticket already has a pending transfer';
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT TRUE, 'Ticket can be transferred';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_transfer_ticket(UUID, UUID)
IS 'Checks if a ticket can be transferred by validating ownership and transfer status';

-- Function to get active transfers for tenant
CREATE OR REPLACE FUNCTION get_active_transfers_count(p_tenant_id UUID)
RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM ticket_transfers
    WHERE tenant_id = p_tenant_id
    AND status = 'PENDING'
    AND expires_at > NOW();
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_active_transfers_count(UUID)
IS 'Returns count of active (pending and not expired) transfers for a tenant';

-- Materialized view for transfer analytics (refresh periodically)
CREATE MATERIALIZED VIEW transfer_analytics AS
SELECT
    DATE_TRUNC('day', created_at) AS transfer_date,
    tenant_id,
    transfer_method,
    status,
    COUNT(*) AS transfer_count,
    COUNT(*) FILTER (WHERE is_gift = true) AS gift_count,
    COUNT(*) FILTER (WHERE is_gift = false) AS sale_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(accepted_at, NOW()) - created_at))) AS avg_acceptance_time_seconds
FROM ticket_transfers
GROUP BY transfer_date, tenant_id, transfer_method, status;

CREATE UNIQUE INDEX idx_transfer_analytics_unique 
ON transfer_analytics(transfer_date, tenant_id, transfer_method, status);

COMMENT ON MATERIALIZED VIEW transfer_analytics
IS 'Aggregated transfer statistics for analytics and reporting';

-- Function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_transfer_analytics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY transfer_analytics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_transfer_analytics()
IS 'Refreshes the transfer analytics materialized view';
