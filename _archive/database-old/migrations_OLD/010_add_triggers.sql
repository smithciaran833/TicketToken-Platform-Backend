-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Add Database Triggers (FINAL VERSION)
-- Version: 010
-- Description: Adds triggers that work with current schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- SUPPORTING TABLES (if not exist)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_lookup
ON public.audit_logs(table_name, record_id, created_at DESC);

-- Notification queue
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    recipient_id UUID NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
ON public.notification_queue(status, created_at)
WHERE status = 'pending';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TRIGGER FUNCTIONS
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- 1. Simple audit function
CREATE OR REPLACE FUNCTION audit_trigger_simple()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD));
        RETURN OLD;
    ELSE
        INSERT INTO audit_logs (table_name, record_id, action, new_data, old_data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(NEW), 
                CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Update event statistics
CREATE OR REPLACE FUNCTION update_event_ticket_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE events
    SET total_tickets = (
            SELECT COUNT(*) FROM tickets WHERE event_id = COALESCE(NEW.event_id, OLD.event_id)
        ),
        available_tickets = (
            SELECT COUNT(*) FROM tickets 
            WHERE event_id = COALESCE(NEW.event_id, OLD.event_id)
            AND status = 'available'
        )
    WHERE id = COALESCE(NEW.event_id, OLD.event_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Update venue event count
CREATE OR REPLACE FUNCTION update_venue_event_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE venues 
        SET total_events = COALESCE(total_events, 0) + 1
        WHERE id = NEW.venue_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE venues 
        SET total_events = GREATEST(COALESCE(total_events, 0) - 1, 0)
        WHERE id = OLD.venue_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Calculate transaction fees
CREATE OR REPLACE FUNCTION calculate_transaction_fees()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate platform fee (2.5%)
    NEW.platform_fee := ROUND(NEW.amount * 0.025, 2);
    
    -- Calculate total with fees
    NEW.total_amount := NEW.amount + COALESCE(NEW.platform_fee, 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Validate ticket purchase price
CREATE OR REPLACE FUNCTION validate_ticket_purchase_price()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.face_value < 0 THEN
        RAISE EXCEPTION 'Ticket purchase price cannot be negative';
    END IF;
    
    IF NEW.face_value > 10000 THEN
        RAISE EXCEPTION 'Ticket purchase price exceeds maximum allowed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Generate notification
CREATE OR REPLACE FUNCTION generate_ticket_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify on new listing
    IF TG_TABLE_NAME = 'listings' AND TG_OP = 'INSERT' THEN
        INSERT INTO notification_queue (type, recipient_id, data)
        SELECT 'new_listing', user_id, jsonb_build_object(
            'listing_id', NEW.id,
            'ticket_id', NEW.ticket_id,
            'price', NEW.price
        )
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE NEW.id IN (SELECT transaction_id FROM ticket_transactions tt WHERE tt.ticket_id = t.id);
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. Update user statistics
CREATE OR REPLACE FUNCTION update_user_purchase_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.type = 'purchase' AND NEW.status = 'completed' THEN
        UPDATE users
        SET total_purchases = COALESCE(total_purchases, 0) + 1,
            total_spent = COALESCE(total_spent, 0) + NEW.amount,
            last_purchase_at = CURRENT_TIMESTAMP
        WHERE id = NEW.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 8. Update listing price in history
CREATE OR REPLACE FUNCTION track_listing_price_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.price != OLD.price) THEN
        INSERT INTO price_history (
            ticket_id,
            listing_id,
            price,
            recorded_at
        ) VALUES (
            NEW.ticket_id,
            NEW.id,
            NEW.price,
            CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CREATE TRIGGERS
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS trg_audit_events ON public.events;
DROP TRIGGER IF EXISTS trg_audit_users ON public.users;
DROP TRIGGER IF EXISTS trg_audit_tickets ON public.tickets;
DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
DROP TRIGGER IF EXISTS trg_audit_listings ON public.listings;

DROP TRIGGER IF EXISTS trg_update_event_stats ON public.tickets;
DROP TRIGGER IF EXISTS trg_update_venue_stats ON public.events;
DROP TRIGGER IF EXISTS trg_calculate_fees ON public.transactions;
DROP TRIGGER IF EXISTS trg_validate_purchase_price ON public.tickets;
DROP TRIGGER IF EXISTS trg_notify_listing ON public.listings;
DROP TRIGGER IF EXISTS trg_update_user_stats ON public.transactions;
DROP TRIGGER IF EXISTS trg_track_price_history ON public.listings;

-- Audit triggers (priority 800)
CREATE TRIGGER trg_audit_events
    AFTER INSERT OR UPDATE OR DELETE ON public.events
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_simple();

CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_simple();

CREATE TRIGGER trg_audit_tickets
    AFTER INSERT OR UPDATE OR DELETE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_simple();

CREATE TRIGGER trg_audit_transactions
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_simple();

CREATE TRIGGER trg_audit_listings
    AFTER INSERT OR UPDATE OR DELETE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_simple();

-- Statistics update triggers (priority 500)
CREATE TRIGGER trg_update_event_stats
    AFTER INSERT OR UPDATE OR DELETE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION update_event_ticket_stats();

CREATE TRIGGER trg_update_venue_stats
    AFTER INSERT OR DELETE ON public.events
    FOR EACH ROW EXECUTE FUNCTION update_venue_event_count();

CREATE TRIGGER trg_update_user_stats
    AFTER INSERT OR UPDATE ON public.transactions
    FOR EACH ROW 
    WHEN (NEW.type = 'purchase')
    EXECUTE FUNCTION update_user_purchase_stats();

-- Calculation triggers (priority 200)
CREATE TRIGGER trg_calculate_fees
    BEFORE INSERT OR UPDATE OF amount ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION calculate_transaction_fees();

-- Validation triggers (priority 100)
CREATE TRIGGER trg_validate_purchase_price
    BEFORE INSERT OR UPDATE OF face_value ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION validate_ticket_purchase_price();

-- Notification triggers (priority 700)
CREATE TRIGGER trg_notify_listing
    AFTER INSERT ON public.listings
    FOR EACH ROW EXECUTE FUNCTION generate_ticket_notification();

-- History tracking triggers (priority 600)
CREATE TRIGGER trg_track_price_history
    AFTER INSERT OR UPDATE OF price ON public.listings
    FOR EACH ROW EXECUTE FUNCTION track_listing_price_history();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ADD MISSING COLUMNS (if needed)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Add statistics columns to events
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS total_tickets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS available_tickets INTEGER DEFAULT 0;

-- Add statistics columns to venues
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS total_events INTEGER DEFAULT 0;

-- Add statistics columns to users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS total_purchases INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMP WITH TIME ZONE;

-- Add fee columns to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- MIGRATION TRACKING
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


INSERT INTO schema_migrations (version, name, applied_at)
VALUES (10, '010_add_triggers', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- SUMMARY
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


DO $$
DECLARE
    trigger_count INTEGER;
    function_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.tgname LIKE 'trg_%';
    
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname LIKE '%trigger%';
    
    RAISE NOTICE 'Migration complete: % triggers, % trigger functions', 
        trigger_count, function_count;
END $$;

