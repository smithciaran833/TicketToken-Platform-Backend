--
-- PostgreSQL database dump
--

\restrict JSfyEJzjZXhvmA5ERz4UesMCKEZb9T2gq95m2OPX2DgncRH8VnSHngCwbqvdgng

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aggregate_notification_analytics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggregate_notification_analytics() RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
        INSERT INTO notification_analytics (
            date, hour, channel, type, provider,
            total_sent, total_delivered, total_failed, total_bounced
        )
        SELECT
            DATE(created_at) as date,
            EXTRACT(HOUR FROM created_at)::INTEGER as hour,
            channel,
            type,
            metadata->>'provider' as provider,
            COUNT(*) FILTER (WHERE delivery_status = 'sent') as total_sent,
            COUNT(*) FILTER (WHERE delivery_status = 'delivered') as total_delivered,
            COUNT(*) FILTER (WHERE delivery_status = 'failed') as total_failed,
            COUNT(*) FILTER (WHERE delivery_status = 'bounced') as total_bounced
        FROM notification_history
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at), channel, type, metadata->>'provider'
        ON CONFLICT (date, hour, channel, type, provider)
        DO UPDATE SET
            total_sent = EXCLUDED.total_sent,
            total_delivered = EXCLUDED.total_delivered,
            total_failed = EXCLUDED.total_failed,
            total_bounced = EXCLUDED.total_bounced,
            updated_at = CURRENT_TIMESTAMP;
    END;
    $$;


ALTER FUNCTION public.aggregate_notification_analytics() OWNER TO postgres;

--
-- Name: audit_trigger_function(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_trigger_function() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    audit_user_id UUID;
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
BEGIN
    -- Get the user ID from context (set by application)
    BEGIN
        audit_user_id := current_setting('app.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        audit_user_id := NULL;
    END;

    -- Prepare old and new data
    IF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        new_data := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        
        -- Calculate changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each(old_data)
        WHERE old_data->key IS DISTINCT FROM new_data->key;
    ELSE -- INSERT
        old_data := NULL;
        new_data := to_jsonb(NEW);
    END IF;

    -- Remove sensitive fields from audit log
    IF old_data IS NOT NULL THEN
        old_data := old_data - 'password_hash' - 'totp_secret';
    END IF;
    IF new_data IS NOT NULL THEN
        new_data := new_data - 'password_hash' - 'totp_secret';
    END IF;

    -- Insert audit record
    INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        changed_fields,
        ip_address,
        user_agent
    ) VALUES (
        audit_user_id,
        TG_OP::audit_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id)::TEXT,
        old_data,
        new_data,
        changed_fields,
        current_setting('app.client_ip', true),
        current_setting('app.user_agent', true)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION public.audit_trigger_function() OWNER TO postgres;

--
-- Name: calculate_marketplace_fees(integer, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_marketplace_fees(sale_price_cents integer, platform_fee_pct numeric, venue_fee_pct numeric) RETURNS TABLE(platform_fee integer, venue_fee integer, seller_payout integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY SELECT
        CAST(ROUND(sale_price_cents * platform_fee_pct / 100.0) AS INTEGER) as platform_fee,
        CAST(ROUND(sale_price_cents * venue_fee_pct / 100.0) AS INTEGER) as venue_fee,
        CAST(sale_price_cents - ROUND(sale_price_cents * platform_fee_pct / 100.0) - ROUND(sale_price_cents * venue_fee_pct / 100.0) AS INTEGER) as seller_payout;
    END;
    $$;


ALTER FUNCTION public.calculate_marketplace_fees(sale_price_cents integer, platform_fee_pct numeric, venue_fee_pct numeric) OWNER TO postgres;

--
-- Name: check_password_strength(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_password_strength(password text) RETURNS boolean
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- Minimum 12 characters
    IF length(password) < 12 THEN
        RAISE EXCEPTION 'Password must be at least 12 characters';
    END IF;
    
    -- Must contain uppercase
    IF NOT (password ~ '[A-Z]') THEN
        RAISE EXCEPTION 'Password must contain at least one uppercase letter';
    END IF;
    
    -- Must contain lowercase
    IF NOT (password ~ '[a-z]') THEN
        RAISE EXCEPTION 'Password must contain at least one lowercase letter';
    END IF;
    
    -- Must contain number
    IF NOT (password ~ '[0-9]') THEN
        RAISE EXCEPTION 'Password must contain at least one number';
    END IF;
    
    -- Must contain special character
    IF NOT (password ~ '[!@#$%^&*(),.?":{}|<>]') THEN
        RAISE EXCEPTION 'Password must contain at least one special character';
    END IF;
    
    RETURN TRUE;
END;
$_$;


ALTER FUNCTION public.check_password_strength(password text) OWNER TO postgres;

--
-- Name: check_suspicious_activity(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_suspicious_activity(user_id uuid, action_type text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    recent_actions INTEGER;
    velocity_threshold INTEGER;
BEGIN
    -- Define thresholds based on action type
    velocity_threshold := CASE action_type
        WHEN 'login_attempt' THEN 5
        WHEN 'password_reset' THEN 3
        WHEN 'ticket_purchase' THEN 10
        WHEN 'payment_method_add' THEN 5
        ELSE 20
    END;
    
    -- Count recent actions (last 5 minutes)
    SELECT COUNT(*) INTO recent_actions
    FROM audit_logs
    WHERE audit_logs.user_id = check_suspicious_activity.user_id
    AND action = action_type
    AND created_at > NOW() - INTERVAL '5 minutes';
    
    -- Return true if suspicious
    RETURN recent_actions >= velocity_threshold;
END;
$$;


ALTER FUNCTION public.check_suspicious_activity(user_id uuid, action_type text) OWNER TO postgres;

--
-- Name: cleanup_expired_data(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_expired_data() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions (older than 30 days)
    DELETE FROM user_sessions 
    WHERE last_activity < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % expired sessions', deleted_count;
    
    -- Delete old audit logs (keep 7 years for compliance)
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '7 years'
    AND category NOT IN ('financial', 'compliance');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old audit logs', deleted_count;
    
    -- Anonymize old customer data (GDPR right to be forgotten)
    UPDATE users 
    SET 
        email = 'deleted_' || id || '@removed.com',
        first_name = 'Deleted',
        last_name = 'User',
        phone = NULL,
        deleted_at = NOW()
    WHERE 
        deletion_requested_at IS NOT NULL 
        AND deletion_requested_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Anonymized % users', deleted_count;
    
    -- Clean up orphaned records
    DELETE FROM wallet_addresses WHERE user_id NOT IN (SELECT id FROM users);
    DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);
    
    -- Log cleanup completion
    INSERT INTO audit_logs (
        action, 
        entity_type, 
        category,
        description
    ) VALUES (
        'data_cleanup',
        'system',
        'maintenance',
        format('Data retention cleanup completed at %s', NOW())
    );
END;
$$;


ALTER FUNCTION public.cleanup_expired_data() OWNER TO postgres;

--
-- Name: cleanup_old_fraud_events(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_old_fraud_events() RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
        DELETE FROM fraud_events WHERE investigated = true AND investigated_at < NOW() - INTERVAL '1 year';
    END;
    $$;


ALTER FUNCTION public.cleanup_old_fraud_events() OWNER TO postgres;

--
-- Name: cleanup_old_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_old_metrics() RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
        DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '90 days';
    END;
    $$;


ALTER FUNCTION public.cleanup_old_metrics() OWNER TO postgres;

--
-- Name: decrypt_tax_id(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decrypt_tax_id(encrypted_tax_id text, encryption_key text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    key TEXT;
BEGIN
    -- Use provided key or get from configuration
    key := COALESCE(encryption_key, current_setting('app.encryption_key', TRUE));
    
    IF key IS NULL OR key = '' THEN
        RETURN encrypted_tax_id;
    END IF;
    
    -- In production, use pgcrypto extension for proper decryption
    -- For now, this is a placeholder that should be replaced with:
    -- RETURN decrypt(decode(encrypted_tax_id, 'base64'), key::bytea, 'aes');
    
    RETURN encrypted_tax_id;
END;
$$;


ALTER FUNCTION public.decrypt_tax_id(encrypted_tax_id text, encryption_key text) OWNER TO postgres;

--
-- Name: encrypt_tax_id(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.encrypt_tax_id(plain_tax_id text, encryption_key text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    key TEXT;
BEGIN
    -- Use provided key or get from configuration
    key := COALESCE(encryption_key, current_setting('app.encryption_key', TRUE));
    
    IF key IS NULL OR key = '' THEN
        RAISE WARNING 'No encryption key provided. Storing tax_id in plain text.';
        RETURN plain_tax_id;
    END IF;
    
    -- In production, use pgcrypto extension for proper encryption
    -- For now, this is a placeholder that should be replaced with:
    -- RETURN encode(encrypt(plain_tax_id::bytea, key::bytea, 'aes'), 'base64');
    
    RETURN plain_tax_id;
END;
$$;


ALTER FUNCTION public.encrypt_tax_id(plain_tax_id text, encryption_key text) OWNER TO postgres;

--
-- Name: expire_marketplace_listings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.expire_marketplace_listings() RETURNS integer
    LANGUAGE plpgsql
    AS $$
    DECLARE
      expired_count INTEGER;
    BEGIN
      -- Update expired listings
      UPDATE marketplace_listings
      SET status = 'expired',
          updated_at = NOW()
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < NOW();

      GET DIAGNOSTICS expired_count = ROW_COUNT;

      RETURN expired_count;
    END;
    $$;


ALTER FUNCTION public.expire_marketplace_listings() OWNER TO postgres;

--
-- Name: find_orphan_reservations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_orphan_reservations() RETURNS TABLE(reservation_id uuid, order_id uuid, user_id uuid, event_id uuid, status character varying, expires_at timestamp with time zone, created_at timestamp with time zone, issue_type character varying, tickets jsonb)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- Reservations with no order (created but never converted)
      RETURN QUERY
      SELECT
        r.id,
        r.order_id,
        r.user_id,
        r.event_id,
        r.status,
        r.expires_at,
        r.created_at,
        'NO_ORDER'::VARCHAR as issue_type,
        r.tickets
      FROM reservations r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE r.status = 'PENDING'
        AND o.id IS NULL
        AND r.created_at < NOW() - INTERVAL '10 minutes'

      UNION ALL

      -- Reservations for failed orders
      SELECT
        r.id,
        r.order_id,
        r.user_id,
        r.event_id,
        r.status,
        r.expires_at,
        r.created_at,
        'FAILED_ORDER'::VARCHAR as issue_type,
        r.tickets
      FROM reservations r
      JOIN orders o ON r.order_id = o.id
      WHERE r.status = 'PENDING'
        AND o.status IN ('CANCELLED', 'PAYMENT_FAILED', 'EXPIRED')

      UNION ALL

      -- Old pending reservations (stuck)
      SELECT
        r.id,
        r.order_id,
        r.user_id,
        r.event_id,
        r.status,
        r.expires_at,
        r.created_at,
        'STUCK_PENDING'::VARCHAR as issue_type,
        r.tickets
      FROM reservations r
      WHERE r.status = 'PENDING'
        AND r.expires_at < NOW() - INTERVAL '1 hour';
    END;
    $$;


ALTER FUNCTION public.find_orphan_reservations() OWNER TO postgres;

--
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_order_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN 'ORD-' || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
    END;
    $$;


ALTER FUNCTION public.generate_order_number() OWNER TO postgres;

--
-- Name: generate_secure_token(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_secure_token(length integer DEFAULT 32) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(length), 'hex');
END;
$$;


ALTER FUNCTION public.generate_secure_token(length integer) OWNER TO postgres;

--
-- Name: generate_user_referral_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_user_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.referral_code IS NULL THEN
        NEW.referral_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT) FROM 1 FOR 8));
      END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.generate_user_referral_code() OWNER TO postgres;

--
-- Name: get_next_sequence_number(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_sequence_number(p_payment_id uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
    DECLARE
      next_seq BIGINT;
    BEGIN
      UPDATE payment_intents
      SET last_sequence_number = last_sequence_number + 1
      WHERE id = p_payment_id
      RETURNING last_sequence_number INTO next_seq;

      IF next_seq IS NULL THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
      END IF;

      RETURN next_seq;
    END;
    $$;


ALTER FUNCTION public.get_next_sequence_number(p_payment_id uuid) OWNER TO postgres;

--
-- Name: get_user_active_listings_count(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_active_listings_count(p_user_id uuid, p_event_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
    DECLARE
      listing_count INTEGER;
    BEGIN
      IF p_event_id IS NULL THEN
        SELECT COUNT(*) INTO listing_count
        FROM marketplace_listings
        WHERE seller_id = p_user_id
          AND status = 'active';
      ELSE
        SELECT COUNT(*) INTO listing_count
        FROM marketplace_listings
        WHERE seller_id = p_user_id
          AND event_id = p_event_id
          AND status = 'active';
      END IF;

      RETURN listing_count;
    END;
    $$;


ALTER FUNCTION public.get_user_active_listings_count(p_user_id uuid, p_event_id uuid) OWNER TO postgres;

--
-- Name: increment_referral_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_referral_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.referred_by IS NOT NULL THEN
        UPDATE users 
        SET referral_count = referral_count + 1 
        WHERE id = NEW.referred_by;
      END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.increment_referral_count() OWNER TO postgres;

--
-- Name: mask_card_number(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mask_card_number(card text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF card IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN repeat('*', length(card) - 4) || right(card, 4);
END;
$$;


ALTER FUNCTION public.mask_card_number(card text) OWNER TO postgres;

--
-- Name: mask_email(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mask_email(email text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF email IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN 
        CASE 
            WHEN position('@' IN email) > 3 THEN
                left(email, 2) || repeat('*', position('@' IN email) - 3) || 
                substring(email from position('@' IN email))
            ELSE
                repeat('*', position('@' IN email) - 1) || 
                substring(email from position('@' IN email))
        END;
END;
$$;


ALTER FUNCTION public.mask_email(email text) OWNER TO postgres;

--
-- Name: mask_phone(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mask_phone(phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF phone IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN regexp_replace(phone, '(\d{3})(\d+)(\d{4})', '\1-***-\3');
END;
$$;


ALTER FUNCTION public.mask_phone(phone text) OWNER TO postgres;

--
-- Name: mask_tax_id(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mask_tax_id(tax_id text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF tax_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN '***-**-' || right(tax_id, 4);
END;
$$;


ALTER FUNCTION public.mask_tax_id(tax_id text) OWNER TO postgres;

--
-- Name: release_expired_reservations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.release_expired_reservations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
    DECLARE
      released_count INTEGER;
    BEGIN
      -- Update expired reservations
      UPDATE reservations
      SET status = 'EXPIRED',
          released_at = NOW(),
          release_reason = 'Automatic expiry',
          updated_at = NOW()
      WHERE status IN ('ACTIVE', 'PENDING')
        AND expires_at < NOW();

      GET DIAGNOSTICS released_count = ROW_COUNT;

      -- Return inventory to ticket_types
      UPDATE ticket_types tt
      SET available_quantity = available_quantity + subq.total_quantity,
          reserved_quantity = GREATEST(0, reserved_quantity - subq.total_quantity),
          updated_at = NOW()
      FROM (
        SELECT
          r.id as reservation_id,
          (r.tickets::jsonb -> 0 ->> 'ticketTypeId')::uuid as ticket_type_id,
          r.total_quantity
        FROM reservations r
        WHERE r.status = 'EXPIRED'
          AND r.released_at >= NOW() - INTERVAL '2 minutes'
      ) subq
      WHERE tt.id = subq.ticket_type_id;

      RETURN released_count;
    END;
    $$;


ALTER FUNCTION public.release_expired_reservations() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: update_webhook_inbox_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_webhook_inbox_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.update_webhook_inbox_updated_at() OWNER TO postgres;

--
-- Name: validate_payment_state_transition(character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_payment_state_transition(current_state character varying, new_state character varying, event_type character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM payment_state_machine
        WHERE from_state = current_state
          AND to_state = new_state
          AND event_type = event_type
          AND is_valid = true
      );
    END;
    $$;


ALTER FUNCTION public.validate_payment_state_transition(current_state character varying, new_state character varying, event_type character varying) OWNER TO postgres;

--
-- Name: validate_tax_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_tax_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- Validate US EIN format (XX-XXXXXXX) if provided
    IF NEW.tax_id IS NOT NULL AND NEW.tax_id != '' THEN
        IF NEW.country = 'US' AND NOT (NEW.tax_id ~ '^\d{2}-\d{7}$') THEN
            RAISE EXCEPTION 'Invalid US EIN format. Expected: XX-XXXXXXX';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$_$;


ALTER FUNCTION public.validate_tax_id() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ab_test_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ab_test_variants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ab_test_id uuid NOT NULL,
    variant_name character varying(50) NOT NULL,
    template_id uuid,
    variant_data jsonb,
    sent_count integer DEFAULT 0,
    opened_count integer DEFAULT 0,
    clicked_count integer DEFAULT 0,
    converted_count integer DEFAULT 0,
    open_rate numeric(5,2),
    click_rate numeric(5,2),
    conversion_rate numeric(5,2),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ab_test_variants OWNER TO postgres;

--
-- Name: ab_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ab_tests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    test_type character varying(50) NOT NULL,
    variant_count integer DEFAULT 2 NOT NULL,
    sample_size_per_variant integer,
    winning_metric character varying(50) NOT NULL,
    winner_variant_id uuid,
    status text DEFAULT 'draft'::text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ab_tests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'completed'::text, 'cancelled'::text])))
);


ALTER TABLE public.ab_tests OWNER TO postgres;

--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abandoned_carts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    event_id uuid NOT NULL,
    cart_items jsonb NOT NULL,
    total_amount_cents integer,
    abandoned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    recovery_email_sent boolean DEFAULT false,
    recovery_email_sent_at timestamp with time zone,
    converted boolean DEFAULT false,
    converted_at timestamp with time zone,
    order_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.abandoned_carts OWNER TO postgres;

--
-- Name: account_takeover_signals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_takeover_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    signal_type character varying(100) NOT NULL,
    risk_score integer NOT NULL,
    signal_data jsonb,
    is_anomaly boolean DEFAULT false,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.account_takeover_signals OWNER TO postgres;

--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alert_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    rule_name character varying(255) NOT NULL,
    metric_name character varying(255) NOT NULL,
    condition character varying(50) NOT NULL,
    threshold numeric(8,2) NOT NULL,
    severity text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT alert_rules_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);


ALTER TABLE public.alert_rules OWNER TO postgres;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alerts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    message text NOT NULL,
    source character varying(255) NOT NULL,
    metadata jsonb,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT alerts_type_check CHECK ((type = ANY (ARRAY['error'::text, 'warning'::text, 'info'::text])))
);


ALTER TABLE public.alerts OWNER TO postgres;

--
-- Name: analytics_aggregations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_aggregations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregation_type character varying(255) NOT NULL,
    metric_type character varying(255) NOT NULL,
    entity_type character varying(255) NOT NULL,
    entity_id uuid,
    dimensions jsonb DEFAULT '{}'::jsonb,
    time_period character varying(255) NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    value numeric(15,2) NOT NULL,
    unit character varying(255) NOT NULL,
    sample_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_aggregations OWNER TO postgres;

--
-- Name: analytics_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    alert_type character varying(255) NOT NULL,
    severity character varying(255) NOT NULL,
    metric_type character varying(255) NOT NULL,
    entity_type character varying(255) NOT NULL,
    entity_id uuid,
    threshold_config jsonb NOT NULL,
    current_value numeric(15,2),
    threshold_value numeric(15,2),
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    triggered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_alerts OWNER TO postgres;

--
-- Name: analytics_dashboards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_dashboards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(255) NOT NULL,
    layout jsonb DEFAULT '{}'::jsonb,
    filters jsonb DEFAULT '{}'::jsonb,
    visibility character varying(255) DEFAULT 'private'::character varying NOT NULL,
    created_by uuid NOT NULL,
    is_default boolean DEFAULT false,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_dashboards OWNER TO postgres;

--
-- Name: analytics_exports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_exports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    export_type character varying(255) NOT NULL,
    format character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    parameters jsonb NOT NULL,
    file_path character varying(255),
    file_url character varying(255),
    file_size integer,
    expires_at timestamp with time zone,
    requested_by uuid NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_exports OWNER TO postgres;

--
-- Name: analytics_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    metric_type character varying(255) NOT NULL,
    entity_type character varying(255) NOT NULL,
    entity_id uuid NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb,
    value numeric(15,2) NOT NULL,
    unit character varying(255) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_metrics OWNER TO postgres;

--
-- Name: analytics_widgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    dashboard_id uuid NOT NULL,
    widget_type character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    configuration jsonb NOT NULL,
    data_source jsonb NOT NULL,
    "position" jsonb NOT NULL,
    size jsonb NOT NULL,
    style jsonb DEFAULT '{}'::jsonb,
    refresh_interval integer DEFAULT 60,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.analytics_widgets OWNER TO postgres;

--
-- Name: anti_bot_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.anti_bot_activities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    action_type character varying(100) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.anti_bot_activities OWNER TO postgres;

--
-- Name: anti_bot_violations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.anti_bot_violations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    severity text NOT NULL,
    flagged_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT anti_bot_violations_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


ALTER TABLE public.anti_bot_violations OWNER TO postgres;

--
-- Name: audience_segments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audience_segments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    filter_criteria jsonb NOT NULL,
    member_count integer DEFAULT 0,
    last_calculated_at timestamp with time zone,
    is_dynamic boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audience_segments OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id uuid,
    ip_address character varying(45),
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'success'::character varying,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: bank_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bank_verifications (
    id integer NOT NULL,
    venue_id character varying(255),
    account_last_four character varying(4),
    routing_number character varying(20),
    verified boolean,
    account_name character varying(255),
    account_type character varying(20),
    plaid_request_id character varying(255),
    plaid_item_id character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bank_verifications OWNER TO postgres;

--
-- Name: bank_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bank_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bank_verifications_id_seq OWNER TO postgres;

--
-- Name: bank_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bank_verifications_id_seq OWNED BY public.bank_verifications.id;


--
-- Name: behavioral_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.behavioral_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    event_type character varying(100) NOT NULL,
    page_url character varying(500),
    event_data jsonb,
    time_on_page_ms integer,
    mouse_movements integer,
    keystrokes integer,
    copy_paste_detected boolean DEFAULT false,
    form_autofill_detected boolean DEFAULT false,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.behavioral_analytics OWNER TO postgres;

--
-- Name: biometric_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biometric_credentials (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    device_id character varying(255) NOT NULL,
    public_key text NOT NULL,
    credential_type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.biometric_credentials OWNER TO postgres;

--
-- Name: bot_detections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bot_detections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id character varying(255),
    is_bot boolean NOT NULL,
    confidence numeric(3,2) NOT NULL,
    indicators text[],
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bot_detections OWNER TO postgres;

--
-- Name: card_fingerprints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.card_fingerprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_fingerprint character varying(255) NOT NULL,
    bin character varying(6),
    last4 character varying(4),
    card_brand character varying(50),
    issuing_bank character varying(255),
    card_type character varying(50),
    successful_purchases integer DEFAULT 0,
    failed_purchases integer DEFAULT 0,
    chargeback_count integer DEFAULT 0,
    fraud_count integer DEFAULT 0,
    total_amount_spent numeric(12,2) DEFAULT '0'::numeric,
    risk_level character varying(20) DEFAULT 'unknown'::character varying,
    first_used timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.card_fingerprints OWNER TO postgres;

--
-- Name: compliance_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_audit_log (
    id integer NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id character varying(255),
    user_id character varying(255),
    ip_address character varying(45),
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.compliance_audit_log OWNER TO postgres;

--
-- Name: compliance_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_audit_log_id_seq OWNER TO postgres;

--
-- Name: compliance_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_audit_log_id_seq OWNED BY public.compliance_audit_log.id;


--
-- Name: compliance_batch_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_batch_jobs (
    id integer NOT NULL,
    job_type character varying(50),
    status character varying(20),
    progress integer DEFAULT 0,
    total_items integer,
    completed_items integer DEFAULT 0,
    error_count integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.compliance_batch_jobs OWNER TO postgres;

--
-- Name: compliance_batch_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_batch_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_batch_jobs_id_seq OWNER TO postgres;

--
-- Name: compliance_batch_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_batch_jobs_id_seq OWNED BY public.compliance_batch_jobs.id;


--
-- Name: compliance_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_documents (
    id integer NOT NULL,
    document_id character varying(255),
    venue_id character varying(255),
    document_type character varying(50),
    filename character varying(255),
    original_name character varying(255),
    storage_path text,
    s3_url text,
    uploaded_by character varying(255),
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.compliance_documents OWNER TO postgres;

--
-- Name: compliance_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_documents_id_seq OWNER TO postgres;

--
-- Name: compliance_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_documents_id_seq OWNED BY public.compliance_documents.id;


--
-- Name: compliance_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_settings (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    value text,
    description text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.compliance_settings OWNER TO postgres;

--
-- Name: compliance_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_settings_id_seq OWNER TO postgres;

--
-- Name: compliance_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_settings_id_seq OWNED BY public.compliance_settings.id;


--
-- Name: connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    user_id uuid,
    venue_id uuid,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    access_token_encrypted text,
    refresh_token_encrypted text,
    token_expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.connections OWNER TO postgres;

--
-- Name: consent_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.consent_records (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    venue_id uuid,
    channel text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'granted'::text NOT NULL,
    granted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone,
    source character varying(100) NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT consent_records_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'push'::text, 'webhook'::text]))),
    CONSTRAINT consent_records_status_check CHECK ((status = ANY (ARRAY['granted'::text, 'revoked'::text, 'pending'::text]))),
    CONSTRAINT consent_records_type_check CHECK ((type = ANY (ARRAY['transactional'::text, 'marketing'::text, 'system'::text])))
);


ALTER TABLE public.consent_records OWNER TO postgres;

--
-- Name: custom_domains; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_domains (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    domain character varying(255) NOT NULL,
    verification_token character varying(255) NOT NULL,
    verification_method character varying(50) DEFAULT 'dns_txt'::character varying,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    ssl_status character varying(50) DEFAULT 'pending'::character varying,
    ssl_provider character varying(50) DEFAULT 'letsencrypt'::character varying,
    ssl_issued_at timestamp with time zone,
    ssl_expires_at timestamp with time zone,
    ssl_error_message text,
    required_dns_records jsonb,
    current_dns_records jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.custom_domains OWNER TO postgres;

--
-- Name: customer_lifetime_value; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_lifetime_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    venue_id uuid,
    tenant_id uuid NOT NULL,
    clv numeric(12,2) NOT NULL,
    avg_order_value numeric(10,2),
    purchase_frequency numeric(8,2),
    customer_lifespan_days integer,
    total_purchases integer,
    total_revenue numeric(12,2),
    predicted_clv_12_months numeric(12,2),
    predicted_clv_24_months numeric(12,2),
    churn_probability numeric(5,4),
    calculated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_lifetime_value OWNER TO postgres;

--
-- Name: customer_rfm_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_rfm_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    recency_score integer NOT NULL,
    frequency_score integer NOT NULL,
    monetary_score integer NOT NULL,
    total_score integer NOT NULL,
    days_since_last_purchase integer,
    total_purchases integer DEFAULT 0,
    total_spent numeric(12,2) DEFAULT '0'::numeric,
    average_order_value numeric(10,2),
    segment character varying(50) NOT NULL,
    churn_risk character varying(20),
    calculated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_rfm_scores OWNER TO postgres;

--
-- Name: customer_segments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    segment_name character varying(50) NOT NULL,
    customer_count integer DEFAULT 0,
    total_revenue numeric(12,2) DEFAULT '0'::numeric,
    avg_order_value numeric(10,2),
    avg_lifetime_value numeric(10,2),
    avg_purchase_frequency numeric(5,2),
    last_calculated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_segments OWNER TO postgres;

--
-- Name: dashboards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboards (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    widgets jsonb DEFAULT '[]'::jsonb,
    layout jsonb,
    owner character varying(255),
    shared boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.dashboards OWNER TO postgres;

--
-- Name: device_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_fingerprint character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    activity_type character varying(100) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.device_activity OWNER TO postgres;

--
-- Name: devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    zone character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.devices OWNER TO postgres;

--
-- Name: discounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    code character varying(50) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    value_cents integer NOT NULL,
    value_percentage numeric(5,2),
    priority integer DEFAULT 100,
    stackable boolean DEFAULT false,
    max_uses integer,
    current_uses integer DEFAULT 0,
    max_uses_per_user integer DEFAULT 1,
    min_purchase_cents integer,
    max_discount_cents integer,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    event_id uuid,
    ticket_type_ids uuid[],
    active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT discounts_type_check CHECK (((type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying, 'bogo'::character varying, 'early_bird'::character varying])::text[])))
);


ALTER TABLE public.discounts OWNER TO postgres;

--
-- Name: email_automation_triggers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_automation_triggers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    trigger_type character varying(50) NOT NULL,
    template_id uuid NOT NULL,
    trigger_conditions jsonb NOT NULL,
    delay_minutes integer DEFAULT 0,
    is_active boolean DEFAULT true,
    sent_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.email_automation_triggers OWNER TO postgres;

--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_email character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    template character varying(255) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority character varying(255) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.email_queue OWNER TO postgres;

--
-- Name: event_capacity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_capacity (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    schedule_id uuid,
    section_name character varying(100) NOT NULL,
    section_code character varying(20),
    tier character varying(50),
    total_capacity integer NOT NULL,
    available_capacity integer NOT NULL,
    reserved_capacity integer DEFAULT 0,
    buffer_capacity integer DEFAULT 0,
    sold_count integer DEFAULT 0,
    pending_count integer DEFAULT 0,
    reserved_at timestamp with time zone,
    reserved_expires_at timestamp with time zone,
    locked_price_data jsonb,
    row_config jsonb,
    seat_map jsonb,
    is_active boolean DEFAULT true,
    is_visible boolean DEFAULT true,
    minimum_purchase integer DEFAULT 1,
    maximum_purchase integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_capacity OWNER TO postgres;

--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    parent_id uuid,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    color character varying(7),
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    is_featured boolean DEFAULT false,
    meta_title character varying(70),
    meta_description character varying(160),
    event_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_categories OWNER TO postgres;

--
-- Name: event_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_metadata (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    performers jsonb,
    headliner character varying(200),
    supporting_acts text[],
    production_company character varying(200),
    technical_requirements jsonb,
    stage_setup_time_hours integer,
    sponsors jsonb,
    primary_sponsor character varying(200),
    performance_rights_org character varying(100),
    licensing_requirements text[],
    insurance_requirements jsonb,
    press_release text,
    marketing_copy jsonb,
    social_media_copy jsonb,
    sound_requirements jsonb,
    lighting_requirements jsonb,
    video_requirements jsonb,
    catering_requirements jsonb,
    rider_requirements jsonb,
    production_budget numeric(12,2),
    marketing_budget numeric(12,2),
    projected_revenue numeric(12,2),
    break_even_capacity integer,
    previous_events jsonb,
    custom_fields jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_metadata OWNER TO postgres;

--
-- Name: event_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_pricing (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    schedule_id uuid,
    capacity_id uuid,
    name character varying(100) NOT NULL,
    description text,
    tier character varying(50),
    base_price numeric(10,2) NOT NULL,
    service_fee numeric(10,2) DEFAULT '0'::numeric,
    facility_fee numeric(10,2) DEFAULT '0'::numeric,
    tax_rate numeric(5,4) DEFAULT '0'::numeric,
    is_dynamic boolean DEFAULT false,
    min_price numeric(10,2),
    max_price numeric(10,2),
    price_adjustment_rules jsonb,
    current_price numeric(10,2),
    early_bird_price numeric(10,2),
    early_bird_ends_at timestamp with time zone,
    last_minute_price numeric(10,2),
    last_minute_starts_at timestamp with time zone,
    group_size_min integer,
    group_discount_percentage numeric(5,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    sales_start_at timestamp with time zone,
    sales_end_at timestamp with time zone,
    max_per_order integer,
    max_per_customer integer,
    is_active boolean DEFAULT true,
    is_visible boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_pricing OWNER TO postgres;

--
-- Name: event_purchase_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_purchase_limits (
    event_id uuid NOT NULL,
    purchase_limit_per_user integer DEFAULT 4,
    purchase_limit_per_payment_method integer DEFAULT 4,
    purchase_limit_per_address integer DEFAULT 8,
    max_tickets_per_order integer DEFAULT 4,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_purchase_limits OWNER TO postgres;

--
-- Name: event_royalty_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_royalty_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    venue_royalty_percentage numeric(5,2),
    artist_royalty_percentage numeric(5,2) DEFAULT '0'::numeric,
    artist_wallet_address character varying(255),
    artist_stripe_account_id character varying(255),
    override_venue_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_event_royalty_percentages CHECK ((((venue_royalty_percentage IS NULL) OR ((venue_royalty_percentage >= (0)::numeric) AND (venue_royalty_percentage <= (100)::numeric))) AND ((artist_royalty_percentage >= (0)::numeric) AND (artist_royalty_percentage <= (100)::numeric))))
);


ALTER TABLE public.event_royalty_settings OWNER TO postgres;

--
-- Name: event_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_schedules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    doors_open_at timestamp with time zone,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    recurrence_end_date date,
    occurrence_number integer,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    utc_offset integer,
    status character varying(50) DEFAULT 'SCHEDULED'::character varying,
    status_reason text,
    capacity_override integer,
    check_in_opens_at timestamp with time zone,
    check_in_closes_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT event_schedules_status_check CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'CONFIRMED'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'POSTPONED'::character varying, 'RESCHEDULED'::character varying])::text[])))
);


ALTER TABLE public.event_schedules OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    venue_id uuid NOT NULL,
    venue_layout_id uuid,
    name character varying(300) NOT NULL,
    slug character varying(300) NOT NULL,
    description text,
    short_description character varying(500),
    event_type character varying(50) DEFAULT 'single'::character varying NOT NULL,
    primary_category_id uuid,
    secondary_category_ids uuid[],
    tags text[],
    status character varying(50) DEFAULT 'DRAFT'::character varying,
    visibility character varying(50) DEFAULT 'PUBLIC'::character varying,
    is_featured boolean DEFAULT false,
    priority_score integer DEFAULT 0,
    banner_image_url text,
    thumbnail_image_url text,
    image_gallery jsonb,
    video_url text,
    virtual_event_url text,
    age_restriction integer DEFAULT 0,
    dress_code character varying(100),
    special_requirements text[],
    accessibility_info jsonb,
    collection_address character varying(44),
    mint_authority character varying(44),
    royalty_percentage numeric(5,2),
    is_virtual boolean DEFAULT false,
    is_hybrid boolean DEFAULT false,
    streaming_platform character varying(50),
    streaming_config jsonb,
    cancellation_policy text,
    refund_policy text,
    cancellation_deadline_hours integer DEFAULT 24,
    meta_title character varying(70),
    meta_description character varying(160),
    meta_keywords text[],
    view_count integer DEFAULT 0,
    interest_count integer DEFAULT 0,
    share_count integer DEFAULT 0,
    external_id character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    allow_transfers boolean DEFAULT true,
    max_transfers_per_ticket integer DEFAULT 5,
    transfer_blackout_start timestamp with time zone,
    transfer_blackout_end timestamp with time zone,
    require_identity_verification boolean DEFAULT false,
    CONSTRAINT events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['single'::character varying, 'recurring'::character varying, 'series'::character varying])::text[]))),
    CONSTRAINT events_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'REVIEW'::character varying, 'APPROVED'::character varying, 'PUBLISHED'::character varying, 'ON_SALE'::character varying, 'SOLD_OUT'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'POSTPONED'::character varying])::text[]))),
    CONSTRAINT events_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['PUBLIC'::character varying, 'PRIVATE'::character varying, 'UNLISTED'::character varying])::text[])))
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: external_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    provider character varying(255) NOT NULL,
    verification_type character varying(255) NOT NULL,
    external_id character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.external_verifications OWNER TO postgres;

--
-- Name: field_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.field_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    source_field character varying(255) NOT NULL,
    target_field character varying(255) NOT NULL,
    transform_rule jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.field_mappings OWNER TO postgres;

--
-- Name: file_access_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    accessed_by uuid,
    access_type character varying(50) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    response_code integer,
    bytes_sent bigint,
    accessed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_access_logs OWNER TO postgres;

--
-- Name: file_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    version_number integer NOT NULL,
    storage_path text NOT NULL,
    size_bytes bigint NOT NULL,
    hash_sha256 character varying(64),
    change_description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_versions OWNER TO postgres;

--
-- Name: files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename character varying(255) NOT NULL,
    original_filename character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    extension character varying(20),
    storage_provider character varying(50) DEFAULT 'local'::character varying NOT NULL,
    bucket_name character varying(255),
    storage_path text NOT NULL,
    cdn_url text,
    size_bytes bigint NOT NULL,
    hash_sha256 character varying(64),
    uploaded_by uuid,
    entity_type character varying(100),
    entity_id uuid,
    is_public boolean DEFAULT false,
    access_level character varying(50) DEFAULT 'private'::character varying,
    status character varying(50) DEFAULT 'uploading'::character varying,
    processing_error text,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.files OWNER TO postgres;

--
-- Name: form_1099_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_1099_records (
    id integer NOT NULL,
    venue_id character varying(255),
    year integer,
    form_type character varying(20),
    gross_amount numeric(10,2),
    transaction_count integer,
    form_data jsonb,
    sent_to_irs boolean DEFAULT false,
    sent_to_venue boolean DEFAULT false,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.form_1099_records OWNER TO postgres;

--
-- Name: form_1099_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.form_1099_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.form_1099_records_id_seq OWNER TO postgres;

--
-- Name: form_1099_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.form_1099_records_id_seq OWNED BY public.form_1099_records.id;


--
-- Name: fraud_checks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fraud_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_id uuid,
    device_fingerprint character varying(255),
    ip_address inet,
    score numeric(3,2),
    risk_score numeric(5,2),
    signals jsonb,
    reasons jsonb,
    decision character varying(50) NOT NULL,
    check_type character varying(100),
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_fraud_checks_decision CHECK (((decision)::text = ANY ((ARRAY['approve'::character varying, 'review'::character varying, 'challenge'::character varying, 'decline'::character varying])::text[])))
);


ALTER TABLE public.fraud_checks OWNER TO postgres;

--
-- Name: fraud_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fraud_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id character varying(255) NOT NULL,
    pattern character varying(255) NOT NULL,
    risk_level character varying(50) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    data jsonb,
    investigated boolean DEFAULT false,
    investigated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.fraud_events OWNER TO postgres;

--
-- Name: fraud_review_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fraud_review_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_id uuid,
    fraud_check_id uuid,
    reason character varying(500) NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    assigned_to uuid,
    reviewer_notes text,
    review_metadata jsonb,
    reviewed_at timestamp with time zone,
    decision character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.fraud_review_queue OWNER TO postgres;

--
-- Name: fraud_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fraud_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_name character varying(255) NOT NULL,
    description text,
    rule_type character varying(50) NOT NULL,
    conditions jsonb NOT NULL,
    action character varying(50) NOT NULL,
    priority integer DEFAULT 100,
    is_active boolean DEFAULT true,
    trigger_count integer DEFAULT 0,
    block_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.fraud_rules OWNER TO postgres;

--
-- Name: group_payment_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_payment_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_payment_id uuid NOT NULL,
    user_id uuid,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    amount_due numeric(10,2) NOT NULL,
    ticket_count integer NOT NULL,
    paid boolean DEFAULT false,
    paid_at timestamp with time zone,
    payment_id character varying(255),
    reminders_sent integer DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.group_payment_members OWNER TO postgres;

--
-- Name: group_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    event_id uuid NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    ticket_selections jsonb NOT NULL,
    status character varying(50) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancellation_reason character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_group_payments_status CHECK (((status)::text = ANY ((ARRAY['collecting'::character varying, 'completed'::character varying, 'partially_paid'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.group_payments OWNER TO postgres;

--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.idempotency_keys (
    key character varying(255) NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.idempotency_keys OWNER TO postgres;

--
-- Name: index_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.index_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255) NOT NULL,
    operation character varying(20) NOT NULL,
    payload jsonb NOT NULL,
    priority integer DEFAULT 5,
    version bigint,
    idempotency_key character varying(255),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.index_queue OWNER TO postgres;

--
-- Name: index_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.index_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255) NOT NULL,
    version bigint DEFAULT '1'::bigint NOT NULL,
    indexed_at timestamp with time zone,
    index_status character varying(50) DEFAULT 'PENDING'::character varying,
    retry_count integer DEFAULT 0,
    last_error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.index_versions OWNER TO postgres;

--
-- Name: integration_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(100) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    health_status character varying(50) DEFAULT 'healthy'::character varying,
    access_token_encrypted text,
    refresh_token_encrypted text,
    api_key_encrypted text,
    api_secret_encrypted text,
    token_expires_at timestamp with time zone,
    last_token_refresh timestamp with time zone,
    config jsonb DEFAULT '{}'::jsonb,
    field_mappings jsonb DEFAULT '{}'::jsonb,
    template_id character varying(100),
    template_applied_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[],
    oauth_state character varying(255),
    last_sync_at timestamp with time zone,
    last_sync_status character varying(50),
    last_sync_error jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.integration_configs OWNER TO postgres;

--
-- Name: integration_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(100) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    api_calls integer DEFAULT 0,
    data_synced_mb numeric(12,2) DEFAULT '0'::numeric,
    webhook_events integer DEFAULT 0,
    api_cost numeric(10,2) DEFAULT '0'::numeric,
    storage_cost numeric(10,2) DEFAULT '0'::numeric,
    webhook_cost numeric(10,2) DEFAULT '0'::numeric,
    total_cost numeric(10,2) DEFAULT '0'::numeric,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.integration_costs OWNER TO postgres;

--
-- Name: integration_health; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(100) NOT NULL,
    status character varying(50) DEFAULT 'unknown'::character varying NOT NULL,
    success_rate integer DEFAULT 100,
    avg_response_time integer DEFAULT 0,
    error_count_24h integer DEFAULT 0,
    total_requests_24h integer DEFAULT 0,
    last_check_at timestamp with time zone,
    last_error jsonb,
    last_error_type character varying(100),
    uptime_percentage numeric(5,2) DEFAULT '100'::numeric,
    last_outage_at timestamp with time zone,
    outage_count_30d integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.integration_health OWNER TO postgres;

--
-- Name: integration_webhooks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid,
    integration_type character varying(100) NOT NULL,
    event_type character varying(255) NOT NULL,
    event_id character varying(255),
    external_id character varying(255),
    payload jsonb NOT NULL,
    headers jsonb,
    signature character varying(500),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    retry_count integer DEFAULT 0,
    processing_error jsonb,
    processed_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.integration_webhooks OWNER TO postgres;

--
-- Name: integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    provider character varying(100) NOT NULL,
    category character varying(100) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    credentials_encrypted text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.integrations OWNER TO postgres;

--
-- Name: invalidated_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invalidated_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    invalidated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.invalidated_tokens OWNER TO postgres;

--
-- Name: ip_reputation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ip_reputation (
    ip_address inet NOT NULL,
    risk_score integer DEFAULT 0 NOT NULL,
    reputation_status character varying(20) DEFAULT 'clean'::character varying NOT NULL,
    fraud_count integer DEFAULT 0,
    total_transactions integer DEFAULT 0,
    is_proxy boolean DEFAULT false,
    is_vpn boolean DEFAULT false,
    is_tor boolean DEFAULT false,
    is_datacenter boolean DEFAULT false,
    country_code character varying(2),
    asn character varying(50),
    geo_data jsonb,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    first_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    blocked_at timestamp with time zone,
    blocked_reason character varying(500),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ip_reputation OWNER TO postgres;

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    error text,
    scheduled_for timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.jobs OWNER TO postgres;

--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO postgres;

--
-- Name: knex_migrations_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_analytics (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_analytics OWNER TO postgres;

--
-- Name: knex_migrations_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_analytics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_analytics_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_analytics_id_seq OWNED BY public.knex_migrations_analytics.id;


--
-- Name: knex_migrations_analytics_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_analytics_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_analytics_lock OWNER TO postgres;

--
-- Name: knex_migrations_analytics_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_analytics_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_analytics_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_analytics_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_analytics_lock_index_seq OWNED BY public.knex_migrations_analytics_lock.index;


--
-- Name: knex_migrations_auth; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_auth (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_auth OWNER TO postgres;

--
-- Name: knex_migrations_auth_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_auth_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_auth_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_auth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_auth_id_seq OWNED BY public.knex_migrations_auth.id;


--
-- Name: knex_migrations_auth_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_auth_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_auth_lock OWNER TO postgres;

--
-- Name: knex_migrations_auth_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_auth_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_auth_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_auth_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_auth_lock_index_seq OWNED BY public.knex_migrations_auth_lock.index;


--
-- Name: knex_migrations_compliance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_compliance (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_compliance OWNER TO postgres;

--
-- Name: knex_migrations_compliance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_compliance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_compliance_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_compliance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_compliance_id_seq OWNED BY public.knex_migrations_compliance.id;


--
-- Name: knex_migrations_compliance_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_compliance_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_compliance_lock OWNER TO postgres;

--
-- Name: knex_migrations_compliance_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_compliance_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_compliance_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_compliance_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_compliance_lock_index_seq OWNED BY public.knex_migrations_compliance_lock.index;


--
-- Name: knex_migrations_event; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_event (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_event OWNER TO postgres;

--
-- Name: knex_migrations_event_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_event_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_event_id_seq OWNED BY public.knex_migrations_event.id;


--
-- Name: knex_migrations_event_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_event_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_event_lock OWNER TO postgres;

--
-- Name: knex_migrations_event_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_event_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_event_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_event_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_event_lock_index_seq OWNED BY public.knex_migrations_event_lock.index;


--
-- Name: knex_migrations_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_files (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_files OWNER TO postgres;

--
-- Name: knex_migrations_files_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_files_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_files_id_seq OWNED BY public.knex_migrations_files.id;


--
-- Name: knex_migrations_files_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_files_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_files_lock OWNER TO postgres;

--
-- Name: knex_migrations_files_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_files_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_files_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_files_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_files_lock_index_seq OWNED BY public.knex_migrations_files_lock.index;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_integration; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_integration (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_integration OWNER TO postgres;

--
-- Name: knex_migrations_integration_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_integration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_integration_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_integration_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_integration_id_seq OWNED BY public.knex_migrations_integration.id;


--
-- Name: knex_migrations_integration_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_integration_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_integration_lock OWNER TO postgres;

--
-- Name: knex_migrations_integration_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_integration_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_integration_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_integration_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_integration_lock_index_seq OWNED BY public.knex_migrations_integration_lock.index;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: knex_migrations_marketplace; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_marketplace (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_marketplace OWNER TO postgres;

--
-- Name: knex_migrations_marketplace_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_marketplace_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_marketplace_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_marketplace_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_marketplace_id_seq OWNED BY public.knex_migrations_marketplace.id;


--
-- Name: knex_migrations_marketplace_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_marketplace_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_marketplace_lock OWNER TO postgres;

--
-- Name: knex_migrations_marketplace_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_marketplace_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_marketplace_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_marketplace_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_marketplace_lock_index_seq OWNED BY public.knex_migrations_marketplace_lock.index;


--
-- Name: knex_migrations_monitoring; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_monitoring (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_monitoring OWNER TO postgres;

--
-- Name: knex_migrations_monitoring_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_monitoring_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_monitoring_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_monitoring_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_monitoring_id_seq OWNED BY public.knex_migrations_monitoring.id;


--
-- Name: knex_migrations_monitoring_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_monitoring_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_monitoring_lock OWNER TO postgres;

--
-- Name: knex_migrations_monitoring_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_monitoring_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_monitoring_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_monitoring_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_monitoring_lock_index_seq OWNED BY public.knex_migrations_monitoring_lock.index;


--
-- Name: knex_migrations_notification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_notification (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_notification OWNER TO postgres;

--
-- Name: knex_migrations_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_notification_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_notification_id_seq OWNED BY public.knex_migrations_notification.id;


--
-- Name: knex_migrations_notification_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_notification_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_notification_lock OWNER TO postgres;

--
-- Name: knex_migrations_notification_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_notification_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_notification_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_notification_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_notification_lock_index_seq OWNED BY public.knex_migrations_notification_lock.index;


--
-- Name: knex_migrations_payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_payment (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_payment OWNER TO postgres;

--
-- Name: knex_migrations_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_payment_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_payment_id_seq OWNED BY public.knex_migrations_payment.id;


--
-- Name: knex_migrations_payment_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_payment_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_payment_lock OWNER TO postgres;

--
-- Name: knex_migrations_payment_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_payment_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_payment_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_payment_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_payment_lock_index_seq OWNED BY public.knex_migrations_payment_lock.index;


--
-- Name: knex_migrations_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_queue (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_queue OWNER TO postgres;

--
-- Name: knex_migrations_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_queue_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_queue_id_seq OWNED BY public.knex_migrations_queue.id;


--
-- Name: knex_migrations_queue_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_queue_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_queue_lock OWNER TO postgres;

--
-- Name: knex_migrations_queue_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_queue_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_queue_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_queue_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_queue_lock_index_seq OWNED BY public.knex_migrations_queue_lock.index;


--
-- Name: knex_migrations_scanning; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_scanning (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_scanning OWNER TO postgres;

--
-- Name: knex_migrations_scanning_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_scanning_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_scanning_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_scanning_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_scanning_id_seq OWNED BY public.knex_migrations_scanning.id;


--
-- Name: knex_migrations_scanning_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_scanning_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_scanning_lock OWNER TO postgres;

--
-- Name: knex_migrations_scanning_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_scanning_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_scanning_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_scanning_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_scanning_lock_index_seq OWNED BY public.knex_migrations_scanning_lock.index;


--
-- Name: knex_migrations_search; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_search (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_search OWNER TO postgres;

--
-- Name: knex_migrations_search_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_search_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_search_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_search_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_search_id_seq OWNED BY public.knex_migrations_search.id;


--
-- Name: knex_migrations_search_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_search_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_search_lock OWNER TO postgres;

--
-- Name: knex_migrations_search_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_search_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_search_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_search_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_search_lock_index_seq OWNED BY public.knex_migrations_search_lock.index;


--
-- Name: knex_migrations_ticket; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_ticket (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_ticket OWNER TO postgres;

--
-- Name: knex_migrations_ticket_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_ticket_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_ticket_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_ticket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_ticket_id_seq OWNED BY public.knex_migrations_ticket.id;


--
-- Name: knex_migrations_ticket_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_ticket_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_ticket_lock OWNER TO postgres;

--
-- Name: knex_migrations_ticket_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_ticket_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_ticket_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_ticket_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_ticket_lock_index_seq OWNED BY public.knex_migrations_ticket_lock.index;


--
-- Name: knex_migrations_venue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_venue (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations_venue OWNER TO postgres;

--
-- Name: knex_migrations_venue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_venue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_venue_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_venue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_venue_id_seq OWNED BY public.knex_migrations_venue.id;


--
-- Name: knex_migrations_venue_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_venue_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_venue_lock OWNER TO postgres;

--
-- Name: knex_migrations_venue_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_venue_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_venue_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_venue_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_venue_lock_index_seq OWNED BY public.knex_migrations_venue_lock.index;


--
-- Name: known_scalpers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.known_scalpers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    device_fingerprint character varying(255),
    reason text,
    confidence_score numeric(3,2),
    added_by character varying(255),
    active boolean DEFAULT true,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.known_scalpers OWNER TO postgres;

--
-- Name: manual_review_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.manual_review_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    verification_id uuid,
    review_type character varying(255) NOT NULL,
    priority character varying(255) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    assigned_to uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    notes text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.manual_review_queue OWNER TO postgres;

--
-- Name: marketplace_blacklist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_blacklist (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    wallet_address character varying(255),
    reason text NOT NULL,
    banned_by uuid NOT NULL,
    banned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);


ALTER TABLE public.marketplace_blacklist OWNER TO postgres;

--
-- Name: marketplace_disputes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_disputes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transfer_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    filed_by uuid NOT NULL,
    filed_against uuid NOT NULL,
    dispute_type text NOT NULL,
    description text NOT NULL,
    evidence_urls text[],
    status text DEFAULT 'open'::text NOT NULL,
    resolution_notes text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    refund_amount integer,
    refund_transaction_id character varying(255),
    filed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT marketplace_disputes_dispute_type_check CHECK ((dispute_type = ANY (ARRAY['payment_not_received'::text, 'ticket_not_transferred'::text, 'fraudulent_listing'::text, 'price_dispute'::text, 'other'::text]))),
    CONSTRAINT marketplace_disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text, 'closed'::text])))
);


ALTER TABLE public.marketplace_disputes OWNER TO postgres;

--
-- Name: marketplace_listings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_listings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    event_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    price integer NOT NULL,
    original_face_value integer NOT NULL,
    price_multiplier numeric(5,2),
    status text DEFAULT 'active'::text NOT NULL,
    listed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    sold_at timestamp with time zone,
    expires_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    listing_signature character varying(255),
    wallet_address character varying(255) NOT NULL,
    program_address character varying(255),
    requires_approval boolean DEFAULT false,
    approved_at timestamp with time zone,
    approved_by uuid,
    approval_notes text,
    view_count integer DEFAULT 0,
    favorite_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT marketplace_listings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'sold'::text, 'cancelled'::text, 'expired'::text, 'pending_approval'::text])))
);


ALTER TABLE public.marketplace_listings OWNER TO postgres;

--
-- Name: marketplace_price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_price_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    listing_id uuid NOT NULL,
    event_id uuid NOT NULL,
    old_price integer NOT NULL,
    new_price integer NOT NULL,
    price_change integer,
    changed_by uuid NOT NULL,
    change_reason character varying(255),
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.marketplace_price_history OWNER TO postgres;

--
-- Name: marketplace_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_transfers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    event_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    buyer_wallet character varying(255) NOT NULL,
    seller_wallet character varying(255) NOT NULL,
    transfer_signature character varying(255) NOT NULL,
    block_height integer,
    payment_currency text NOT NULL,
    payment_amount numeric(20,6),
    usd_value integer NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    initiated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    network_fee numeric(20,6),
    network_fee_usd integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT marketplace_transfers_payment_currency_check CHECK ((payment_currency = ANY (ARRAY['USDC'::text, 'SOL'::text]))),
    CONSTRAINT marketplace_transfers_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'pending'::text, 'completed'::text, 'failed'::text, 'disputed'::text])))
);


ALTER TABLE public.marketplace_transfers OWNER TO postgres;

--
-- Name: metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.metrics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    metric_name character varying(255) NOT NULL,
    service_name character varying(255) NOT NULL,
    value numeric(8,2) NOT NULL,
    metric_type character varying(50),
    unit character varying(50),
    service character varying(255),
    labels jsonb,
    tags jsonb,
    "timestamp" timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.metrics OWNER TO postgres;

--
-- Name: ml_fraud_models; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ml_fraud_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_name character varying(255) NOT NULL,
    model_version character varying(50) NOT NULL,
    model_type character varying(50) NOT NULL,
    description text,
    features jsonb NOT NULL,
    hyperparameters jsonb,
    accuracy numeric(5,4),
    "precision" numeric(5,4),
    recall numeric(5,4),
    f1_score numeric(5,4),
    training_samples integer,
    status character varying(50) DEFAULT 'training'::character varying NOT NULL,
    trained_at timestamp with time zone,
    deployed_at timestamp with time zone,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ml_fraud_models OWNER TO postgres;

--
-- Name: ml_fraud_predictions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ml_fraud_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_id uuid NOT NULL,
    transaction_id uuid,
    user_id uuid NOT NULL,
    fraud_probability numeric(5,4) NOT NULL,
    predicted_class character varying(20) NOT NULL,
    feature_values jsonb NOT NULL,
    feature_importance jsonb,
    prediction_time_ms integer,
    actual_fraud boolean,
    feedback_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ml_fraud_predictions OWNER TO postgres;

--
-- Name: nft_mint_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nft_mint_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    ticket_ids uuid[] NOT NULL,
    venue_id uuid NOT NULL,
    event_id uuid NOT NULL,
    blockchain character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'queued'::character varying,
    priority character varying(20) DEFAULT 'standard'::character varying,
    transaction_hash character varying(255),
    gas_fee_paid numeric(10,6),
    mint_batch_id character varying(255),
    attempts integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.nft_mint_queue OWNER TO postgres;

--
-- Name: nft_mints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nft_mints (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id character varying(255) NOT NULL,
    mint_address character varying(255) NOT NULL,
    metadata jsonb,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.nft_mints OWNER TO postgres;

--
-- Name: nft_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nft_transfers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    token_address character varying(255) NOT NULL,
    from_address character varying(255) NOT NULL,
    to_address character varying(255) NOT NULL,
    amount numeric(8,2) DEFAULT '1'::numeric NOT NULL,
    signature character varying(255),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.nft_transfers OWNER TO postgres;

--
-- Name: notification_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_analytics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date date NOT NULL,
    hour integer NOT NULL,
    channel character varying(20) NOT NULL,
    type character varying(50),
    provider character varying(50),
    total_sent integer DEFAULT 0,
    total_delivered integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    total_bounced integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    avg_delivery_time_ms integer,
    min_delivery_time_ms integer,
    max_delivery_time_ms integer,
    total_cost integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_analytics_hour_check CHECK (((hour >= 0) AND (hour <= 23)))
);


ALTER TABLE public.notification_analytics OWNER TO postgres;

--
-- Name: notification_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_campaigns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    type text NOT NULL,
    channel text NOT NULL,
    template_id uuid,
    segment_id uuid,
    audience_filter jsonb,
    scheduled_for timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    is_ab_test boolean DEFAULT false,
    ab_test_id uuid,
    ab_variant character varying(10),
    stats_total integer DEFAULT 0,
    stats_sent integer DEFAULT 0,
    stats_delivered integer DEFAULT 0,
    stats_failed integer DEFAULT 0,
    stats_opened integer DEFAULT 0,
    stats_clicked integer DEFAULT 0,
    stats_converted integer DEFAULT 0,
    stats_unsubscribed integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_campaigns_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'push'::text, 'webhook'::text]))),
    CONSTRAINT notification_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'completed'::text, 'cancelled'::text, 'paused'::text]))),
    CONSTRAINT notification_campaigns_type_check CHECK ((type = ANY (ARRAY['transactional'::text, 'marketing'::text, 'system'::text])))
);


ALTER TABLE public.notification_campaigns OWNER TO postgres;

--
-- Name: notification_clicks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_clicks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    link_id character varying(100),
    original_url text,
    clicked_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address inet,
    user_agent text
);


ALTER TABLE public.notification_clicks OWNER TO postgres;

--
-- Name: notification_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_costs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    notification_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    provider character varying(50) NOT NULL,
    cost integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    billing_period character varying(20),
    is_platform_cost boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_costs OWNER TO postgres;

--
-- Name: notification_delivery_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_delivery_stats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date date NOT NULL,
    channel character varying(20) NOT NULL,
    provider character varying(50),
    total_sent integer DEFAULT 0,
    total_delivered integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    total_bounced integer DEFAULT 0,
    total_retried integer DEFAULT 0,
    avg_delivery_time_ms integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_delivery_stats OWNER TO postgres;

--
-- Name: notification_engagement; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_engagement (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    action character varying(50) NOT NULL,
    action_timestamp timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_engagement OWNER TO postgres;

--
-- Name: notification_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    channel text NOT NULL,
    type text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    template_name character varying(255),
    subject character varying(500),
    content text,
    recipient_email character varying(255),
    recipient_phone character varying(50),
    recipient_name character varying(255),
    status text DEFAULT 'pending'::text NOT NULL,
    delivery_status character varying(50) DEFAULT 'pending'::character varying,
    delivery_attempts integer DEFAULT 0,
    last_attempt_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_reason text,
    provider_message_id character varying(255),
    provider_response jsonb,
    retry_after timestamp with time zone,
    should_retry boolean DEFAULT true,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    expires_at timestamp with time zone,
    metadata jsonb,
    cost integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_history_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'push'::text, 'webhook'::text]))),
    CONSTRAINT notification_history_priority_check CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text, 'low'::text]))),
    CONSTRAINT notification_history_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'bounced'::text, 'delivered'::text]))),
    CONSTRAINT notification_history_type_check CHECK ((type = ANY (ARRAY['transactional'::text, 'marketing'::text, 'system'::text])))
);


ALTER TABLE public.notification_history OWNER TO postgres;

--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_log (
    id integer NOT NULL,
    type character varying(20),
    recipient character varying(255),
    subject character varying(255),
    message text,
    template character varying(100),
    status character varying(20),
    error_message text,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_log OWNER TO postgres;

--
-- Name: notification_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notification_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notification_log_id_seq OWNER TO postgres;

--
-- Name: notification_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notification_log_id_seq OWNED BY public.notification_log.id;


--
-- Name: notification_preference_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_preference_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    changed_by uuid,
    changes jsonb NOT NULL,
    reason character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_preference_history OWNER TO postgres;

--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    email_enabled boolean DEFAULT true,
    sms_enabled boolean DEFAULT false,
    push_enabled boolean DEFAULT true,
    email_payment boolean DEFAULT true,
    email_marketing boolean DEFAULT false,
    email_event_updates boolean DEFAULT true,
    email_account boolean DEFAULT true,
    sms_critical_only boolean DEFAULT true,
    sms_payment boolean DEFAULT true,
    sms_event_reminders boolean DEFAULT true,
    push_payment boolean DEFAULT true,
    push_event_updates boolean DEFAULT true,
    push_marketing boolean DEFAULT false,
    quiet_hours_enabled boolean DEFAULT false,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    max_emails_per_day integer DEFAULT 50,
    max_sms_per_day integer DEFAULT 10,
    unsubscribe_token character varying(255) DEFAULT (gen_random_uuid())::text,
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_preferences OWNER TO postgres;

--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid,
    name character varying(255) NOT NULL,
    channel text NOT NULL,
    type text NOT NULL,
    subject character varying(500),
    content text NOT NULL,
    html_content text,
    variables text[],
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_templates_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'push'::text, 'webhook'::text]))),
    CONSTRAINT notification_templates_type_check CHECK ((type = ANY (ARRAY['transactional'::text, 'marketing'::text, 'system'::text])))
);


ALTER TABLE public.notification_templates OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid,
    user_id uuid,
    type character varying(255) NOT NULL,
    priority character varying(255) DEFAULT 'medium'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: oauth_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oauth_connections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.oauth_connections OWNER TO postgres;

--
-- Name: ofac_checks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ofac_checks (
    id integer NOT NULL,
    venue_id character varying(255),
    name_checked character varying(255),
    is_match boolean,
    confidence integer,
    matched_name character varying(255),
    reviewed boolean DEFAULT false,
    review_notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ofac_checks OWNER TO postgres;

--
-- Name: ofac_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ofac_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ofac_checks_id_seq OWNER TO postgres;

--
-- Name: ofac_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ofac_checks_id_seq OWNED BY public.ofac_checks.id;


--
-- Name: ofac_sdn_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ofac_sdn_list (
    id integer NOT NULL,
    uid character varying(50),
    full_name character varying(255),
    first_name character varying(100),
    last_name character varying(100),
    sdn_type character varying(50),
    programs jsonb,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ofac_sdn_list OWNER TO postgres;

--
-- Name: ofac_sdn_list_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ofac_sdn_list_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ofac_sdn_list_id_seq OWNER TO postgres;

--
-- Name: ofac_sdn_list_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ofac_sdn_list_id_seq OWNED BY public.ofac_sdn_list.id;


--
-- Name: offline_validation_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_validation_cache (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    event_id uuid NOT NULL,
    validation_hash character varying(255) NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    ticket_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.offline_validation_cache OWNER TO postgres;

--
-- Name: order_discounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_discounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    discount_id uuid NOT NULL,
    discount_code character varying(50) NOT NULL,
    amount_cents integer NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_discounts OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    total_price_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    order_number character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    subtotal_cents integer NOT NULL,
    platform_fee_cents integer DEFAULT 0,
    processing_fee_cents integer DEFAULT 0,
    tax_cents integer DEFAULT 0,
    discount_cents integer DEFAULT 0,
    total_cents integer NOT NULL,
    original_total_cents integer,
    ticket_quantity integer NOT NULL,
    discount_codes text[],
    payment_intent_id character varying(255),
    payment_method character varying(50),
    currency character varying(3) DEFAULT 'USD'::character varying,
    idempotency_key character varying(255),
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'AWAITING_MINT'::character varying, 'COMPLETED'::character varying, 'PAYMENT_FAILED'::character varying, 'CANCELLED'::character varying, 'EXPIRED'::character varying, 'MINT_FAILED'::character varying])::text[])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: outbox; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outbox (
    id integer NOT NULL,
    aggregate_id uuid NOT NULL,
    aggregate_type character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    attempts integer DEFAULT 0,
    last_attempt_at timestamp with time zone,
    last_error text,
    tenant_id uuid,
    retry_count integer DEFAULT 0
);


ALTER TABLE public.outbox OWNER TO postgres;

--
-- Name: outbox_dlq; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outbox_dlq (
    id integer NOT NULL,
    original_id integer,
    aggregate_id uuid NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0,
    last_error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    moved_to_dlq_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.outbox_dlq OWNER TO postgres;

--
-- Name: outbox_dlq_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.outbox_dlq_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outbox_dlq_id_seq OWNER TO postgres;

--
-- Name: outbox_dlq_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.outbox_dlq_id_seq OWNED BY public.outbox_dlq.id;


--
-- Name: outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.outbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outbox_id_seq OWNER TO postgres;

--
-- Name: outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.outbox_id_seq OWNED BY public.outbox.id;


--
-- Name: payment_escrows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_escrows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    seller_payout numeric(10,2) NOT NULL,
    venue_royalty numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    stripe_payment_intent_id character varying(255),
    status character varying(50) NOT NULL,
    release_conditions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    released_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_escrows_status CHECK (((status)::text = ANY ((ARRAY['created'::character varying, 'funded'::character varying, 'released'::character varying, 'refunded'::character varying, 'disputed'::character varying])::text[])))
);


ALTER TABLE public.payment_escrows OWNER TO postgres;

--
-- Name: payment_event_sequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_event_sequence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    order_id uuid,
    event_type character varying(100) NOT NULL,
    sequence_number bigint NOT NULL,
    event_timestamp timestamp with time zone NOT NULL,
    stripe_event_id character varying(255),
    idempotency_key character varying(255),
    payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_event_sequence OWNER TO postgres;

--
-- Name: payment_idempotency; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_idempotency (
    idempotency_key character varying(255) NOT NULL,
    operation character varying(100) NOT NULL,
    request_hash character varying(64) NOT NULL,
    response jsonb,
    status_code integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.payment_idempotency OWNER TO postgres;

--
-- Name: payment_intents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    stripe_intent_id character varying(255),
    external_id character varying(255),
    client_secret character varying(500),
    processor character varying(50),
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    platform_fee numeric(10,2),
    venue_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    idempotency_key uuid,
    tenant_id uuid,
    last_sequence_number bigint DEFAULT '0'::bigint,
    last_event_timestamp timestamp with time zone,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_intents OWNER TO postgres;

--
-- Name: payment_refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text,
    status character varying(50) DEFAULT 'pending'::character varying,
    stripe_refund_id character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    idempotency_key uuid,
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_refunds OWNER TO postgres;

--
-- Name: payment_retries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_retries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    attempt_number integer,
    status character varying(50),
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_retries OWNER TO postgres;

--
-- Name: payment_state_machine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_state_machine (
    from_state character varying(50) NOT NULL,
    to_state character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    is_valid boolean DEFAULT true
);


ALTER TABLE public.payment_state_machine OWNER TO postgres;

--
-- Name: payment_state_transitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_state_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    order_id uuid,
    from_state character varying(50),
    to_state character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_state_transitions OWNER TO postgres;

--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    status character varying(50) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    venue_payout numeric(10,2) NOT NULL,
    gas_fee_paid numeric(10,4),
    tax_amount numeric(10,2),
    total_amount numeric(10,2),
    stripe_payment_intent_id character varying(255),
    paypal_order_id character varying(255),
    device_fingerprint character varying(255),
    payment_method_fingerprint character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    idempotency_key uuid,
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_transactions_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying, 'partially_refunded'::character varying])::text[])))
);


ALTER TABLE public.payment_transactions OWNER TO postgres;

--
-- Name: payout_methods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payout_methods (
    id integer NOT NULL,
    venue_id character varying(255),
    payout_id character varying(255),
    provider character varying(50),
    status character varying(20),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payout_methods OWNER TO postgres;

--
-- Name: payout_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payout_methods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payout_methods_id_seq OWNER TO postgres;

--
-- Name: payout_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payout_methods_id_seq OWNED BY public.payout_methods.id;


--
-- Name: pending_price_changes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_price_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    current_price integer NOT NULL,
    recommended_price integer NOT NULL,
    confidence numeric(3,2) NOT NULL,
    reasoning jsonb,
    demand_score integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by uuid,
    approval_reason text,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text
);


ALTER TABLE public.pending_price_changes OWNER TO postgres;

--
-- Name: platform_fees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_fees (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transfer_id uuid NOT NULL,
    sale_price integer NOT NULL,
    platform_fee_amount integer NOT NULL,
    platform_fee_percentage numeric(5,2) NOT NULL,
    venue_fee_amount integer NOT NULL,
    venue_fee_percentage numeric(5,2) NOT NULL,
    seller_payout integer NOT NULL,
    platform_fee_wallet character varying(255),
    platform_fee_signature character varying(255),
    venue_fee_wallet character varying(255),
    venue_fee_signature character varying(255),
    platform_fee_collected boolean DEFAULT false,
    venue_fee_paid boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.platform_fees OWNER TO postgres;

--
-- Name: price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    price_cents integer NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    changed_by uuid
);


ALTER TABLE public.price_history OWNER TO postgres;

--
-- Name: qr_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qr_codes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    code text NOT NULL,
    scanned boolean DEFAULT false,
    scanned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.qr_codes OWNER TO postgres;

--
-- Name: queues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(100) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    pending_count integer DEFAULT 0,
    processing_count integer DEFAULT 0,
    completed_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.queues OWNER TO postgres;

--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(255) NOT NULL,
    "limit" integer NOT NULL,
    window_seconds integer NOT NULL,
    current_count integer DEFAULT 0,
    reset_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.rate_limits OWNER TO postgres;

--
-- Name: read_consistency_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.read_consistency_tokens (
    token character varying(255) NOT NULL,
    client_id character varying(255) NOT NULL,
    required_versions jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.read_consistency_tokens OWNER TO postgres;

--
-- Name: reconciliation_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reconciliation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_date date NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    summary jsonb NOT NULL,
    discrepancies jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.reconciliation_reports OWNER TO postgres;

--
-- Name: reservation_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservation_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reservation_id uuid NOT NULL,
    order_id uuid,
    user_id uuid,
    status_from character varying(50),
    status_to character varying(50) NOT NULL,
    reason character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.reservation_history OWNER TO postgres;

--
-- Name: reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    tickets jsonb NOT NULL,
    total_quantity integer NOT NULL,
    ticket_type_id uuid,
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    released_at timestamp with time zone,
    release_reason character varying(255),
    order_id uuid,
    payment_status character varying(50),
    type_name character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reservations_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying, 'EXPIRED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.reservations OWNER TO postgres;

--
-- Name: risk_assessments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.risk_assessments (
    id integer NOT NULL,
    venue_id character varying(255),
    risk_score integer,
    factors jsonb,
    recommendation character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.risk_assessments OWNER TO postgres;

--
-- Name: risk_assessments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.risk_assessments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.risk_assessments_id_seq OWNER TO postgres;

--
-- Name: risk_assessments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.risk_assessments_id_seq OWNED BY public.risk_assessments.id;


--
-- Name: risk_flags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.risk_flags (
    id integer NOT NULL,
    venue_id character varying(255),
    reason text,
    severity character varying(20) DEFAULT 'medium'::character varying,
    resolved boolean DEFAULT false,
    resolution text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.risk_flags OWNER TO postgres;

--
-- Name: risk_flags_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.risk_flags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.risk_flags_id_seq OWNER TO postgres;

--
-- Name: risk_flags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.risk_flags_id_seq OWNED BY public.risk_flags.id;


--
-- Name: royalty_discrepancies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.royalty_discrepancies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reconciliation_run_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    distribution_id uuid,
    discrepancy_type character varying(100) NOT NULL,
    expected_amount numeric(10,2),
    actual_amount numeric(10,2),
    variance numeric(10,2),
    status character varying(50) DEFAULT 'identified'::character varying NOT NULL,
    resolution_notes text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_royalty_discrepancies_status CHECK (((status)::text = ANY ((ARRAY['identified'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'disputed'::character varying, 'closed'::character varying])::text[]))),
    CONSTRAINT chk_royalty_discrepancies_type CHECK (((discrepancy_type)::text = ANY ((ARRAY['missing_distribution'::character varying, 'incorrect_amount'::character varying, 'duplicate_payment'::character varying, 'missing_blockchain_tx'::character varying, 'failed_payout'::character varying, 'calculation_error'::character varying])::text[])))
);


ALTER TABLE public.royalty_discrepancies OWNER TO postgres;

--
-- Name: royalty_distributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.royalty_distributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    event_id uuid NOT NULL,
    transaction_type character varying(50) NOT NULL,
    recipient_type character varying(50) NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_wallet_address character varying(255),
    amount_cents numeric(10,2) NOT NULL,
    percentage numeric(5,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    blockchain_tx_hash character varying(255),
    stripe_transfer_id character varying(255),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_royalty_distributions_recipient_type CHECK (((recipient_type)::text = ANY ((ARRAY['venue'::character varying, 'artist'::character varying, 'platform'::character varying])::text[]))),
    CONSTRAINT chk_royalty_distributions_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'scheduled'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying, 'disputed'::character varying])::text[])))
);


ALTER TABLE public.royalty_distributions OWNER TO postgres;

--
-- Name: royalty_payouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.royalty_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_type character varying(50) NOT NULL,
    amount_cents numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    distribution_count integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    stripe_payout_id character varying(255),
    failure_reason character varying(500),
    metadata jsonb DEFAULT '{}'::jsonb,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_royalty_payouts_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'scheduled'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.royalty_payouts OWNER TO postgres;

--
-- Name: royalty_reconciliation_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.royalty_reconciliation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reconciliation_date date NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    transactions_checked integer DEFAULT 0,
    discrepancies_found integer DEFAULT 0,
    discrepancies_resolved integer DEFAULT 0,
    total_royalties_calculated numeric(12,2) DEFAULT '0'::numeric,
    total_royalties_paid numeric(12,2) DEFAULT '0'::numeric,
    variance_amount numeric(12,2) DEFAULT '0'::numeric,
    status character varying(50) DEFAULT 'running'::character varying NOT NULL,
    duration_ms integer,
    error_message text,
    summary jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_royalty_reconciliation_status CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.royalty_reconciliation_runs OWNER TO postgres;

--
-- Name: scalper_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scalper_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    suspected_scalper_id uuid NOT NULL,
    evidence jsonb,
    description text,
    status character varying(50) DEFAULT 'pending_review'::character varying NOT NULL,
    reviewed_by uuid,
    review_notes text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scalper_reports OWNER TO postgres;

--
-- Name: scan_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scan_policies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    venue_id uuid,
    policy_type character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    config jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scan_policies OWNER TO postgres;

--
-- Name: scan_policy_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scan_policy_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    policy_set jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scan_policy_templates OWNER TO postgres;

--
-- Name: scanner_devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scanner_devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id character varying(255) NOT NULL,
    device_name character varying(255) NOT NULL,
    device_type character varying(50) DEFAULT 'mobile'::character varying,
    venue_id uuid,
    registered_by uuid,
    ip_address character varying(45),
    user_agent text,
    app_version character varying(50),
    can_scan_offline boolean DEFAULT false,
    is_active boolean DEFAULT true,
    last_sync_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoked_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scanner_devices OWNER TO postgres;

--
-- Name: scans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    device_id uuid,
    result character varying(50) NOT NULL,
    reason character varying(100),
    scanned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.scans OWNER TO postgres;

--
-- Name: schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    cron_expression character varying(100) NOT NULL,
    job_type character varying(255) NOT NULL,
    job_data jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    last_run timestamp with time zone,
    next_run timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.schedules OWNER TO postgres;

--
-- Name: settlement_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settlement_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid,
    batch_number character varying(50),
    total_amount numeric(10,2),
    payment_count integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    processed_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.settlement_batches OWNER TO postgres;

--
-- Name: suppression_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppression_list (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    identifier character varying(255) NOT NULL,
    identifier_hash character varying(64) NOT NULL,
    channel text NOT NULL,
    reason character varying(255) NOT NULL,
    suppressed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    suppressed_by uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT suppression_list_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'push'::text, 'webhook'::text])))
);


ALTER TABLE public.suppression_list OWNER TO postgres;

--
-- Name: sync_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(100) NOT NULL,
    sync_type character varying(100) NOT NULL,
    direction character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    success_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    skip_count integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    triggered_by character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sync_logs OWNER TO postgres;

--
-- Name: sync_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sync_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(100) NOT NULL,
    sync_type character varying(100) NOT NULL,
    direction character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    scheduled_for timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_ms integer,
    records_processed integer DEFAULT 0,
    records_succeeded integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.sync_queue OWNER TO postgres;

--
-- Name: tax_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    state_tax numeric(10,2) NOT NULL,
    local_tax numeric(10,2) NOT NULL,
    special_tax numeric(10,2) DEFAULT '0'::numeric,
    total_tax numeric(10,2) NOT NULL,
    jurisdiction character varying(255),
    breakdown jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tax_collections OWNER TO postgres;

--
-- Name: tax_forms_1099da; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_forms_1099da (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tax_year integer NOT NULL,
    form_data jsonb NOT NULL,
    total_proceeds numeric(12,2) NOT NULL,
    transaction_count integer NOT NULL,
    status character varying(50) DEFAULT 'generated'::character varying,
    generated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamp with time zone
);


ALTER TABLE public.tax_forms_1099da OWNER TO postgres;

--
-- Name: tax_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_records (
    id integer NOT NULL,
    venue_id character varying(255) NOT NULL,
    year integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    ticket_id character varying(255),
    event_id character varying(255),
    threshold_reached boolean DEFAULT false,
    form_1099_required boolean DEFAULT false,
    form_1099_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tax_records OWNER TO postgres;

--
-- Name: tax_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tax_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tax_records_id_seq OWNER TO postgres;

--
-- Name: tax_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tax_records_id_seq OWNED BY public.tax_records.id;


--
-- Name: tax_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transfer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    sale_amount integer NOT NULL,
    cost_basis integer,
    capital_gain integer,
    tax_year integer NOT NULL,
    tax_quarter integer,
    transaction_type text NOT NULL,
    tax_category character varying(100),
    reported_to_seller boolean DEFAULT false,
    reported_to_irs boolean DEFAULT false,
    reported_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    transaction_date timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tax_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['short_term'::text, 'long_term'::text])))
);


ALTER TABLE public.tax_transactions OWNER TO postgres;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- Name: ticket_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_transfers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    ticket_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    reason text,
    transfer_code character varying(100),
    transaction_hash character varying(255),
    blockchain_status character varying(50) DEFAULT 'pending'::character varying,
    status character varying(50) DEFAULT 'COMPLETED'::character varying NOT NULL,
    transferred_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.ticket_transfers OWNER TO postgres;

--
-- Name: ticket_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    price_cents integer NOT NULL,
    quantity integer NOT NULL,
    available_quantity integer NOT NULL,
    reserved_quantity integer DEFAULT 0,
    sold_quantity integer DEFAULT 0,
    max_per_purchase integer DEFAULT 4,
    min_per_purchase integer DEFAULT 1,
    sale_start_date timestamp with time zone NOT NULL,
    sale_end_date timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_types OWNER TO postgres;

--
-- Name: ticket_validations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_validations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    ticket_id uuid NOT NULL,
    event_id uuid NOT NULL,
    validated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    validator_id uuid,
    entrance character varying(50),
    device_id character varying(255),
    validation_method character varying(50),
    is_valid boolean DEFAULT true,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.ticket_validations OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    event_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    order_id uuid,
    user_id uuid,
    status character varying(50) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    price_cents integer NOT NULL,
    seat_number character varying(20),
    section character varying(50),
    "row" character varying(10),
    qr_code text,
    qr_code_secret character varying(255),
    qr_code_generated_at timestamp with time zone,
    nft_token_id character varying(255),
    nft_mint_address character varying(255),
    nft_transaction_hash character varying(255),
    nft_minted_at timestamp with time zone,
    blockchain_status character varying(50) DEFAULT 'pending'::character varying,
    payment_id character varying(255),
    payment_intent_id character varying(255),
    purchased_at timestamp with time zone,
    validated_at timestamp with time zone,
    used_at timestamp with time zone,
    validator_id uuid,
    entrance character varying(50),
    device_id character varying(255),
    is_transferable boolean DEFAULT true,
    transfer_locked_until timestamp with time zone,
    transfer_count integer DEFAULT 0,
    transfer_history jsonb DEFAULT '[]'::jsonb,
    barcode character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tickets_status_check CHECK (((status)::text = ANY ((ARRAY['AVAILABLE'::character varying, 'RESERVED'::character varying, 'SOLD'::character varying, 'USED'::character varying, 'CANCELLED'::character varying, 'EXPIRED'::character varying, 'TRANSFERRED'::character varying])::text[])))
);

ALTER TABLE ONLY public.tickets FORCE ROW LEVEL SECURITY;


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: trusted_devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trusted_devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    device_fingerprint character varying(255) NOT NULL,
    trust_score integer DEFAULT 0,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.trusted_devices OWNER TO postgres;

--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_token uuid NOT NULL,
    uploaded_by uuid,
    filename character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    total_size bigint NOT NULL,
    total_chunks integer NOT NULL,
    uploaded_chunks integer DEFAULT 0,
    uploaded_bytes bigint DEFAULT '0'::bigint,
    status character varying(50) DEFAULT 'active'::character varying,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.upload_sessions OWNER TO postgres;

--
-- Name: user_blacklists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_blacklists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    action_type character varying(50) NOT NULL,
    reason text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_blacklists OWNER TO postgres;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp with time zone,
    ip_address character varying(45),
    user_agent text,
    revoked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: user_venue_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_venue_roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    granted_by uuid,
    is_active boolean DEFAULT true,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    granted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by uuid
);


ALTER TABLE public.user_venue_roles OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    email_verification_token character varying(64),
    email_verification_expires timestamp with time zone,
    email_verified_at timestamp with time zone,
    username character varying(30),
    display_name character varying(100),
    bio text,
    avatar_url text,
    cover_image_url text,
    first_name character varying(50),
    last_name character varying(50),
    date_of_birth date,
    phone character varying(20),
    phone_verified boolean DEFAULT false,
    country_code character varying(2),
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    preferred_language character varying(10) DEFAULT 'en'::character varying,
    status text DEFAULT 'PENDING'::text,
    role character varying(20) DEFAULT 'user'::character varying,
    permissions jsonb DEFAULT '[]'::jsonb,
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret character varying(32),
    backup_codes text[],
    mfa_enabled boolean DEFAULT false,
    mfa_secret text,
    last_password_change timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    password_reset_token character varying(64),
    password_reset_expires timestamp with time zone,
    password_changed_at timestamp with time zone,
    last_login_at timestamp with time zone,
    last_login_ip inet,
    last_login_device character varying(255),
    login_count integer DEFAULT 0,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    preferences jsonb DEFAULT '{}'::jsonb,
    notification_preferences jsonb DEFAULT '{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}'::jsonb,
    profile_data jsonb DEFAULT '{}'::jsonb,
    terms_accepted_at timestamp with time zone,
    terms_version character varying(20),
    privacy_accepted_at timestamp with time zone,
    privacy_version character varying(20),
    marketing_consent boolean DEFAULT false,
    marketing_consent_date timestamp with time zone,
    referral_code character varying(20),
    referred_by uuid,
    referral_count integer DEFAULT 0,
    provider character varying(50),
    provider_user_id character varying(255),
    wallet_address character varying(255),
    network character varying(50),
    verified boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[],
    verification_token character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    tenant_id uuid,
    can_receive_transfers boolean DEFAULT true,
    identity_verified boolean DEFAULT false,
    CONSTRAINT check_age_minimum CHECK (((date_of_birth IS NULL) OR (date_of_birth <= (CURRENT_DATE - '13 years'::interval)))),
    CONSTRAINT check_email_lowercase CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT check_referral_not_self CHECK (((referred_by IS NULL) OR (referred_by <> id))),
    CONSTRAINT check_username_format CHECK (((username)::text ~ '^[a-zA-Z0-9_]{3,30}$'::text)),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'DELETED'::text])))
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: velocity_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.velocity_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255) NOT NULL,
    action_type character varying(50) NOT NULL,
    limit_count integer NOT NULL,
    window_minutes integer NOT NULL,
    current_count integer DEFAULT 0,
    window_start timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    window_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.velocity_limits OWNER TO postgres;

--
-- Name: venue_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    amount numeric(12,2) DEFAULT '0'::numeric,
    balance_type character varying(50) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    last_payout_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_balances OWNER TO postgres;

--
-- Name: venue_branding; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_branding (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    primary_color character varying(7) DEFAULT '#667eea'::character varying,
    secondary_color character varying(7) DEFAULT '#764ba2'::character varying,
    accent_color character varying(7) DEFAULT '#f093fb'::character varying,
    text_color character varying(7) DEFAULT '#333333'::character varying,
    background_color character varying(7) DEFAULT '#ffffff'::character varying,
    font_family character varying(100) DEFAULT 'Inter'::character varying,
    heading_font character varying(100),
    logo_url character varying(1000),
    logo_dark_url character varying(1000),
    favicon_url character varying(1000),
    email_header_image character varying(1000),
    ticket_background_image character varying(1000),
    custom_css text,
    email_from_name character varying(200),
    email_reply_to character varying(255),
    email_footer_text text,
    ticket_header_text character varying(200),
    ticket_footer_text character varying(200),
    og_image_url character varying(1000),
    og_description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_branding OWNER TO postgres;

--
-- Name: venue_compliance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_compliance OWNER TO postgres;

--
-- Name: venue_compliance_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    report jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.venue_compliance_reports OWNER TO postgres;

--
-- Name: venue_compliance_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    scheduled_date timestamp with time zone NOT NULL,
    status character varying(255) DEFAULT 'scheduled'::character varying NOT NULL,
    reviewer_id uuid,
    findings jsonb DEFAULT '{}'::jsonb,
    notes text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_compliance_reviews OWNER TO postgres;

--
-- Name: venue_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_integrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(50) NOT NULL,
    integration_name character varying(200),
    config_data jsonb DEFAULT '{}'::jsonb,
    api_key_encrypted text,
    api_secret_encrypted text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_integrations OWNER TO postgres;

--
-- Name: venue_layouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_layouts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    type character varying(50) NOT NULL,
    sections jsonb,
    capacity integer NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


ALTER TABLE public.venue_layouts OWNER TO postgres;

--
-- Name: venue_marketplace_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_marketplace_settings (
    venue_id uuid NOT NULL,
    max_resale_multiplier numeric(5,2) DEFAULT '3'::numeric,
    min_price_multiplier numeric(5,2) DEFAULT '1'::numeric,
    allow_below_face boolean DEFAULT false,
    transfer_cutoff_hours integer DEFAULT 4,
    listing_advance_hours integer DEFAULT 720,
    auto_expire_on_event_start boolean DEFAULT true,
    max_listings_per_user_per_event integer DEFAULT 8,
    max_listings_per_user_total integer DEFAULT 50,
    require_listing_approval boolean DEFAULT false,
    auto_approve_verified_sellers boolean DEFAULT false,
    royalty_percentage numeric(5,2) DEFAULT '5'::numeric,
    royalty_wallet_address character varying(255) NOT NULL,
    minimum_royalty_payout integer DEFAULT 1000,
    allow_international_sales boolean DEFAULT true,
    blocked_countries text[],
    require_kyc_for_high_value boolean DEFAULT false,
    high_value_threshold integer DEFAULT 100000,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_marketplace_settings OWNER TO postgres;

--
-- Name: venue_notification_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_notification_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    daily_email_limit integer,
    daily_sms_limit integer,
    monthly_email_limit integer,
    monthly_sms_limit integer,
    blocked_channels character varying(20)[],
    default_timezone character varying(50) DEFAULT 'UTC'::character varying,
    quiet_hours_start integer,
    quiet_hours_end integer,
    reply_to_email character varying(255),
    sms_callback_number character varying(50),
    webhook_url text,
    webhook_secret character varying(255),
    custom_branding jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT venue_notification_settings_quiet_hours_end_check CHECK (((quiet_hours_end >= 0) AND (quiet_hours_end <= 23))),
    CONSTRAINT venue_notification_settings_quiet_hours_start_check CHECK (((quiet_hours_start >= 0) AND (quiet_hours_start <= 23)))
);


ALTER TABLE public.venue_notification_settings OWNER TO postgres;

--
-- Name: venue_royalty_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_royalty_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    default_royalty_percentage numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    minimum_payout_amount_cents integer DEFAULT 1000 NOT NULL,
    payout_schedule character varying(20) DEFAULT 'weekly'::character varying NOT NULL,
    stripe_account_id character varying(255),
    payment_method character varying(50) DEFAULT 'stripe'::character varying,
    auto_payout_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_venue_royalty_percentage CHECK (((default_royalty_percentage >= (0)::numeric) AND (default_royalty_percentage <= (100)::numeric)))
);


ALTER TABLE public.venue_royalty_settings OWNER TO postgres;

--
-- Name: venue_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    max_tickets_per_order integer DEFAULT 10,
    ticket_resale_allowed boolean DEFAULT true,
    allow_print_at_home boolean DEFAULT true,
    allow_mobile_tickets boolean DEFAULT true,
    require_id_verification boolean DEFAULT false,
    ticket_transfer_allowed boolean DEFAULT true,
    service_fee_percentage numeric(5,2) DEFAULT '10'::numeric,
    facility_fee_amount numeric(10,2) DEFAULT '5'::numeric,
    processing_fee_percentage numeric(5,2) DEFAULT 2.9,
    payment_methods text[] DEFAULT '{card}'::text[],
    accepted_currencies text[] DEFAULT '{USD}'::text[],
    payout_frequency character varying(20) DEFAULT 'weekly'::character varying,
    minimum_payout_amount numeric(10,2) DEFAULT '100'::numeric,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    dynamic_pricing_enabled boolean DEFAULT false,
    price_min_multiplier numeric(3,2) DEFAULT 0.9,
    price_max_multiplier numeric(3,2) DEFAULT '2'::numeric,
    price_adjustment_frequency integer DEFAULT 60,
    price_require_approval boolean DEFAULT true,
    price_aggressiveness numeric(3,2) DEFAULT 0.5
);


ALTER TABLE public.venue_settings OWNER TO postgres;

--
-- Name: venue_staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_staff (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    permissions text[],
    department character varying(100),
    job_title character varying(100),
    employment_type character varying(50),
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    access_areas text[],
    shift_schedule jsonb,
    pin_code character varying(10),
    contact_email character varying(255),
    contact_phone character varying(20),
    emergency_contact jsonb,
    hourly_rate numeric(10,2),
    commission_percentage numeric(5,2),
    added_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_staff OWNER TO postgres;

--
-- Name: venue_tier_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_tier_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    from_tier character varying(50),
    to_tier character varying(50) NOT NULL,
    reason text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_tier_history OWNER TO postgres;

--
-- Name: venue_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_verifications (
    id integer NOT NULL,
    venue_id character varying(255) NOT NULL,
    ein character varying(20),
    business_name character varying(255),
    business_address text,
    status character varying(50) DEFAULT 'pending'::character varying,
    verification_id character varying(255),
    w9_uploaded boolean DEFAULT false,
    bank_verified boolean DEFAULT false,
    ofac_cleared boolean DEFAULT false,
    risk_score integer DEFAULT 0,
    manual_review_required boolean DEFAULT false,
    manual_review_notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.venue_verifications OWNER TO postgres;

--
-- Name: venue_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.venue_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.venue_verifications_id_seq OWNER TO postgres;

--
-- Name: venue_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.venue_verifications_id_seq OWNED BY public.venue_verifications.id;


--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venues (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    email character varying(255) NOT NULL,
    phone character varying(20),
    website character varying(500),
    address_line1 character varying(255) NOT NULL,
    address_line2 character varying(255),
    city character varying(100) NOT NULL,
    state_province character varying(100) NOT NULL,
    postal_code character varying(20),
    country_code character varying(2) DEFAULT 'US'::character varying NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    timezone character varying(50),
    venue_type character varying(50) NOT NULL,
    max_capacity integer NOT NULL,
    standing_capacity integer,
    seated_capacity integer,
    vip_capacity integer,
    logo_url character varying(1000),
    cover_image_url character varying(1000),
    image_gallery text[],
    virtual_tour_url character varying(1000),
    business_name character varying(200),
    business_registration character varying(100),
    tax_id character varying(50),
    business_type character varying(50),
    wallet_address character varying(44),
    collection_address character varying(44),
    royalty_percentage numeric(5,2) DEFAULT 2.5,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    verification_level character varying(20),
    features text[],
    amenities jsonb,
    accessibility_features text[],
    age_restriction integer DEFAULT 0,
    dress_code text,
    prohibited_items text[],
    cancellation_policy text,
    refund_policy text,
    social_media jsonb,
    average_rating numeric(3,2) DEFAULT '0'::numeric,
    total_reviews integer DEFAULT 0,
    total_events integer DEFAULT 0,
    total_tickets_sold integer DEFAULT 0,
    pricing_tier character varying(50) DEFAULT 'standard'::character varying,
    hide_platform_branding boolean DEFAULT false,
    custom_domain character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[],
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    tenant_id uuid,
    transfer_deadline_hours integer DEFAULT 24
);

ALTER TABLE ONLY public.venues FORCE ROW LEVEL SECURITY;


ALTER TABLE public.venues OWNER TO postgres;

--
-- Name: waiting_room_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waiting_room_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.waiting_room_activity OWNER TO postgres;

--
-- Name: wallet_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_connections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    wallet_address character varying(255) NOT NULL,
    network character varying(50) NOT NULL,
    verified boolean DEFAULT false,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.wallet_connections OWNER TO postgres;

--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying(255) NOT NULL,
    processor character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.webhook_events OWNER TO postgres;

--
-- Name: webhook_inbox; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(50) NOT NULL,
    event_id character varying(255) NOT NULL,
    webhook_id character varying(255),
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    signature character varying(500),
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    attempts integer DEFAULT 0,
    retry_count integer DEFAULT 0,
    error_message text,
    error text,
    last_error text,
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.webhook_inbox OWNER TO postgres;

--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_logs (
    id integer NOT NULL,
    source character varying(50),
    type character varying(100),
    payload jsonb,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.webhook_logs OWNER TO postgres;

--
-- Name: webhook_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.webhook_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.webhook_logs_id_seq OWNER TO postgres;

--
-- Name: webhook_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.webhook_logs_id_seq OWNED BY public.webhook_logs.id;


--
-- Name: webhook_nonces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_nonces (
    nonce character varying(255) NOT NULL,
    endpoint character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.webhook_nonces OWNER TO postgres;

--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    event_type character varying(255) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    retry_count integer DEFAULT 0,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.webhooks OWNER TO postgres;

--
-- Name: white_label_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.white_label_pricing (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tier_name character varying(50) NOT NULL,
    description text,
    monthly_fee numeric(10,2) DEFAULT '0'::numeric,
    service_fee_percentage numeric(5,2) NOT NULL,
    per_ticket_fee numeric(10,2) NOT NULL,
    custom_domain_allowed boolean DEFAULT false,
    hide_platform_branding boolean DEFAULT false,
    custom_css_allowed boolean DEFAULT false,
    white_label_emails boolean DEFAULT false,
    white_label_tickets boolean DEFAULT false,
    priority_support boolean DEFAULT false,
    api_access boolean DEFAULT false,
    max_events_per_month integer,
    max_custom_domains integer DEFAULT 0,
    max_staff_accounts integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.white_label_pricing OWNER TO postgres;

--
-- Name: bank_verifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_verifications ALTER COLUMN id SET DEFAULT nextval('public.bank_verifications_id_seq'::regclass);


--
-- Name: compliance_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audit_log ALTER COLUMN id SET DEFAULT nextval('public.compliance_audit_log_id_seq'::regclass);


--
-- Name: compliance_batch_jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_batch_jobs ALTER COLUMN id SET DEFAULT nextval('public.compliance_batch_jobs_id_seq'::regclass);


--
-- Name: compliance_documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_documents ALTER COLUMN id SET DEFAULT nextval('public.compliance_documents_id_seq'::regclass);


--
-- Name: compliance_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings ALTER COLUMN id SET DEFAULT nextval('public.compliance_settings_id_seq'::regclass);


--
-- Name: form_1099_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_1099_records ALTER COLUMN id SET DEFAULT nextval('public.form_1099_records_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_analytics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_analytics ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_analytics_id_seq'::regclass);


--
-- Name: knex_migrations_analytics_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_analytics_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_analytics_lock_index_seq'::regclass);


--
-- Name: knex_migrations_auth id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_auth_id_seq'::regclass);


--
-- Name: knex_migrations_auth_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_auth_lock_index_seq'::regclass);


--
-- Name: knex_migrations_compliance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_compliance ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_compliance_id_seq'::regclass);


--
-- Name: knex_migrations_compliance_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_compliance_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_compliance_lock_index_seq'::regclass);


--
-- Name: knex_migrations_event id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_event_id_seq'::regclass);


--
-- Name: knex_migrations_event_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_event_lock_index_seq'::regclass);


--
-- Name: knex_migrations_files id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_files ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_files_id_seq'::regclass);


--
-- Name: knex_migrations_files_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_files_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_files_lock_index_seq'::regclass);


--
-- Name: knex_migrations_integration id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_integration ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_integration_id_seq'::regclass);


--
-- Name: knex_migrations_integration_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_integration_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_integration_lock_index_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: knex_migrations_marketplace id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_marketplace ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_marketplace_id_seq'::regclass);


--
-- Name: knex_migrations_marketplace_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_marketplace_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_marketplace_lock_index_seq'::regclass);


--
-- Name: knex_migrations_monitoring id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_monitoring ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_monitoring_id_seq'::regclass);


--
-- Name: knex_migrations_monitoring_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_monitoring_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_monitoring_lock_index_seq'::regclass);


--
-- Name: knex_migrations_notification id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_notification ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_notification_id_seq'::regclass);


--
-- Name: knex_migrations_notification_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_notification_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_notification_lock_index_seq'::regclass);


--
-- Name: knex_migrations_payment id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_payment ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_payment_id_seq'::regclass);


--
-- Name: knex_migrations_payment_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_payment_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_payment_lock_index_seq'::regclass);


--
-- Name: knex_migrations_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_queue ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_queue_id_seq'::regclass);


--
-- Name: knex_migrations_queue_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_queue_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_queue_lock_index_seq'::regclass);


--
-- Name: knex_migrations_scanning id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_scanning ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_scanning_id_seq'::regclass);


--
-- Name: knex_migrations_scanning_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_scanning_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_scanning_lock_index_seq'::regclass);


--
-- Name: knex_migrations_search id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_search ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_search_id_seq'::regclass);


--
-- Name: knex_migrations_search_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_search_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_search_lock_index_seq'::regclass);


--
-- Name: knex_migrations_ticket id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_ticket ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_ticket_id_seq'::regclass);


--
-- Name: knex_migrations_ticket_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_ticket_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_ticket_lock_index_seq'::regclass);


--
-- Name: knex_migrations_venue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_venue_id_seq'::regclass);


--
-- Name: knex_migrations_venue_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_venue_lock_index_seq'::regclass);


--
-- Name: notification_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_log ALTER COLUMN id SET DEFAULT nextval('public.notification_log_id_seq'::regclass);


--
-- Name: ofac_checks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ofac_checks ALTER COLUMN id SET DEFAULT nextval('public.ofac_checks_id_seq'::regclass);


--
-- Name: ofac_sdn_list id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ofac_sdn_list ALTER COLUMN id SET DEFAULT nextval('public.ofac_sdn_list_id_seq'::regclass);


--
-- Name: outbox id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outbox ALTER COLUMN id SET DEFAULT nextval('public.outbox_id_seq'::regclass);


--
-- Name: outbox_dlq id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outbox_dlq ALTER COLUMN id SET DEFAULT nextval('public.outbox_dlq_id_seq'::regclass);


--
-- Name: payout_methods id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_methods ALTER COLUMN id SET DEFAULT nextval('public.payout_methods_id_seq'::regclass);


--
-- Name: risk_assessments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.risk_assessments ALTER COLUMN id SET DEFAULT nextval('public.risk_assessments_id_seq'::regclass);


--
-- Name: risk_flags id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.risk_flags ALTER COLUMN id SET DEFAULT nextval('public.risk_flags_id_seq'::regclass);


--
-- Name: tax_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_records ALTER COLUMN id SET DEFAULT nextval('public.tax_records_id_seq'::regclass);


--
-- Name: venue_verifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_verifications ALTER COLUMN id SET DEFAULT nextval('public.venue_verifications_id_seq'::regclass);


--
-- Name: webhook_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs ALTER COLUMN id SET DEFAULT nextval('public.webhook_logs_id_seq'::regclass);


--
-- Data for Name: ab_test_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ab_test_variants (id, ab_test_id, variant_name, template_id, variant_data, sent_count, opened_count, clicked_count, converted_count, open_rate, click_rate, conversion_rate, created_at) FROM stdin;
\.


--
-- Data for Name: ab_tests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ab_tests (id, venue_id, name, description, test_type, variant_count, sample_size_per_variant, winning_metric, winner_variant_id, status, started_at, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: abandoned_carts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.abandoned_carts (id, user_id, venue_id, event_id, cart_items, total_amount_cents, abandoned_at, recovery_email_sent, recovery_email_sent_at, converted, converted_at, order_id, created_at) FROM stdin;
\.


--
-- Data for Name: account_takeover_signals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_takeover_signals (id, user_id, session_id, signal_type, risk_score, signal_data, is_anomaly, "timestamp") FROM stdin;
\.


--
-- Data for Name: alert_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alerts (id, name, type, severity, message, source, metadata, resolved, resolved_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_aggregations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_aggregations (id, tenant_id, aggregation_type, metric_type, entity_type, entity_id, dimensions, time_period, period_start, period_end, value, unit, sample_count, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_alerts (id, tenant_id, alert_type, severity, metric_type, entity_type, entity_id, threshold_config, current_value, threshold_value, status, message, metadata, triggered_at, resolved_at, resolved_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_dashboards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_dashboards (id, tenant_id, name, description, type, layout, filters, visibility, created_by, is_default, display_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_exports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_exports (id, tenant_id, export_type, format, status, parameters, file_path, file_url, file_size, expires_at, requested_by, error_message, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_metrics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_metrics (id, tenant_id, metric_type, entity_type, entity_id, dimensions, value, unit, metadata, "timestamp", created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: analytics_widgets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_widgets (id, tenant_id, dashboard_id, widget_type, title, description, configuration, data_source, "position", size, style, refresh_interval, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: anti_bot_activities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.anti_bot_activities (id, user_id, action_type, ip_address, user_agent, "timestamp", metadata) FROM stdin;
\.


--
-- Data for Name: anti_bot_violations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.anti_bot_violations (id, user_id, reason, severity, flagged_at) FROM stdin;
\.


--
-- Data for Name: audience_segments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audience_segments (id, venue_id, name, description, filter_criteria, member_count, last_calculated_at, is_dynamic, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, status, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: bank_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bank_verifications (id, venue_id, account_last_four, routing_number, verified, account_name, account_type, plaid_request_id, plaid_item_id, created_at) FROM stdin;
\.


--
-- Data for Name: behavioral_analytics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.behavioral_analytics (id, user_id, session_id, event_type, page_url, event_data, time_on_page_ms, mouse_movements, keystrokes, copy_paste_detected, form_autofill_detected, "timestamp") FROM stdin;
\.


--
-- Data for Name: biometric_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_credentials (id, user_id, device_id, public_key, credential_type, created_at) FROM stdin;
\.


--
-- Data for Name: bot_detections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bot_detections (id, user_id, session_id, is_bot, confidence, indicators, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: card_fingerprints; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.card_fingerprints (id, card_fingerprint, bin, last4, card_brand, issuing_bank, card_type, successful_purchases, failed_purchases, chargeback_count, fraud_count, total_amount_spent, risk_level, first_used, last_used, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: compliance_audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_audit_log (id, action, entity_type, entity_id, user_id, ip_address, user_agent, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: compliance_batch_jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_batch_jobs (id, job_type, status, progress, total_items, completed_items, error_count, started_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: compliance_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_documents (id, document_id, venue_id, document_type, filename, original_name, storage_path, s3_url, uploaded_by, verified, created_at) FROM stdin;
\.


--
-- Data for Name: compliance_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_settings (id, key, value, description, updated_at) FROM stdin;
1	tax_threshold	600	IRS 1099-K threshold	2025-11-10 21:25:56.395903+00
2	high_risk_score	70	Score above which venues are blocked	2025-11-10 21:25:56.395903+00
3	review_required_score	50	Score requiring manual review	2025-11-10 21:25:56.395903+00
4	ofac_update_enabled	true	Auto-update OFAC list daily	2025-11-10 21:25:56.395903+00
5	auto_approve_low_risk	false	Auto-approve venues with score < 20	2025-11-10 21:25:56.395903+00
\.


--
-- Data for Name: connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.connections (id, integration_id, user_id, venue_id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, metadata, last_sync_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: consent_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.consent_records (id, customer_id, venue_id, channel, type, status, granted_at, revoked_at, expires_at, source, ip_address, user_agent, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: custom_domains; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_domains (id, venue_id, domain, verification_token, verification_method, is_verified, verified_at, ssl_status, ssl_provider, ssl_issued_at, ssl_expires_at, ssl_error_message, required_dns_records, current_dns_records, status, error_message, last_checked_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_lifetime_value; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_lifetime_value (id, customer_id, venue_id, tenant_id, clv, avg_order_value, purchase_frequency, customer_lifespan_days, total_purchases, total_revenue, predicted_clv_12_months, predicted_clv_24_months, churn_probability, calculated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_rfm_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_rfm_scores (id, customer_id, venue_id, tenant_id, recency_score, frequency_score, monetary_score, total_score, days_since_last_purchase, total_purchases, total_spent, average_order_value, segment, churn_risk, calculated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_segments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_segments (id, venue_id, tenant_id, segment_name, customer_count, total_revenue, avg_order_value, avg_lifetime_value, avg_purchase_frequency, last_calculated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dashboards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboards (id, name, description, widgets, layout, owner, shared, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: device_activity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.device_activity (id, device_fingerprint, user_id, activity_type, metadata, "timestamp") FROM stdin;
\.


--
-- Data for Name: devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.devices (id, device_id, name, zone, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: discounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.discounts (id, tenant_id, code, description, type, value_cents, value_percentage, priority, stackable, max_uses, current_uses, max_uses_per_user, min_purchase_cents, max_discount_cents, valid_from, valid_until, event_id, ticket_type_ids, active, last_used_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: email_automation_triggers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_automation_triggers (id, venue_id, name, trigger_type, template_id, trigger_conditions, delay_minutes, is_active, sent_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: email_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_queue (id, to_email, subject, template, data, priority, status, attempts, error_message, sent_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_capacity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_capacity (id, tenant_id, event_id, schedule_id, section_name, section_code, tier, total_capacity, available_capacity, reserved_capacity, buffer_capacity, sold_count, pending_count, reserved_at, reserved_expires_at, locked_price_data, row_config, seat_map, is_active, is_visible, minimum_purchase, maximum_purchase, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_categories (id, parent_id, name, slug, description, icon, color, display_order, is_active, is_featured, meta_title, meta_description, event_count, created_at, updated_at) FROM stdin;
156fea2a-f779-4dfd-b871-fe663a91d3db	\N	Music	music	\N	music	#FF6B6B	1	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
860ada7e-8215-4a86-8a46-e7353c815e1c	\N	Sports	sports	\N	sports	#4ECDC4	2	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
08fbb217-8a1b-4c55-8f4d-db4bdeb7fee1	\N	Theater	theater	\N	theater	#95E1D3	3	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
4b432825-a520-4162-8cb1-128befab92cf	\N	Comedy	comedy	\N	comedy	#F38181	4	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
1492cd84-e0b9-4e73-b935-f2d3c7e031c9	\N	Arts	arts	\N	arts	#AA96DA	5	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
cb485ced-7802-44a3-967b-ea85c6ffe20f	\N	Conference	conference	\N	conference	#FCBAD3	6	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
1493b9dd-dc64-4f7f-89d4-562fc1b29d6f	\N	Workshop	workshop	\N	workshop	#A8D8EA	7	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
ee9d166d-3f25-4c07-8b98-668c03bfef91	\N	Festival	festival	\N	festival	#FFD93D	8	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
ba515f4c-403f-48ee-aa57-8d510ecce7c4	\N	Family	family	\N	family	#6BCB77	9	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
5265e2d5-340f-4707-a5af-6a7b94055775	\N	Nightlife	nightlife	\N	nightlife	#C780FA	10	t	f	\N	\N	0	2025-11-09 00:13:46.068564+00	2025-11-09 00:13:46.068564+00
\.


--
-- Data for Name: event_metadata; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_metadata (id, tenant_id, event_id, performers, headliner, supporting_acts, production_company, technical_requirements, stage_setup_time_hours, sponsors, primary_sponsor, performance_rights_org, licensing_requirements, insurance_requirements, press_release, marketing_copy, social_media_copy, sound_requirements, lighting_requirements, video_requirements, catering_requirements, rider_requirements, production_budget, marketing_budget, projected_revenue, break_even_capacity, previous_events, custom_fields, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_pricing (id, tenant_id, event_id, schedule_id, capacity_id, name, description, tier, base_price, service_fee, facility_fee, tax_rate, is_dynamic, min_price, max_price, price_adjustment_rules, current_price, early_bird_price, early_bird_ends_at, last_minute_price, last_minute_starts_at, group_size_min, group_discount_percentage, currency, sales_start_at, sales_end_at, max_per_order, max_per_customer, is_active, is_visible, display_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_purchase_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_purchase_limits (event_id, purchase_limit_per_user, purchase_limit_per_payment_method, purchase_limit_per_address, max_tickets_per_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_royalty_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_royalty_settings (id, event_id, venue_royalty_percentage, artist_royalty_percentage, artist_wallet_address, artist_stripe_account_id, override_venue_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_schedules (id, tenant_id, event_id, starts_at, ends_at, doors_open_at, is_recurring, recurrence_rule, recurrence_end_date, occurrence_number, timezone, utc_offset, status, status_reason, capacity_override, check_in_opens_at, check_in_closes_at, notes, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (id, tenant_id, venue_id, venue_layout_id, name, slug, description, short_description, event_type, primary_category_id, secondary_category_ids, tags, status, visibility, is_featured, priority_score, banner_image_url, thumbnail_image_url, image_gallery, video_url, virtual_event_url, age_restriction, dress_code, special_requirements, accessibility_info, collection_address, mint_authority, royalty_percentage, is_virtual, is_hybrid, streaming_platform, streaming_config, cancellation_policy, refund_policy, cancellation_deadline_hours, meta_title, meta_description, meta_keywords, view_count, interest_count, share_count, external_id, metadata, created_by, updated_by, created_at, updated_at, deleted_at, start_date, end_date, allow_transfers, max_transfers_per_ticket, transfer_blackout_start, transfer_blackout_end, require_identity_verification) FROM stdin;
\.


--
-- Data for Name: external_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.external_verifications (id, venue_id, provider, verification_type, external_id, status, metadata, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: field_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.field_mappings (id, connection_id, source_field, target_field, transform_rule, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: file_access_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.file_access_logs (id, file_id, accessed_by, access_type, ip_address, user_agent, response_code, bytes_sent, accessed_at) FROM stdin;
\.


--
-- Data for Name: file_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.file_versions (id, file_id, version_number, storage_path, size_bytes, hash_sha256, change_description, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.files (id, filename, original_filename, mime_type, extension, storage_provider, bucket_name, storage_path, cdn_url, size_bytes, hash_sha256, uploaded_by, entity_type, entity_id, is_public, access_level, status, processing_error, metadata, tags, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: form_1099_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_1099_records (id, venue_id, year, form_type, gross_amount, transaction_count, form_data, sent_to_irs, sent_to_venue, generated_at, created_at) FROM stdin;
\.


--
-- Data for Name: fraud_checks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fraud_checks (id, user_id, payment_id, device_fingerprint, ip_address, score, risk_score, signals, reasons, decision, check_type, "timestamp", created_at) FROM stdin;
\.


--
-- Data for Name: fraud_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fraud_events (id, user_id, pattern, risk_level, "timestamp", data, investigated, investigated_at, created_at) FROM stdin;
\.


--
-- Data for Name: fraud_review_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fraud_review_queue (id, user_id, payment_id, fraud_check_id, reason, priority, status, assigned_to, reviewer_notes, review_metadata, reviewed_at, decision, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: fraud_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fraud_rules (id, rule_name, description, rule_type, conditions, action, priority, is_active, trigger_count, block_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: group_payment_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.group_payment_members (id, group_payment_id, user_id, email, name, amount_due, ticket_count, paid, paid_at, payment_id, reminders_sent, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: group_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.group_payments (id, organizer_id, event_id, total_amount, ticket_selections, status, expires_at, completed_at, cancelled_at, cancellation_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: idempotency_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.idempotency_keys (key, response, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: index_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.index_queue (id, entity_type, entity_id, operation, payload, priority, version, idempotency_key, processed_at, created_at) FROM stdin;
\.


--
-- Data for Name: index_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.index_versions (id, entity_type, entity_id, version, indexed_at, index_status, retry_count, last_error, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: integration_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integration_configs (id, venue_id, integration_type, status, health_status, access_token_encrypted, refresh_token_encrypted, api_key_encrypted, api_secret_encrypted, token_expires_at, last_token_refresh, config, field_mappings, template_id, template_applied_at, scopes, oauth_state, last_sync_at, last_sync_status, last_sync_error, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: integration_costs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integration_costs (id, venue_id, integration_type, period_start, period_end, api_calls, data_synced_mb, webhook_events, api_cost, storage_cost, webhook_cost, total_cost, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: integration_health; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integration_health (id, venue_id, integration_type, status, success_rate, avg_response_time, error_count_24h, total_requests_24h, last_check_at, last_error, last_error_type, uptime_percentage, last_outage_at, outage_count_30d, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: integration_webhooks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integration_webhooks (id, venue_id, integration_type, event_type, event_id, external_id, payload, headers, signature, status, retry_count, processing_error, processed_at, received_at, created_at) FROM stdin;
\.


--
-- Data for Name: integrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integrations (id, name, provider, category, status, config, credentials_encrypted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: invalidated_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invalidated_tokens (token, user_id, invalidated_at, expires_at) FROM stdin;
\.


--
-- Data for Name: ip_reputation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ip_reputation (ip_address, risk_score, reputation_status, fraud_count, total_transactions, is_proxy, is_vpn, is_tor, is_datacenter, country_code, asn, geo_data, last_seen, first_seen, blocked_at, blocked_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jobs (id, queue, type, data, status, attempts, max_attempts, error, scheduled_for, started_at, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations (id, name, batch, migration_time) FROM stdin;
\.


--
-- Data for Name: knex_migrations_analytics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_analytics (id, name, batch, migration_time) FROM stdin;
1	001_analytics_baseline.ts	1	2025-11-08 22:24:16.993+00
\.


--
-- Data for Name: knex_migrations_analytics_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_analytics_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_auth; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_auth (id, name, batch, migration_time) FROM stdin;
1	001_auth_baseline.ts	1	2025-11-08 21:07:55.159+00
\.


--
-- Data for Name: knex_migrations_auth_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_auth_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_compliance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_compliance (id, name, batch, migration_time) FROM stdin;
1	001_baseline_compliance.ts	1	2025-11-10 21:25:56.807+00
\.


--
-- Data for Name: knex_migrations_compliance_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_compliance_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_event; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_event (id, name, batch, migration_time) FROM stdin;
1	001_baseline_event.ts	1	2025-11-09 00:13:46.35+00
\.


--
-- Data for Name: knex_migrations_event_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_event_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_files (id, name, batch, migration_time) FROM stdin;
1	001_baseline_files.ts	1	2025-11-10 16:37:52.883+00
\.


--
-- Data for Name: knex_migrations_files_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_files_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_integration; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_integration (id, name, batch, migration_time) FROM stdin;
1	001_baseline_integration.ts	1	2025-11-09 00:35:46.996+00
\.


--
-- Data for Name: knex_migrations_integration_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_integration_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_marketplace; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_marketplace (id, name, batch, migration_time) FROM stdin;
1	001_baseline_marketplace.ts	1	2025-11-10 15:57:09.228+00
\.


--
-- Data for Name: knex_migrations_marketplace_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_marketplace_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_monitoring; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_monitoring (id, name, batch, migration_time) FROM stdin;
1	001_baseline_monitoring_schema.js	1	2025-11-10 21:46:57.264+00
\.


--
-- Data for Name: knex_migrations_monitoring_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_monitoring_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_notification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_notification (id, name, batch, migration_time) FROM stdin;
1	001_baseline_notification_schema.ts	1	2025-11-09 03:14:32.197+00
\.


--
-- Data for Name: knex_migrations_notification_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_notification_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_payment (id, name, batch, migration_time) FROM stdin;
1	001_baseline_payment.ts	1	2025-11-09 01:21:47.267+00
\.


--
-- Data for Name: knex_migrations_payment_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_payment_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_queue (id, name, batch, migration_time) FROM stdin;
\.


--
-- Data for Name: knex_migrations_queue_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_queue_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_scanning; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_scanning (id, name, batch, migration_time) FROM stdin;
1	001_baseline_scanning.ts	1	2025-11-09 02:47:51.396+00
\.


--
-- Data for Name: knex_migrations_scanning_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_scanning_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_search; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_search (id, name, batch, migration_time) FROM stdin;
1	001_search_consistency_tables.ts	1	2025-11-10 16:33:14.366+00
\.


--
-- Data for Name: knex_migrations_search_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_search_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_ticket; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_ticket (id, name, batch, migration_time) FROM stdin;
1	001_baseline_ticket.ts	1	2025-11-09 01:08:28.072+00
\.


--
-- Data for Name: knex_migrations_ticket_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_ticket_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_venue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_venue (id, name, batch, migration_time) FROM stdin;
1	001_baseline_venue.ts	1	2025-11-08 21:47:37.633+00
2	004_add_external_verification_tables.ts	2	2025-11-13 23:26:36.375+00
\.


--
-- Data for Name: knex_migrations_venue_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_venue_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: known_scalpers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.known_scalpers (id, user_id, device_fingerprint, reason, confidence_score, added_by, active, added_at) FROM stdin;
\.


--
-- Data for Name: manual_review_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.manual_review_queue (id, venue_id, verification_id, review_type, priority, status, assigned_to, metadata, notes, reviewed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: marketplace_blacklist; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketplace_blacklist (id, user_id, wallet_address, reason, banned_by, banned_at, expires_at, is_active) FROM stdin;
\.


--
-- Data for Name: marketplace_disputes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketplace_disputes (id, transfer_id, listing_id, filed_by, filed_against, dispute_type, description, evidence_urls, status, resolution_notes, resolved_by, resolved_at, refund_amount, refund_transaction_id, filed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: marketplace_listings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketplace_listings (id, ticket_id, seller_id, event_id, venue_id, price, original_face_value, price_multiplier, status, listed_at, sold_at, expires_at, cancelled_at, listing_signature, wallet_address, program_address, requires_approval, approved_at, approved_by, approval_notes, view_count, favorite_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: marketplace_price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketplace_price_history (id, listing_id, event_id, old_price, new_price, price_change, changed_by, change_reason, changed_at) FROM stdin;
\.


--
-- Data for Name: marketplace_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketplace_transfers (id, listing_id, buyer_id, seller_id, event_id, venue_id, buyer_wallet, seller_wallet, transfer_signature, block_height, payment_currency, payment_amount, usd_value, status, initiated_at, completed_at, failed_at, failure_reason, network_fee, network_fee_usd, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: metrics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.metrics (id, name, metric_name, service_name, value, metric_type, unit, service, labels, tags, "timestamp", created_at) FROM stdin;
\.


--
-- Data for Name: ml_fraud_models; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ml_fraud_models (id, model_name, model_version, model_type, description, features, hyperparameters, accuracy, "precision", recall, f1_score, training_samples, status, trained_at, deployed_at, deprecated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ml_fraud_predictions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ml_fraud_predictions (id, model_id, transaction_id, user_id, fraud_probability, predicted_class, feature_values, feature_importance, prediction_time_ms, actual_fraud, feedback_at, created_at) FROM stdin;
\.


--
-- Data for Name: nft_mint_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nft_mint_queue (id, payment_id, ticket_ids, venue_id, event_id, blockchain, status, priority, transaction_hash, gas_fee_paid, mint_batch_id, attempts, error_message, created_at, processed_at, updated_at) FROM stdin;
\.


--
-- Data for Name: nft_mints; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nft_mints (id, ticket_id, mint_address, metadata, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: nft_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nft_transfers (id, token_address, from_address, to_address, amount, signature, status, created_at) FROM stdin;
\.


--
-- Data for Name: notification_analytics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_analytics (id, date, hour, channel, type, provider, total_sent, total_delivered, total_failed, total_bounced, total_opened, total_clicked, avg_delivery_time_ms, min_delivery_time_ms, max_delivery_time_ms, total_cost, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_campaigns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_campaigns (id, venue_id, name, type, channel, template_id, segment_id, audience_filter, scheduled_for, status, is_ab_test, ab_test_id, ab_variant, stats_total, stats_sent, stats_delivered, stats_failed, stats_opened, stats_clicked, stats_converted, stats_unsubscribed, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_clicks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_clicks (id, notification_id, user_id, link_id, original_url, clicked_at, ip_address, user_agent) FROM stdin;
\.


--
-- Data for Name: notification_costs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_costs (id, notification_id, venue_id, channel, provider, cost, currency, billing_period, is_platform_cost, created_at) FROM stdin;
\.


--
-- Data for Name: notification_delivery_stats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_delivery_stats (id, date, channel, provider, total_sent, total_delivered, total_failed, total_bounced, total_retried, avg_delivery_time_ms, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_engagement; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_engagement (id, notification_id, user_id, channel, action, action_timestamp, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: notification_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_history (id, venue_id, recipient_id, channel, type, priority, template_name, subject, content, recipient_email, recipient_phone, recipient_name, status, delivery_status, delivery_attempts, last_attempt_at, delivered_at, failed_reason, provider_message_id, provider_response, retry_after, should_retry, scheduled_for, sent_at, expires_at, metadata, cost, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_log (id, type, recipient, subject, message, template, status, error_message, updated_at, created_at) FROM stdin;
\.


--
-- Data for Name: notification_preference_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_preference_history (id, user_id, changed_by, changes, reason, created_at) FROM stdin;
\.


--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_preferences (user_id, email_enabled, sms_enabled, push_enabled, email_payment, email_marketing, email_event_updates, email_account, sms_critical_only, sms_payment, sms_event_reminders, push_payment, push_event_updates, push_marketing, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, max_emails_per_day, max_sms_per_day, unsubscribe_token, unsubscribed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_templates (id, venue_id, name, channel, type, subject, content, html_content, variables, is_active, version, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, venue_id, user_id, type, priority, title, message, metadata, read, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.oauth_connections (id, user_id, provider, provider_user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ofac_checks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ofac_checks (id, venue_id, name_checked, is_match, confidence, matched_name, reviewed, review_notes, created_at) FROM stdin;
\.


--
-- Data for Name: ofac_sdn_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ofac_sdn_list (id, uid, full_name, first_name, last_name, sdn_type, programs, raw_data, created_at) FROM stdin;
\.


--
-- Data for Name: offline_validation_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_validation_cache (id, ticket_id, event_id, validation_hash, valid_from, valid_until, ticket_data, created_at) FROM stdin;
\.


--
-- Data for Name: order_discounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_discounts (id, order_id, discount_id, discount_code, amount_cents, applied_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents, created_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, platform_fee_cents, processing_fee_cents, tax_cents, discount_cents, total_cents, original_total_cents, ticket_quantity, discount_codes, payment_intent_id, payment_method, currency, idempotency_key, expires_at, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: outbox; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.outbox (id, aggregate_id, aggregate_type, event_type, payload, created_at, processed_at, attempts, last_attempt_at, last_error, tenant_id, retry_count) FROM stdin;
\.


--
-- Data for Name: outbox_dlq; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.outbox_dlq (id, original_id, aggregate_id, aggregate_type, event_type, payload, attempts, last_error, created_at, moved_to_dlq_at) FROM stdin;
\.


--
-- Data for Name: payment_escrows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_escrows (id, listing_id, buyer_id, seller_id, amount, seller_payout, venue_royalty, platform_fee, stripe_payment_intent_id, status, release_conditions, created_at, released_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payment_event_sequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_event_sequence (id, payment_id, order_id, event_type, sequence_number, event_timestamp, stripe_event_id, idempotency_key, payload, processed_at, created_at) FROM stdin;
\.


--
-- Data for Name: payment_idempotency; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_idempotency (idempotency_key, operation, request_hash, response, status_code, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: payment_intents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_intents (id, order_id, stripe_intent_id, external_id, client_secret, processor, amount, currency, status, platform_fee, venue_id, metadata, idempotency_key, tenant_id, last_sequence_number, last_event_timestamp, version, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payment_refunds; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_refunds (id, transaction_id, amount, reason, status, stripe_refund_id, metadata, idempotency_key, tenant_id, created_at, completed_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payment_retries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_retries (id, payment_id, attempt_number, status, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: payment_state_machine; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_state_machine (from_state, to_state, event_type, is_valid) FROM stdin;
PENDING	PROCESSING	payment.processing	t
PENDING	PAID	payment.succeeded	t
PENDING	PAYMENT_FAILED	payment.failed	t
PENDING	CANCELLED	payment.cancelled	t
PROCESSING	PAID	payment.succeeded	t
PROCESSING	PAYMENT_FAILED	payment.failed	t
PROCESSING	CANCELLED	payment.cancelled	t
PAID	REFUNDING	refund.initiated	t
PAID	PARTIALLY_REFUNDED	refund.partial	t
PAID	REFUNDED	refund.completed	t
REFUNDING	PARTIALLY_REFUNDED	refund.partial	t
REFUNDING	REFUNDED	refund.completed	t
REFUNDING	PAID	refund.failed	t
\.


--
-- Data for Name: payment_state_transitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_state_transitions (id, payment_id, order_id, from_state, to_state, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: payment_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_transactions (id, venue_id, user_id, event_id, amount, currency, status, platform_fee, venue_payout, gas_fee_paid, tax_amount, total_amount, stripe_payment_intent_id, paypal_order_id, device_fingerprint, payment_method_fingerprint, metadata, idempotency_key, tenant_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payout_methods; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payout_methods (id, venue_id, payout_id, provider, status, created_at) FROM stdin;
\.


--
-- Data for Name: pending_price_changes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pending_price_changes (id, event_id, current_price, recommended_price, confidence, reasoning, demand_score, created_at, updated_at, approved_at, approved_by, approval_reason, rejected_at, rejected_by, rejection_reason) FROM stdin;
\.


--
-- Data for Name: platform_fees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platform_fees (id, transfer_id, sale_price, platform_fee_amount, platform_fee_percentage, venue_fee_amount, venue_fee_percentage, seller_payout, platform_fee_wallet, platform_fee_signature, venue_fee_wallet, venue_fee_signature, platform_fee_collected, venue_fee_paid, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_history (id, event_id, price_cents, reason, changed_at, changed_by) FROM stdin;
\.


--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qr_codes (id, ticket_id, code, scanned, scanned_at, created_at, expires_at, metadata) FROM stdin;
\.


--
-- Data for Name: queues; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.queues (id, name, type, config, active, pending_count, processing_count, completed_count, failed_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rate_limits (id, key, "limit", window_seconds, current_count, reset_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: read_consistency_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.read_consistency_tokens (token, client_id, required_versions, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: reconciliation_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reconciliation_reports (id, report_date, period_start, period_end, summary, discrepancies, created_at) FROM stdin;
\.


--
-- Data for Name: reservation_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservation_history (id, reservation_id, order_id, user_id, status_from, status_to, reason, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations (id, tenant_id, user_id, event_id, tickets, total_quantity, ticket_type_id, status, expires_at, released_at, release_reason, order_id, payment_status, type_name, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: risk_assessments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.risk_assessments (id, venue_id, risk_score, factors, recommendation, created_at) FROM stdin;
\.


--
-- Data for Name: risk_flags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.risk_flags (id, venue_id, reason, severity, resolved, resolution, resolved_at, created_at) FROM stdin;
\.


--
-- Data for Name: royalty_discrepancies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.royalty_discrepancies (id, reconciliation_run_id, transaction_id, distribution_id, discrepancy_type, expected_amount, actual_amount, variance, status, resolution_notes, resolved_by, resolved_at, created_at) FROM stdin;
\.


--
-- Data for Name: royalty_distributions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.royalty_distributions (id, transaction_id, event_id, transaction_type, recipient_type, recipient_id, recipient_wallet_address, amount_cents, percentage, status, blockchain_tx_hash, stripe_transfer_id, paid_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: royalty_payouts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.royalty_payouts (id, recipient_id, recipient_type, amount_cents, currency, distribution_count, period_start, period_end, status, stripe_payout_id, failure_reason, metadata, scheduled_at, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: royalty_reconciliation_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.royalty_reconciliation_runs (id, reconciliation_date, period_start, period_end, transactions_checked, discrepancies_found, discrepancies_resolved, total_royalties_calculated, total_royalties_paid, variance_amount, status, duration_ms, error_message, summary, started_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: scalper_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scalper_reports (id, reporter_id, suspected_scalper_id, evidence, description, status, reviewed_by, review_notes, reviewed_at, created_at) FROM stdin;
\.


--
-- Data for Name: scan_policies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scan_policies (id, event_id, venue_id, policy_type, name, config, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scan_policy_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scan_policy_templates (id, name, description, policy_set, is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scanner_devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scanner_devices (id, device_id, device_name, device_type, venue_id, registered_by, ip_address, user_agent, app_version, can_scan_offline, is_active, last_sync_at, revoked_at, revoked_by, revoked_reason, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scans (id, ticket_id, device_id, result, reason, scanned_at, metadata) FROM stdin;
\.


--
-- Data for Name: schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schedules (id, name, cron_expression, job_type, job_data, active, last_run, next_run, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settlement_batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.settlement_batches (id, venue_id, batch_number, total_amount, payment_count, status, processed_at, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: suppression_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.suppression_list (id, identifier, identifier_hash, channel, reason, suppressed_at, suppressed_by, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: sync_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sync_logs (id, venue_id, integration_type, sync_type, direction, status, started_at, completed_at, duration_ms, success_count, error_count, skip_count, errors, triggered_by, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: sync_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sync_queue (id, venue_id, integration_type, sync_type, direction, status, priority, attempts, max_attempts, scheduled_for, started_at, completed_at, duration_ms, records_processed, records_succeeded, records_failed, errors, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tax_collections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_collections (id, transaction_id, state_tax, local_tax, special_tax, total_tax, jurisdiction, breakdown, created_at) FROM stdin;
\.


--
-- Data for Name: tax_forms_1099da; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_forms_1099da (id, user_id, tax_year, form_data, total_proceeds, transaction_count, status, generated_at, sent_at) FROM stdin;
\.


--
-- Data for Name: tax_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_records (id, venue_id, year, amount, ticket_id, event_id, threshold_reached, form_1099_required, form_1099_sent, created_at) FROM stdin;
\.


--
-- Data for Name: tax_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_transactions (id, transfer_id, seller_id, sale_amount, cost_basis, capital_gain, tax_year, tax_quarter, transaction_type, tax_category, reported_to_seller, reported_to_irs, reported_at, metadata, transaction_date, created_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, slug, status, settings, created_at, updated_at) FROM stdin;
00000000-0000-0000-0000-000000000001	Default Tenant	default	active	{}	2025-11-08 21:07:54.876747+00	2025-11-08 21:07:54.876747+00
\.


--
-- Data for Name: ticket_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_transfers (id, tenant_id, ticket_id, from_user_id, to_user_id, reason, transfer_code, transaction_hash, blockchain_status, status, transferred_at, completed_at, metadata) FROM stdin;
\.


--
-- Data for Name: ticket_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_types (id, tenant_id, event_id, name, description, price_cents, quantity, available_quantity, reserved_quantity, sold_quantity, max_per_purchase, min_per_purchase, sale_start_date, sale_end_date, metadata, is_active, display_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ticket_validations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_validations (id, tenant_id, ticket_id, event_id, validated_at, validator_id, entrance, device_id, validation_method, is_valid, notes, metadata) FROM stdin;
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, tenant_id, event_id, ticket_type_id, order_id, user_id, status, price_cents, seat_number, section, "row", qr_code, qr_code_secret, qr_code_generated_at, nft_token_id, nft_mint_address, nft_transaction_hash, nft_minted_at, blockchain_status, payment_id, payment_intent_id, purchased_at, validated_at, used_at, validator_id, entrance, device_id, is_transferable, transfer_locked_until, transfer_count, transfer_history, barcode, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: trusted_devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.trusted_devices (id, user_id, device_fingerprint, trust_score, last_seen, created_at) FROM stdin;
\.


--
-- Data for Name: upload_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.upload_sessions (id, session_token, uploaded_by, filename, mime_type, total_size, total_chunks, uploaded_chunks, uploaded_bytes, status, expires_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: user_blacklists; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_blacklists (id, user_id, action_type, reason, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_sessions (id, user_id, started_at, ended_at, ip_address, user_agent, revoked_at, metadata) FROM stdin;
\.


--
-- Data for Name: user_venue_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_venue_roles (id, user_id, venue_id, role, granted_by, is_active, expires_at, created_at, granted_at, revoked_at, revoked_by) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, email_verified, email_verification_token, email_verification_expires, email_verified_at, username, display_name, bio, avatar_url, cover_image_url, first_name, last_name, date_of_birth, phone, phone_verified, country_code, city, state_province, postal_code, timezone, preferred_language, status, role, permissions, two_factor_enabled, two_factor_secret, backup_codes, mfa_enabled, mfa_secret, last_password_change, password_reset_token, password_reset_expires, password_changed_at, last_login_at, last_login_ip, last_login_device, login_count, failed_login_attempts, locked_until, preferences, notification_preferences, profile_data, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, marketing_consent, marketing_consent_date, referral_code, referred_by, referral_count, provider, provider_user_id, wallet_address, network, verified, metadata, tags, verification_token, is_active, created_at, updated_at, deleted_at, tenant_id, can_receive_transfers, identity_verified) FROM stdin;
f3903ba6-bfec-11f0-8b59-0242ac120006	admin'--@example.com	$2b$10$3xnTmW4RaX8.t8.5Te1uxOBfzy/OUeJaeWTPrPOhpulT/OtBblzr2	f	\N	\N	\N	\N	\N	\N	\N	\N	'; DROP TABLE users; --	Test	\N	+1234567890	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-11-12 17:28:06.798526+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	152E01FA	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-11-12 17:28:06.798+00	2025-11-12 17:28:06.798526+00	\N	00000000-0000-0000-0000-000000000001	t	f
f39b1760-bfec-11f0-8b59-0242ac120006	tenant1@example.com	$2b$10$/pQI1nZDtTmg//StJnLusu4vC7RpLfZ73WbHz8/BkUUwd2BvgSgcy	f	\N	\N	\N	\N	\N	\N	\N	\N	Integration	Test	\N	+1234567890	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-11-12 17:28:06.869675+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	42692A82	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-11-12 17:28:06.869+00	2025-11-12 17:28:06.869675+00	\N	00000000-0000-0000-0000-000000000001	t	f
f4c7f414-bfec-11f0-8b59-0242ac120006	unverified@example.com	$2b$10$c8Ef7cG2u9wGiYYhOTatu.s3I49WdkOEIpv7XrVBfZd5HzUWC2dIi	f	\N	\N	\N	\N	\N	\N	\N	\N	Integration	Test	\N	+1234567890	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-11-12 17:28:08.841268+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	405E6F84	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-11-12 17:28:08.84+00	2025-11-12 17:28:08.841268+00	\N	00000000-0000-0000-0000-000000000001	t	f
299fb744-bffc-11f0-8bc3-0242ac120006	invalid-tenant@example.com	$2b$10$aFEWt9hq0MUAP8bU0Uofgu1EeU1wHuQQDVXdILY4HHUGLjfwwfZEa	f	\N	\N	\N	\N	\N	\N	\N	\N	Tenant1	User	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-11-12 19:16:59.947549+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	7BB24626	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-11-12 19:16:59.947+00	2025-11-12 19:16:59.947549+00	\N	00000000-0000-0000-0000-000000000001	t	f
29c79818-bffc-11f0-8bc3-0242ac120006	no-tenant@example.com	$2b$10$lg4Ma3DqVPAj/OkgvWvKnOGvfW56K1zEXvhy8jkDgLhpTNsHstcjq	f	\N	\N	\N	\N	\N	\N	\N	\N	Tenant1	User	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-11-12 19:17:00.208829+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	9EA4A585	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-11-12 19:17:00.207+00	2025-11-12 19:17:00.208829+00	\N	00000000-0000-0000-0000-000000000001	t	f
\.


--
-- Data for Name: velocity_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.velocity_limits (id, entity_type, entity_id, action_type, limit_count, window_minutes, current_count, window_start, window_end, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_balances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_balances (id, venue_id, amount, balance_type, currency, last_payout_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_branding; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_branding (id, venue_id, primary_color, secondary_color, accent_color, text_color, background_color, font_family, heading_font, logo_url, logo_dark_url, favicon_url, email_header_image, ticket_background_image, custom_css, email_from_name, email_reply_to, email_footer_text, ticket_header_text, ticket_footer_text, og_image_url, og_description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_compliance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_compliance (id, venue_id, settings, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_compliance_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_compliance_reports (id, venue_id, report, created_at) FROM stdin;
\.


--
-- Data for Name: venue_compliance_reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_compliance_reviews (id, venue_id, scheduled_date, status, reviewer_id, findings, notes, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_integrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_integrations (id, venue_id, integration_type, integration_name, config_data, api_key_encrypted, api_secret_encrypted, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_layouts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_layouts (id, venue_id, name, type, sections, capacity, is_default, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: venue_marketplace_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_marketplace_settings (venue_id, max_resale_multiplier, min_price_multiplier, allow_below_face, transfer_cutoff_hours, listing_advance_hours, auto_expire_on_event_start, max_listings_per_user_per_event, max_listings_per_user_total, require_listing_approval, auto_approve_verified_sellers, royalty_percentage, royalty_wallet_address, minimum_royalty_payout, allow_international_sales, blocked_countries, require_kyc_for_high_value, high_value_threshold, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_notification_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_notification_settings (id, venue_id, daily_email_limit, daily_sms_limit, monthly_email_limit, monthly_sms_limit, blocked_channels, default_timezone, quiet_hours_start, quiet_hours_end, reply_to_email, sms_callback_number, webhook_url, webhook_secret, custom_branding, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_royalty_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_royalty_settings (id, venue_id, default_royalty_percentage, minimum_payout_amount_cents, payout_schedule, stripe_account_id, payment_method, auto_payout_enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_settings (id, venue_id, max_tickets_per_order, ticket_resale_allowed, allow_print_at_home, allow_mobile_tickets, require_id_verification, ticket_transfer_allowed, service_fee_percentage, facility_fee_amount, processing_fee_percentage, payment_methods, accepted_currencies, payout_frequency, minimum_payout_amount, created_at, updated_at, dynamic_pricing_enabled, price_min_multiplier, price_max_multiplier, price_adjustment_frequency, price_require_approval, price_aggressiveness) FROM stdin;
\.


--
-- Data for Name: venue_staff; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_staff (id, venue_id, user_id, role, permissions, department, job_title, employment_type, start_date, end_date, is_active, access_areas, shift_schedule, pin_code, contact_email, contact_phone, emergency_contact, hourly_rate, commission_percentage, added_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_tier_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_tier_history (id, venue_id, from_tier, to_tier, reason, changed_by, changed_at) FROM stdin;
\.


--
-- Data for Name: venue_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_verifications (id, venue_id, ein, business_name, business_address, status, verification_id, w9_uploaded, bank_verified, ofac_cleared, risk_score, manual_review_required, manual_review_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venues; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venues (id, name, slug, description, email, phone, website, address_line1, address_line2, city, state_province, postal_code, country_code, latitude, longitude, timezone, venue_type, max_capacity, standing_capacity, seated_capacity, vip_capacity, logo_url, cover_image_url, image_gallery, virtual_tour_url, business_name, business_registration, tax_id, business_type, wallet_address, collection_address, royalty_percentage, status, is_verified, verified_at, verification_level, features, amenities, accessibility_features, age_restriction, dress_code, prohibited_items, cancellation_policy, refund_policy, social_media, average_rating, total_reviews, total_events, total_tickets_sold, pricing_tier, hide_platform_branding, custom_domain, metadata, tags, created_by, updated_by, created_at, updated_at, deleted_at, tenant_id, transfer_deadline_hours) FROM stdin;
\.


--
-- Data for Name: waiting_room_activity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.waiting_room_activity (id, event_id, user_id, action, metadata, "timestamp") FROM stdin;
\.


--
-- Data for Name: wallet_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_connections (id, user_id, wallet_address, network, verified, last_login_at, created_at) FROM stdin;
\.


--
-- Data for Name: webhook_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_events (id, event_id, processor, event_type, payload, processed_at, received_at) FROM stdin;
\.


--
-- Data for Name: webhook_inbox; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_inbox (id, provider, event_id, webhook_id, event_type, payload, signature, received_at, processed_at, status, attempts, retry_count, error_message, error, last_error, tenant_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: webhook_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_logs (id, source, type, payload, processed, created_at) FROM stdin;
\.


--
-- Data for Name: webhook_nonces; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_nonces (nonce, endpoint, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: webhooks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhooks (id, connection_id, event_type, payload, status, retry_count, processed_at, created_at) FROM stdin;
\.


--
-- Data for Name: white_label_pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.white_label_pricing (id, tier_name, description, monthly_fee, service_fee_percentage, per_ticket_fee, custom_domain_allowed, hide_platform_branding, custom_css_allowed, white_label_emails, white_label_tickets, priority_support, api_access, max_events_per_month, max_custom_domains, max_staff_accounts, created_at, updated_at) FROM stdin;
7ff3ef87-3022-4e5b-a6e9-61294510c434	standard	Standard ticketing platform with TicketToken branding	0.00	10.00	2.00	f	f	f	f	f	f	f	\N	0	5	2025-11-08 21:47:37.361739+00	2025-11-08 21:47:37.361739+00
3947d867-4e3a-432c-825a-2f9a7f6bdb3a	white_label	White-label solution with your branding	499.00	5.00	1.00	t	t	t	t	t	t	t	\N	1	20	2025-11-08 21:47:37.361739+00	2025-11-08 21:47:37.361739+00
16afef4f-ae60-42ba-85e9-65e684422670	enterprise	Enterprise solution with dedicated support	1999.00	3.00	0.50	t	t	t	t	t	t	t	\N	5	\N	2025-11-08 21:47:37.361739+00	2025-11-08 21:47:37.361739+00
\.


--
-- Name: bank_verifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bank_verifications_id_seq', 1, false);


--
-- Name: compliance_audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compliance_audit_log_id_seq', 1, false);


--
-- Name: compliance_batch_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compliance_batch_jobs_id_seq', 1, false);


--
-- Name: compliance_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compliance_documents_id_seq', 1, false);


--
-- Name: compliance_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compliance_settings_id_seq', 10, true);


--
-- Name: form_1099_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.form_1099_records_id_seq', 1, false);


--
-- Name: knex_migrations_analytics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_analytics_id_seq', 1, true);


--
-- Name: knex_migrations_analytics_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_analytics_lock_index_seq', 1, true);


--
-- Name: knex_migrations_auth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_auth_id_seq', 1, true);


--
-- Name: knex_migrations_auth_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_auth_lock_index_seq', 1, true);


--
-- Name: knex_migrations_compliance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_compliance_id_seq', 1, true);


--
-- Name: knex_migrations_compliance_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_compliance_lock_index_seq', 1, true);


--
-- Name: knex_migrations_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_event_id_seq', 1, true);


--
-- Name: knex_migrations_event_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_event_lock_index_seq', 1, true);


--
-- Name: knex_migrations_files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_files_id_seq', 1, true);


--
-- Name: knex_migrations_files_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_files_lock_index_seq', 1, true);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 1, false);


--
-- Name: knex_migrations_integration_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_integration_id_seq', 1, true);


--
-- Name: knex_migrations_integration_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_integration_lock_index_seq', 1, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: knex_migrations_marketplace_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_marketplace_id_seq', 1, true);


--
-- Name: knex_migrations_marketplace_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_marketplace_lock_index_seq', 1, true);


--
-- Name: knex_migrations_monitoring_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_monitoring_id_seq', 1, true);


--
-- Name: knex_migrations_monitoring_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_monitoring_lock_index_seq', 1, true);


--
-- Name: knex_migrations_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_notification_id_seq', 1, true);


--
-- Name: knex_migrations_notification_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_notification_lock_index_seq', 1, true);


--
-- Name: knex_migrations_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_payment_id_seq', 1, true);


--
-- Name: knex_migrations_payment_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_payment_lock_index_seq', 1, true);


--
-- Name: knex_migrations_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_queue_id_seq', 1, true);


--
-- Name: knex_migrations_queue_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_queue_lock_index_seq', 1, true);


--
-- Name: knex_migrations_scanning_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_scanning_id_seq', 1, true);


--
-- Name: knex_migrations_scanning_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_scanning_lock_index_seq', 1, true);


--
-- Name: knex_migrations_search_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_search_id_seq', 1, true);


--
-- Name: knex_migrations_search_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_search_lock_index_seq', 1, true);


--
-- Name: knex_migrations_ticket_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_ticket_id_seq', 1, true);


--
-- Name: knex_migrations_ticket_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_ticket_lock_index_seq', 1, true);


--
-- Name: knex_migrations_venue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_venue_id_seq', 2, true);


--
-- Name: knex_migrations_venue_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_venue_lock_index_seq', 1, true);


--
-- Name: notification_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notification_log_id_seq', 1, false);


--
-- Name: ofac_checks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ofac_checks_id_seq', 1, false);


--
-- Name: ofac_sdn_list_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ofac_sdn_list_id_seq', 1, false);


--
-- Name: outbox_dlq_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.outbox_dlq_id_seq', 1, false);


--
-- Name: outbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.outbox_id_seq', 1, false);


--
-- Name: payout_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payout_methods_id_seq', 1, false);


--
-- Name: risk_assessments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.risk_assessments_id_seq', 1, false);


--
-- Name: risk_flags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.risk_flags_id_seq', 1, false);


--
-- Name: tax_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tax_records_id_seq', 1, false);


--
-- Name: venue_verifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.venue_verifications_id_seq', 1, false);


--
-- Name: webhook_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.webhook_logs_id_seq', 1, false);


--
-- Name: ab_test_variants ab_test_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ab_test_variants
    ADD CONSTRAINT ab_test_variants_pkey PRIMARY KEY (id);


--
-- Name: ab_tests ab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT ab_tests_pkey PRIMARY KEY (id);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: account_takeover_signals account_takeover_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_takeover_signals
    ADD CONSTRAINT account_takeover_signals_pkey PRIMARY KEY (id);


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: analytics_aggregations analytics_aggregations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_aggregations
    ADD CONSTRAINT analytics_aggregations_pkey PRIMARY KEY (id);


--
-- Name: analytics_aggregations analytics_aggregations_tenant_id_aggregation_type_metric_type_e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_aggregations
    ADD CONSTRAINT analytics_aggregations_tenant_id_aggregation_type_metric_type_e UNIQUE (tenant_id, aggregation_type, metric_type, entity_type, entity_id, time_period, period_start);


--
-- Name: analytics_alerts analytics_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_alerts
    ADD CONSTRAINT analytics_alerts_pkey PRIMARY KEY (id);


--
-- Name: analytics_dashboards analytics_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_dashboards
    ADD CONSTRAINT analytics_dashboards_pkey PRIMARY KEY (id);


--
-- Name: analytics_exports analytics_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_exports
    ADD CONSTRAINT analytics_exports_pkey PRIMARY KEY (id);


--
-- Name: analytics_metrics analytics_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_metrics
    ADD CONSTRAINT analytics_metrics_pkey PRIMARY KEY (id);


--
-- Name: analytics_widgets analytics_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_widgets
    ADD CONSTRAINT analytics_widgets_pkey PRIMARY KEY (id);


--
-- Name: anti_bot_activities anti_bot_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.anti_bot_activities
    ADD CONSTRAINT anti_bot_activities_pkey PRIMARY KEY (id);


--
-- Name: anti_bot_violations anti_bot_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.anti_bot_violations
    ADD CONSTRAINT anti_bot_violations_pkey PRIMARY KEY (id);


--
-- Name: audience_segments audience_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audience_segments
    ADD CONSTRAINT audience_segments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_verifications bank_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_verifications
    ADD CONSTRAINT bank_verifications_pkey PRIMARY KEY (id);


--
-- Name: behavioral_analytics behavioral_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.behavioral_analytics
    ADD CONSTRAINT behavioral_analytics_pkey PRIMARY KEY (id);


--
-- Name: biometric_credentials biometric_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_pkey PRIMARY KEY (id);


--
-- Name: bot_detections bot_detections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_detections
    ADD CONSTRAINT bot_detections_pkey PRIMARY KEY (id);


--
-- Name: card_fingerprints card_fingerprints_card_fingerprint_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.card_fingerprints
    ADD CONSTRAINT card_fingerprints_card_fingerprint_unique UNIQUE (card_fingerprint);


--
-- Name: card_fingerprints card_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.card_fingerprints
    ADD CONSTRAINT card_fingerprints_pkey PRIMARY KEY (id);


--
-- Name: compliance_audit_log compliance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audit_log
    ADD CONSTRAINT compliance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: compliance_batch_jobs compliance_batch_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_batch_jobs
    ADD CONSTRAINT compliance_batch_jobs_pkey PRIMARY KEY (id);


--
-- Name: compliance_documents compliance_documents_document_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_documents
    ADD CONSTRAINT compliance_documents_document_id_unique UNIQUE (document_id);


--
-- Name: compliance_documents compliance_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_documents
    ADD CONSTRAINT compliance_documents_pkey PRIMARY KEY (id);


--
-- Name: compliance_settings compliance_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_key_unique UNIQUE (key);


--
-- Name: compliance_settings compliance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_pkey PRIMARY KEY (id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: consent_records consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.consent_records
    ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);


--
-- Name: custom_domains custom_domains_domain_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_domain_unique UNIQUE (domain);


--
-- Name: custom_domains custom_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_pkey PRIMARY KEY (id);


--
-- Name: customer_lifetime_value customer_lifetime_value_customer_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_lifetime_value
    ADD CONSTRAINT customer_lifetime_value_customer_id_unique UNIQUE (customer_id);


--
-- Name: customer_lifetime_value customer_lifetime_value_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_lifetime_value
    ADD CONSTRAINT customer_lifetime_value_pkey PRIMARY KEY (id);


--
-- Name: customer_rfm_scores customer_rfm_scores_customer_id_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_rfm_scores
    ADD CONSTRAINT customer_rfm_scores_customer_id_venue_id_unique UNIQUE (customer_id, venue_id);


--
-- Name: customer_rfm_scores customer_rfm_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_rfm_scores
    ADD CONSTRAINT customer_rfm_scores_pkey PRIMARY KEY (id);


--
-- Name: customer_segments customer_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_segments
    ADD CONSTRAINT customer_segments_pkey PRIMARY KEY (id);


--
-- Name: customer_segments customer_segments_venue_id_segment_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_segments
    ADD CONSTRAINT customer_segments_venue_id_segment_name_unique UNIQUE (venue_id, segment_name);


--
-- Name: dashboards dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboards
    ADD CONSTRAINT dashboards_pkey PRIMARY KEY (id);


--
-- Name: device_activity device_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_activity
    ADD CONSTRAINT device_activity_pkey PRIMARY KEY (id);


--
-- Name: devices devices_device_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_device_id_unique UNIQUE (device_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: discounts discounts_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_code_unique UNIQUE (code);


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- Name: email_automation_triggers email_automation_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_automation_triggers
    ADD CONSTRAINT email_automation_triggers_pkey PRIMARY KEY (id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- Name: event_capacity event_capacity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_slug_unique UNIQUE (slug);


--
-- Name: event_metadata event_metadata_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT event_metadata_event_id_unique UNIQUE (event_id);


--
-- Name: event_metadata event_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT event_metadata_pkey PRIMARY KEY (id);


--
-- Name: event_pricing event_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_pkey PRIMARY KEY (id);


--
-- Name: event_purchase_limits event_purchase_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_purchase_limits
    ADD CONSTRAINT event_purchase_limits_pkey PRIMARY KEY (event_id);


--
-- Name: event_royalty_settings event_royalty_settings_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_royalty_settings
    ADD CONSTRAINT event_royalty_settings_event_id_unique UNIQUE (event_id);


--
-- Name: event_royalty_settings event_royalty_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_royalty_settings
    ADD CONSTRAINT event_royalty_settings_pkey PRIMARY KEY (id);


--
-- Name: event_schedules event_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_schedules
    ADD CONSTRAINT event_schedules_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: external_verifications external_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_verifications
    ADD CONSTRAINT external_verifications_pkey PRIMARY KEY (id);


--
-- Name: field_mappings field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_mappings
    ADD CONSTRAINT field_mappings_pkey PRIMARY KEY (id);


--
-- Name: file_access_logs file_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_pkey PRIMARY KEY (id);


--
-- Name: file_versions file_versions_file_id_version_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_version_number_unique UNIQUE (file_id, version_number);


--
-- Name: file_versions file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: form_1099_records form_1099_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_1099_records
    ADD CONSTRAINT form_1099_records_pkey PRIMARY KEY (id);


--
-- Name: fraud_checks fraud_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_checks
    ADD CONSTRAINT fraud_checks_pkey PRIMARY KEY (id);


--
-- Name: fraud_events fraud_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_events
    ADD CONSTRAINT fraud_events_pkey PRIMARY KEY (id);


--
-- Name: fraud_review_queue fraud_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_review_queue
    ADD CONSTRAINT fraud_review_queue_pkey PRIMARY KEY (id);


--
-- Name: fraud_rules fraud_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_rules
    ADD CONSTRAINT fraud_rules_pkey PRIMARY KEY (id);


--
-- Name: fraud_rules fraud_rules_rule_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_rules
    ADD CONSTRAINT fraud_rules_rule_name_unique UNIQUE (rule_name);


--
-- Name: group_payment_members group_payment_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_payment_members
    ADD CONSTRAINT group_payment_members_pkey PRIMARY KEY (id);


--
-- Name: group_payments group_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_payments
    ADD CONSTRAINT group_payments_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: index_queue index_queue_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.index_queue
    ADD CONSTRAINT index_queue_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: index_queue index_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.index_queue
    ADD CONSTRAINT index_queue_pkey PRIMARY KEY (id);


--
-- Name: index_versions index_versions_entity_type_entity_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.index_versions
    ADD CONSTRAINT index_versions_entity_type_entity_id_unique UNIQUE (entity_type, entity_id);


--
-- Name: index_versions index_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.index_versions
    ADD CONSTRAINT index_versions_pkey PRIMARY KEY (id);


--
-- Name: integration_configs integration_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_configs
    ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (id);


--
-- Name: integration_costs integration_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_costs
    ADD CONSTRAINT integration_costs_pkey PRIMARY KEY (id);


--
-- Name: integration_health integration_health_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_health
    ADD CONSTRAINT integration_health_pkey PRIMARY KEY (id);


--
-- Name: integration_webhooks integration_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_webhooks
    ADD CONSTRAINT integration_webhooks_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: invalidated_tokens invalidated_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_pkey PRIMARY KEY (token);


--
-- Name: ip_reputation ip_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ip_reputation
    ADD CONSTRAINT ip_reputation_pkey PRIMARY KEY (ip_address);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_analytics_lock knex_migrations_analytics_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_analytics_lock
    ADD CONSTRAINT knex_migrations_analytics_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_analytics knex_migrations_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_analytics
    ADD CONSTRAINT knex_migrations_analytics_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_auth_lock knex_migrations_auth_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth_lock
    ADD CONSTRAINT knex_migrations_auth_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_auth knex_migrations_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth
    ADD CONSTRAINT knex_migrations_auth_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_compliance_lock knex_migrations_compliance_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_compliance_lock
    ADD CONSTRAINT knex_migrations_compliance_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_compliance knex_migrations_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_compliance
    ADD CONSTRAINT knex_migrations_compliance_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_event_lock knex_migrations_event_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event_lock
    ADD CONSTRAINT knex_migrations_event_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_event knex_migrations_event_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event
    ADD CONSTRAINT knex_migrations_event_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_files_lock knex_migrations_files_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_files_lock
    ADD CONSTRAINT knex_migrations_files_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_files knex_migrations_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_files
    ADD CONSTRAINT knex_migrations_files_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_integration_lock knex_migrations_integration_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_integration_lock
    ADD CONSTRAINT knex_migrations_integration_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_integration knex_migrations_integration_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_integration
    ADD CONSTRAINT knex_migrations_integration_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_marketplace_lock knex_migrations_marketplace_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_marketplace_lock
    ADD CONSTRAINT knex_migrations_marketplace_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_marketplace knex_migrations_marketplace_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_marketplace
    ADD CONSTRAINT knex_migrations_marketplace_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_monitoring_lock knex_migrations_monitoring_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_monitoring_lock
    ADD CONSTRAINT knex_migrations_monitoring_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_monitoring knex_migrations_monitoring_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_monitoring
    ADD CONSTRAINT knex_migrations_monitoring_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_notification_lock knex_migrations_notification_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_notification_lock
    ADD CONSTRAINT knex_migrations_notification_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_notification knex_migrations_notification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_notification
    ADD CONSTRAINT knex_migrations_notification_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_payment_lock knex_migrations_payment_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_payment_lock
    ADD CONSTRAINT knex_migrations_payment_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_payment knex_migrations_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_payment
    ADD CONSTRAINT knex_migrations_payment_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_queue_lock knex_migrations_queue_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_queue_lock
    ADD CONSTRAINT knex_migrations_queue_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_queue knex_migrations_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_queue
    ADD CONSTRAINT knex_migrations_queue_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_scanning_lock knex_migrations_scanning_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_scanning_lock
    ADD CONSTRAINT knex_migrations_scanning_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_scanning knex_migrations_scanning_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_scanning
    ADD CONSTRAINT knex_migrations_scanning_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_search_lock knex_migrations_search_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_search_lock
    ADD CONSTRAINT knex_migrations_search_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_search knex_migrations_search_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_search
    ADD CONSTRAINT knex_migrations_search_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_ticket_lock knex_migrations_ticket_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_ticket_lock
    ADD CONSTRAINT knex_migrations_ticket_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_ticket knex_migrations_ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_ticket
    ADD CONSTRAINT knex_migrations_ticket_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_venue_lock knex_migrations_venue_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue_lock
    ADD CONSTRAINT knex_migrations_venue_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations_venue knex_migrations_venue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue
    ADD CONSTRAINT knex_migrations_venue_pkey PRIMARY KEY (id);


--
-- Name: known_scalpers known_scalpers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.known_scalpers
    ADD CONSTRAINT known_scalpers_pkey PRIMARY KEY (id);


--
-- Name: manual_review_queue manual_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_pkey PRIMARY KEY (id);


--
-- Name: marketplace_blacklist marketplace_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_blacklist
    ADD CONSTRAINT marketplace_blacklist_pkey PRIMARY KEY (id);


--
-- Name: marketplace_disputes marketplace_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_disputes
    ADD CONSTRAINT marketplace_disputes_pkey PRIMARY KEY (id);


--
-- Name: marketplace_listings marketplace_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_pkey PRIMARY KEY (id);


--
-- Name: marketplace_listings marketplace_listings_ticket_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_ticket_id_unique UNIQUE (ticket_id);


--
-- Name: marketplace_price_history marketplace_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_price_history
    ADD CONSTRAINT marketplace_price_history_pkey PRIMARY KEY (id);


--
-- Name: marketplace_transfers marketplace_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transfers
    ADD CONSTRAINT marketplace_transfers_pkey PRIMARY KEY (id);


--
-- Name: metrics metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_pkey PRIMARY KEY (id);


--
-- Name: ml_fraud_models ml_fraud_models_model_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_fraud_models
    ADD CONSTRAINT ml_fraud_models_model_name_unique UNIQUE (model_name);


--
-- Name: ml_fraud_models ml_fraud_models_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_fraud_models
    ADD CONSTRAINT ml_fraud_models_pkey PRIMARY KEY (id);


--
-- Name: ml_fraud_predictions ml_fraud_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_fraud_predictions
    ADD CONSTRAINT ml_fraud_predictions_pkey PRIMARY KEY (id);


--
-- Name: nft_mint_queue nft_mint_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nft_mint_queue
    ADD CONSTRAINT nft_mint_queue_pkey PRIMARY KEY (id);


--
-- Name: nft_mints nft_mints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nft_mints
    ADD CONSTRAINT nft_mints_pkey PRIMARY KEY (id);


--
-- Name: nft_mints nft_mints_ticket_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nft_mints
    ADD CONSTRAINT nft_mints_ticket_id_unique UNIQUE (ticket_id);


--
-- Name: nft_transfers nft_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nft_transfers
    ADD CONSTRAINT nft_transfers_pkey PRIMARY KEY (id);


--
-- Name: notification_analytics notification_analytics_date_hour_channel_type_provider_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_analytics
    ADD CONSTRAINT notification_analytics_date_hour_channel_type_provider_unique UNIQUE (date, hour, channel, type, provider);


--
-- Name: notification_analytics notification_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_analytics
    ADD CONSTRAINT notification_analytics_pkey PRIMARY KEY (id);


--
-- Name: notification_campaigns notification_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_campaigns
    ADD CONSTRAINT notification_campaigns_pkey PRIMARY KEY (id);


--
-- Name: notification_clicks notification_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_clicks
    ADD CONSTRAINT notification_clicks_pkey PRIMARY KEY (id);


--
-- Name: notification_costs notification_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_costs
    ADD CONSTRAINT notification_costs_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_stats notification_delivery_stats_date_channel_provider_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_delivery_stats
    ADD CONSTRAINT notification_delivery_stats_date_channel_provider_unique UNIQUE (date, channel, provider);


--
-- Name: notification_delivery_stats notification_delivery_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_delivery_stats
    ADD CONSTRAINT notification_delivery_stats_pkey PRIMARY KEY (id);


--
-- Name: notification_engagement notification_engagement_notification_id_user_id_action_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_engagement
    ADD CONSTRAINT notification_engagement_notification_id_user_id_action_unique UNIQUE (notification_id, user_id, action);


--
-- Name: notification_engagement notification_engagement_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_engagement
    ADD CONSTRAINT notification_engagement_pkey PRIMARY KEY (id);


--
-- Name: notification_history notification_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_history
    ADD CONSTRAINT notification_history_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: notification_preference_history notification_preference_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preference_history
    ADD CONSTRAINT notification_preference_history_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notification_preferences notification_preferences_unsubscribe_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_unsubscribe_token_unique UNIQUE (unsubscribe_token);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_venue_id_name_version_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_venue_id_name_version_unique UNIQUE (venue_id, name, version);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_connections oauth_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);


--
-- Name: ofac_checks ofac_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ofac_checks
    ADD CONSTRAINT ofac_checks_pkey PRIMARY KEY (id);


--
-- Name: ofac_sdn_list ofac_sdn_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ofac_sdn_list
    ADD CONSTRAINT ofac_sdn_list_pkey PRIMARY KEY (id);


--
-- Name: offline_validation_cache offline_validation_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_validation_cache
    ADD CONSTRAINT offline_validation_cache_pkey PRIMARY KEY (id);


--
-- Name: offline_validation_cache offline_validation_cache_ticket_id_valid_from_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_validation_cache
    ADD CONSTRAINT offline_validation_cache_ticket_id_valid_from_unique UNIQUE (ticket_id, valid_from);


--
-- Name: order_discounts order_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_discounts
    ADD CONSTRAINT order_discounts_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outbox_dlq outbox_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outbox_dlq
    ADD CONSTRAINT outbox_dlq_pkey PRIMARY KEY (id);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: payment_escrows payment_escrows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_escrows
    ADD CONSTRAINT payment_escrows_pkey PRIMARY KEY (id);


--
-- Name: payment_event_sequence payment_event_sequence_payment_id_event_type_idempotency_key_un; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_event_sequence
    ADD CONSTRAINT payment_event_sequence_payment_id_event_type_idempotency_key_un UNIQUE (payment_id, event_type, idempotency_key);


--
-- Name: payment_event_sequence payment_event_sequence_payment_id_sequence_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_event_sequence
    ADD CONSTRAINT payment_event_sequence_payment_id_sequence_number_unique UNIQUE (payment_id, sequence_number);


--
-- Name: payment_event_sequence payment_event_sequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_event_sequence
    ADD CONSTRAINT payment_event_sequence_pkey PRIMARY KEY (id);


--
-- Name: payment_event_sequence payment_event_sequence_stripe_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_event_sequence
    ADD CONSTRAINT payment_event_sequence_stripe_event_id_unique UNIQUE (stripe_event_id);


--
-- Name: payment_idempotency payment_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_idempotency
    ADD CONSTRAINT payment_idempotency_pkey PRIMARY KEY (idempotency_key);


--
-- Name: payment_intents payment_intents_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_external_id_unique UNIQUE (external_id);


--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);


--
-- Name: payment_intents payment_intents_stripe_intent_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_stripe_intent_id_unique UNIQUE (stripe_intent_id);


--
-- Name: payment_refunds payment_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_pkey PRIMARY KEY (id);


--
-- Name: payment_retries payment_retries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_retries
    ADD CONSTRAINT payment_retries_pkey PRIMARY KEY (id);


--
-- Name: payment_state_machine payment_state_machine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_state_machine
    ADD CONSTRAINT payment_state_machine_pkey PRIMARY KEY (from_state, to_state, event_type);


--
-- Name: payment_state_transitions payment_state_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_stripe_payment_intent_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_stripe_payment_intent_id_unique UNIQUE (stripe_payment_intent_id);


--
-- Name: payout_methods payout_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_methods
    ADD CONSTRAINT payout_methods_pkey PRIMARY KEY (id);


--
-- Name: pending_price_changes pending_price_changes_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_price_changes
    ADD CONSTRAINT pending_price_changes_event_id_unique UNIQUE (event_id);


--
-- Name: pending_price_changes pending_price_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_price_changes
    ADD CONSTRAINT pending_price_changes_pkey PRIMARY KEY (id);


--
-- Name: platform_fees platform_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_fees
    ADD CONSTRAINT platform_fees_pkey PRIMARY KEY (id);


--
-- Name: platform_fees platform_fees_transfer_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_fees
    ADD CONSTRAINT platform_fees_transfer_id_unique UNIQUE (transfer_id);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: qr_codes qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_pkey PRIMARY KEY (id);


--
-- Name: queues queues_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_name_unique UNIQUE (name);


--
-- Name: queues queues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_key_unique UNIQUE (key);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: read_consistency_tokens read_consistency_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.read_consistency_tokens
    ADD CONSTRAINT read_consistency_tokens_pkey PRIMARY KEY (token);


--
-- Name: reconciliation_reports reconciliation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reconciliation_reports
    ADD CONSTRAINT reconciliation_reports_pkey PRIMARY KEY (id);


--
-- Name: reservation_history reservation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservation_history
    ADD CONSTRAINT reservation_history_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: risk_assessments risk_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.risk_assessments
    ADD CONSTRAINT risk_assessments_pkey PRIMARY KEY (id);


--
-- Name: risk_flags risk_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT risk_flags_pkey PRIMARY KEY (id);


--
-- Name: royalty_discrepancies royalty_discrepancies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_discrepancies
    ADD CONSTRAINT royalty_discrepancies_pkey PRIMARY KEY (id);


--
-- Name: royalty_distributions royalty_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_distributions
    ADD CONSTRAINT royalty_distributions_pkey PRIMARY KEY (id);


--
-- Name: royalty_payouts royalty_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_payouts
    ADD CONSTRAINT royalty_payouts_pkey PRIMARY KEY (id);


--
-- Name: royalty_reconciliation_runs royalty_reconciliation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_reconciliation_runs
    ADD CONSTRAINT royalty_reconciliation_runs_pkey PRIMARY KEY (id);


--
-- Name: scalper_reports scalper_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scalper_reports
    ADD CONSTRAINT scalper_reports_pkey PRIMARY KEY (id);


--
-- Name: scan_policies scan_policies_event_id_policy_type_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_policies
    ADD CONSTRAINT scan_policies_event_id_policy_type_unique UNIQUE (event_id, policy_type);


--
-- Name: scan_policies scan_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_policies
    ADD CONSTRAINT scan_policies_pkey PRIMARY KEY (id);


--
-- Name: scan_policy_templates scan_policy_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_policy_templates
    ADD CONSTRAINT scan_policy_templates_pkey PRIMARY KEY (id);


--
-- Name: scanner_devices scanner_devices_device_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanner_devices
    ADD CONSTRAINT scanner_devices_device_id_unique UNIQUE (device_id);


--
-- Name: scanner_devices scanner_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanner_devices
    ADD CONSTRAINT scanner_devices_pkey PRIMARY KEY (id);


--
-- Name: scans scans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scans
    ADD CONSTRAINT scans_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_name_unique UNIQUE (name);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: settlement_batches settlement_batches_batch_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlement_batches
    ADD CONSTRAINT settlement_batches_batch_number_unique UNIQUE (batch_number);


--
-- Name: settlement_batches settlement_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlement_batches
    ADD CONSTRAINT settlement_batches_pkey PRIMARY KEY (id);


--
-- Name: suppression_list suppression_list_identifier_hash_channel_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppression_list
    ADD CONSTRAINT suppression_list_identifier_hash_channel_unique UNIQUE (identifier_hash, channel);


--
-- Name: suppression_list suppression_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppression_list
    ADD CONSTRAINT suppression_list_pkey PRIMARY KEY (id);


--
-- Name: sync_logs sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_pkey PRIMARY KEY (id);


--
-- Name: sync_queue sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);


--
-- Name: tax_collections tax_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_collections
    ADD CONSTRAINT tax_collections_pkey PRIMARY KEY (id);


--
-- Name: tax_forms_1099da tax_forms_1099da_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_forms_1099da
    ADD CONSTRAINT tax_forms_1099da_pkey PRIMARY KEY (id);


--
-- Name: tax_forms_1099da tax_forms_1099da_user_id_tax_year_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_forms_1099da
    ADD CONSTRAINT tax_forms_1099da_user_id_tax_year_unique UNIQUE (user_id, tax_year);


--
-- Name: tax_records tax_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_records
    ADD CONSTRAINT tax_records_pkey PRIMARY KEY (id);


--
-- Name: tax_transactions tax_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_transactions
    ADD CONSTRAINT tax_transactions_pkey PRIMARY KEY (id);


--
-- Name: tax_transactions tax_transactions_transfer_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_transactions
    ADD CONSTRAINT tax_transactions_transfer_id_unique UNIQUE (transfer_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);


--
-- Name: ticket_transfers ticket_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_pkey PRIMARY KEY (id);


--
-- Name: ticket_types ticket_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);


--
-- Name: ticket_validations ticket_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_validations
    ADD CONSTRAINT ticket_validations_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: upload_sessions upload_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: user_blacklists user_blacklists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blacklists
    ADD CONSTRAINT user_blacklists_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_venue_roles user_venue_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: velocity_limits velocity_limits_entity_type_entity_id_action_type_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.velocity_limits
    ADD CONSTRAINT velocity_limits_entity_type_entity_id_action_type_unique UNIQUE (entity_type, entity_id, action_type);


--
-- Name: velocity_limits velocity_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.velocity_limits
    ADD CONSTRAINT velocity_limits_pkey PRIMARY KEY (id);


--
-- Name: venue_balances venue_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_balances
    ADD CONSTRAINT venue_balances_pkey PRIMARY KEY (id);


--
-- Name: venue_balances venue_balances_venue_id_balance_type_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_balances
    ADD CONSTRAINT venue_balances_venue_id_balance_type_unique UNIQUE (venue_id, balance_type);


--
-- Name: venue_branding venue_branding_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_branding
    ADD CONSTRAINT venue_branding_pkey PRIMARY KEY (id);


--
-- Name: venue_branding venue_branding_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_branding
    ADD CONSTRAINT venue_branding_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_compliance venue_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_pkey PRIMARY KEY (id);


--
-- Name: venue_compliance_reports venue_compliance_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reports
    ADD CONSTRAINT venue_compliance_reports_pkey PRIMARY KEY (id);


--
-- Name: venue_compliance_reviews venue_compliance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_pkey PRIMARY KEY (id);


--
-- Name: venue_compliance venue_compliance_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_integrations venue_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_pkey PRIMARY KEY (id);


--
-- Name: venue_layouts venue_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_pkey PRIMARY KEY (id);


--
-- Name: venue_marketplace_settings venue_marketplace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_marketplace_settings
    ADD CONSTRAINT venue_marketplace_settings_pkey PRIMARY KEY (venue_id);


--
-- Name: venue_notification_settings venue_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_notification_settings
    ADD CONSTRAINT venue_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: venue_notification_settings venue_notification_settings_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_notification_settings
    ADD CONSTRAINT venue_notification_settings_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_royalty_settings venue_royalty_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_royalty_settings
    ADD CONSTRAINT venue_royalty_settings_pkey PRIMARY KEY (id);


--
-- Name: venue_royalty_settings venue_royalty_settings_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_royalty_settings
    ADD CONSTRAINT venue_royalty_settings_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_settings venue_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_pkey PRIMARY KEY (id);


--
-- Name: venue_settings venue_settings_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_staff venue_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_pkey PRIMARY KEY (id);


--
-- Name: venue_tier_history venue_tier_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_tier_history
    ADD CONSTRAINT venue_tier_history_pkey PRIMARY KEY (id);


--
-- Name: venue_verifications venue_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_pkey PRIMARY KEY (id);


--
-- Name: venue_verifications venue_verifications_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_verifications venue_verifications_verification_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_verification_id_unique UNIQUE (verification_id);


--
-- Name: venues venues_custom_domain_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_custom_domain_unique UNIQUE (custom_domain);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: venues venues_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_slug_unique UNIQUE (slug);


--
-- Name: waiting_room_activity waiting_room_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waiting_room_activity
    ADD CONSTRAINT waiting_room_activity_pkey PRIMARY KEY (id);


--
-- Name: wallet_connections wallet_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbox webhook_inbox_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_inbox
    ADD CONSTRAINT webhook_inbox_event_id_unique UNIQUE (event_id);


--
-- Name: webhook_inbox webhook_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_inbox
    ADD CONSTRAINT webhook_inbox_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbox webhook_inbox_webhook_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_inbox
    ADD CONSTRAINT webhook_inbox_webhook_id_unique UNIQUE (webhook_id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: webhook_nonces webhook_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_nonces
    ADD CONSTRAINT webhook_nonces_pkey PRIMARY KEY (nonce);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: white_label_pricing white_label_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.white_label_pricing
    ADD CONSTRAINT white_label_pricing_pkey PRIMARY KEY (id);


--
-- Name: white_label_pricing white_label_pricing_tier_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.white_label_pricing
    ADD CONSTRAINT white_label_pricing_tier_name_unique UNIQUE (tier_name);


--
-- Name: ab_tests_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ab_tests_venue_id_index ON public.ab_tests USING btree (venue_id);


--
-- Name: abandoned_carts_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX abandoned_carts_user_id_index ON public.abandoned_carts USING btree (user_id);


--
-- Name: account_takeover_signals_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_takeover_signals_timestamp_index ON public.account_takeover_signals USING btree ("timestamp");


--
-- Name: account_takeover_signals_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_takeover_signals_user_id_index ON public.account_takeover_signals USING btree (user_id);


--
-- Name: analytics_aggregations_period_start_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_period_start_index ON public.analytics_aggregations USING btree (period_start);


--
-- Name: analytics_aggregations_tenant_id_aggregation_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_tenant_id_aggregation_type_index ON public.analytics_aggregations USING btree (tenant_id, aggregation_type);


--
-- Name: analytics_aggregations_tenant_id_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_tenant_id_entity_type_entity_id_index ON public.analytics_aggregations USING btree (tenant_id, entity_type, entity_id);


--
-- Name: analytics_aggregations_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_tenant_id_index ON public.analytics_aggregations USING btree (tenant_id);


--
-- Name: analytics_aggregations_tenant_id_metric_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_tenant_id_metric_type_index ON public.analytics_aggregations USING btree (tenant_id, metric_type);


--
-- Name: analytics_aggregations_tenant_id_time_period_period_start_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_aggregations_tenant_id_time_period_period_start_index ON public.analytics_aggregations USING btree (tenant_id, time_period, period_start);


--
-- Name: analytics_alerts_tenant_id_alert_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_tenant_id_alert_type_index ON public.analytics_alerts USING btree (tenant_id, alert_type);


--
-- Name: analytics_alerts_tenant_id_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_tenant_id_entity_type_entity_id_index ON public.analytics_alerts USING btree (tenant_id, entity_type, entity_id);


--
-- Name: analytics_alerts_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_tenant_id_index ON public.analytics_alerts USING btree (tenant_id);


--
-- Name: analytics_alerts_tenant_id_severity_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_tenant_id_severity_index ON public.analytics_alerts USING btree (tenant_id, severity);


--
-- Name: analytics_alerts_tenant_id_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_tenant_id_status_index ON public.analytics_alerts USING btree (tenant_id, status);


--
-- Name: analytics_alerts_triggered_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_alerts_triggered_at_index ON public.analytics_alerts USING btree (triggered_at);


--
-- Name: analytics_dashboards_tenant_id_created_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_dashboards_tenant_id_created_by_index ON public.analytics_dashboards USING btree (tenant_id, created_by);


--
-- Name: analytics_dashboards_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_dashboards_tenant_id_index ON public.analytics_dashboards USING btree (tenant_id);


--
-- Name: analytics_dashboards_tenant_id_is_default_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_dashboards_tenant_id_is_default_index ON public.analytics_dashboards USING btree (tenant_id, is_default);


--
-- Name: analytics_dashboards_tenant_id_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_dashboards_tenant_id_type_index ON public.analytics_dashboards USING btree (tenant_id, type);


--
-- Name: analytics_exports_expires_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_exports_expires_at_index ON public.analytics_exports USING btree (expires_at);


--
-- Name: analytics_exports_tenant_id_export_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_exports_tenant_id_export_type_index ON public.analytics_exports USING btree (tenant_id, export_type);


--
-- Name: analytics_exports_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_exports_tenant_id_index ON public.analytics_exports USING btree (tenant_id);


--
-- Name: analytics_exports_tenant_id_requested_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_exports_tenant_id_requested_by_index ON public.analytics_exports USING btree (tenant_id, requested_by);


--
-- Name: analytics_exports_tenant_id_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_exports_tenant_id_status_index ON public.analytics_exports USING btree (tenant_id, status);


--
-- Name: analytics_metrics_tenant_id_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_metrics_tenant_id_entity_type_entity_id_index ON public.analytics_metrics USING btree (tenant_id, entity_type, entity_id);


--
-- Name: analytics_metrics_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_metrics_tenant_id_index ON public.analytics_metrics USING btree (tenant_id);


--
-- Name: analytics_metrics_tenant_id_metric_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_metrics_tenant_id_metric_type_index ON public.analytics_metrics USING btree (tenant_id, metric_type);


--
-- Name: analytics_metrics_tenant_id_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_metrics_tenant_id_timestamp_index ON public.analytics_metrics USING btree (tenant_id, "timestamp");


--
-- Name: analytics_metrics_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_metrics_timestamp_index ON public.analytics_metrics USING btree ("timestamp");


--
-- Name: analytics_widgets_tenant_id_dashboard_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_widgets_tenant_id_dashboard_id_index ON public.analytics_widgets USING btree (tenant_id, dashboard_id);


--
-- Name: analytics_widgets_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_widgets_tenant_id_index ON public.analytics_widgets USING btree (tenant_id);


--
-- Name: analytics_widgets_tenant_id_widget_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_widgets_tenant_id_widget_type_index ON public.analytics_widgets USING btree (tenant_id, widget_type);


--
-- Name: audience_segments_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audience_segments_venue_id_index ON public.audience_segments USING btree (venue_id);


--
-- Name: bank_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bank_verifications_venue_id_index ON public.bank_verifications USING btree (venue_id);


--
-- Name: behavioral_analytics_session_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX behavioral_analytics_session_id_index ON public.behavioral_analytics USING btree (session_id);


--
-- Name: behavioral_analytics_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX behavioral_analytics_timestamp_index ON public.behavioral_analytics USING btree ("timestamp");


--
-- Name: behavioral_analytics_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX behavioral_analytics_user_id_index ON public.behavioral_analytics USING btree (user_id);


--
-- Name: card_fingerprints_card_fingerprint_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX card_fingerprints_card_fingerprint_index ON public.card_fingerprints USING btree (card_fingerprint);


--
-- Name: compliance_audit_log_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX compliance_audit_log_entity_type_entity_id_index ON public.compliance_audit_log USING btree (entity_type, entity_id);


--
-- Name: compliance_documents_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX compliance_documents_venue_id_index ON public.compliance_documents USING btree (venue_id);


--
-- Name: connections_integration_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX connections_integration_id_index ON public.connections USING btree (integration_id);


--
-- Name: connections_last_sync_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX connections_last_sync_at_index ON public.connections USING btree (last_sync_at);


--
-- Name: connections_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX connections_status_index ON public.connections USING btree (status);


--
-- Name: connections_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX connections_user_id_index ON public.connections USING btree (user_id);


--
-- Name: connections_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX connections_venue_id_index ON public.connections USING btree (venue_id);


--
-- Name: customer_lifetime_value_calculated_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_lifetime_value_calculated_at_index ON public.customer_lifetime_value USING btree (calculated_at);


--
-- Name: customer_lifetime_value_clv_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_lifetime_value_clv_index ON public.customer_lifetime_value USING btree (clv);


--
-- Name: customer_lifetime_value_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_lifetime_value_tenant_id_index ON public.customer_lifetime_value USING btree (tenant_id);


--
-- Name: customer_lifetime_value_venue_id_clv_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_lifetime_value_venue_id_clv_index ON public.customer_lifetime_value USING btree (venue_id, clv);


--
-- Name: customer_lifetime_value_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_lifetime_value_venue_id_index ON public.customer_lifetime_value USING btree (venue_id);


--
-- Name: customer_rfm_scores_calculated_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_calculated_at_index ON public.customer_rfm_scores USING btree (calculated_at);


--
-- Name: customer_rfm_scores_segment_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_segment_index ON public.customer_rfm_scores USING btree (segment);


--
-- Name: customer_rfm_scores_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_tenant_id_index ON public.customer_rfm_scores USING btree (tenant_id);


--
-- Name: customer_rfm_scores_total_score_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_total_score_index ON public.customer_rfm_scores USING btree (total_score);


--
-- Name: customer_rfm_scores_venue_id_churn_risk_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_venue_id_churn_risk_index ON public.customer_rfm_scores USING btree (venue_id, churn_risk);


--
-- Name: customer_rfm_scores_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_venue_id_index ON public.customer_rfm_scores USING btree (venue_id);


--
-- Name: customer_rfm_scores_venue_id_segment_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_rfm_scores_venue_id_segment_index ON public.customer_rfm_scores USING btree (venue_id, segment);


--
-- Name: customer_segments_last_calculated_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_segments_last_calculated_at_index ON public.customer_segments USING btree (last_calculated_at);


--
-- Name: customer_segments_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_segments_tenant_id_index ON public.customer_segments USING btree (tenant_id);


--
-- Name: device_activity_device_fingerprint_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX device_activity_device_fingerprint_index ON public.device_activity USING btree (device_fingerprint);


--
-- Name: device_activity_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX device_activity_user_id_index ON public.device_activity USING btree (user_id);


--
-- Name: devices_device_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX devices_device_id_index ON public.devices USING btree (device_id);


--
-- Name: devices_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX devices_is_active_index ON public.devices USING btree (is_active);


--
-- Name: devices_zone_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX devices_zone_index ON public.devices USING btree (zone);


--
-- Name: email_automation_triggers_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX email_automation_triggers_venue_id_index ON public.email_automation_triggers USING btree (venue_id);


--
-- Name: email_queue_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX email_queue_created_at_index ON public.email_queue USING btree (created_at);


--
-- Name: email_queue_status_priority_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX email_queue_status_priority_index ON public.email_queue USING btree (status, priority);


--
-- Name: event_royalty_settings_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_royalty_settings_event_id_index ON public.event_royalty_settings USING btree (event_id);


--
-- Name: external_verifications_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX external_verifications_created_at_index ON public.external_verifications USING btree (created_at);


--
-- Name: external_verifications_external_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX external_verifications_external_id_index ON public.external_verifications USING btree (external_id);


--
-- Name: external_verifications_provider_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX external_verifications_provider_status_index ON public.external_verifications USING btree (provider, status);


--
-- Name: external_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX external_verifications_venue_id_index ON public.external_verifications USING btree (venue_id);


--
-- Name: field_mappings_connection_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX field_mappings_connection_id_index ON public.field_mappings USING btree (connection_id);


--
-- Name: field_mappings_connection_id_source_field_target_field_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX field_mappings_connection_id_source_field_target_field_unique ON public.field_mappings USING btree (connection_id, source_field, target_field);


--
-- Name: field_mappings_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX field_mappings_is_active_index ON public.field_mappings USING btree (is_active);


--
-- Name: file_access_logs_accessed_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX file_access_logs_accessed_at_index ON public.file_access_logs USING btree (accessed_at);


--
-- Name: file_access_logs_accessed_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX file_access_logs_accessed_by_index ON public.file_access_logs USING btree (accessed_by);


--
-- Name: file_access_logs_file_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX file_access_logs_file_id_index ON public.file_access_logs USING btree (file_id);


--
-- Name: file_versions_file_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX file_versions_file_id_index ON public.file_versions USING btree (file_id);


--
-- Name: file_versions_file_id_version_number_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX file_versions_file_id_version_number_index ON public.file_versions USING btree (file_id, version_number);


--
-- Name: files_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX files_created_at_index ON public.files USING btree (created_at);


--
-- Name: files_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX files_entity_type_entity_id_index ON public.files USING btree (entity_type, entity_id);


--
-- Name: files_hash_sha256_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX files_hash_sha256_index ON public.files USING btree (hash_sha256);


--
-- Name: files_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX files_status_index ON public.files USING btree (status);


--
-- Name: files_uploaded_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX files_uploaded_by_index ON public.files USING btree (uploaded_by);


--
-- Name: form_1099_records_venue_id_year_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX form_1099_records_venue_id_year_index ON public.form_1099_records USING btree (venue_id, year);


--
-- Name: fraud_checks_device_fingerprint_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_checks_device_fingerprint_index ON public.fraud_checks USING btree (device_fingerprint);


--
-- Name: fraud_checks_payment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_checks_payment_id_index ON public.fraud_checks USING btree (payment_id);


--
-- Name: fraud_checks_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_checks_timestamp_index ON public.fraud_checks USING btree ("timestamp");


--
-- Name: fraud_checks_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_checks_user_id_index ON public.fraud_checks USING btree (user_id);


--
-- Name: fraud_review_queue_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_review_queue_created_at_index ON public.fraud_review_queue USING btree (created_at);


--
-- Name: fraud_review_queue_payment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_review_queue_payment_id_index ON public.fraud_review_queue USING btree (payment_id);


--
-- Name: fraud_review_queue_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fraud_review_queue_user_id_index ON public.fraud_review_queue USING btree (user_id);


--
-- Name: group_payments_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX group_payments_event_id_index ON public.group_payments USING btree (event_id);


--
-- Name: group_payments_organizer_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX group_payments_organizer_id_index ON public.group_payments USING btree (organizer_id);


--
-- Name: group_payments_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX group_payments_status_index ON public.group_payments USING btree (status);


--
-- Name: idx_ab_test_variants_test; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ab_test_variants_test ON public.ab_test_variants USING btree (ab_test_id);


--
-- Name: idx_ab_tests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ab_tests_status ON public.ab_tests USING btree (status);


--
-- Name: idx_ab_tests_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ab_tests_venue ON public.ab_tests USING btree (venue_id);


--
-- Name: idx_abandoned_carts_unsent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_abandoned_carts_unsent ON public.abandoned_carts USING btree (abandoned_at) WHERE ((recovery_email_sent = false) AND (converted = false));


--
-- Name: idx_abandoned_carts_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_abandoned_carts_user ON public.abandoned_carts USING btree (user_id, abandoned_at DESC);


--
-- Name: idx_account_takeover_signals_anomaly; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_account_takeover_signals_anomaly ON public.account_takeover_signals USING btree (is_anomaly) WHERE (is_anomaly = true);


--
-- Name: idx_account_takeover_signals_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_account_takeover_signals_user ON public.account_takeover_signals USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_alert_rules_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alert_rules_enabled ON public.alert_rules USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_alert_rules_metric; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alert_rules_metric ON public.alert_rules USING btree (metric_name);


--
-- Name: idx_alert_rules_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alert_rules_severity ON public.alert_rules USING btree (severity);


--
-- Name: idx_alerts_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_created_at ON public.alerts USING btree (created_at DESC);


--
-- Name: idx_alerts_resolved; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_resolved ON public.alerts USING btree (resolved) WHERE (resolved = false);


--
-- Name: idx_alerts_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_severity ON public.alerts USING btree (severity);


--
-- Name: idx_alerts_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_source ON public.alerts USING btree (source);


--
-- Name: idx_alerts_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_type ON public.alerts USING btree (type);


--
-- Name: idx_analytics_date_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_analytics_date_channel ON public.notification_analytics USING btree (date DESC, channel);


--
-- Name: idx_analytics_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_analytics_type ON public.notification_analytics USING btree (type, date DESC);


--
-- Name: idx_anti_bot_activities_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_activities_timestamp ON public.anti_bot_activities USING btree ("timestamp");


--
-- Name: idx_anti_bot_activities_user_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_activities_user_action ON public.anti_bot_activities USING btree (user_id, action_type);


--
-- Name: idx_anti_bot_activities_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_activities_user_id ON public.anti_bot_activities USING btree (user_id);


--
-- Name: idx_anti_bot_activities_user_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_activities_user_timestamp ON public.anti_bot_activities USING btree (user_id, "timestamp");


--
-- Name: idx_anti_bot_violations_flagged_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_violations_flagged_at ON public.anti_bot_violations USING btree (flagged_at);


--
-- Name: idx_anti_bot_violations_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_violations_severity ON public.anti_bot_violations USING btree (severity);


--
-- Name: idx_anti_bot_violations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anti_bot_violations_user_id ON public.anti_bot_violations USING btree (user_id);


--
-- Name: idx_audience_segments_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audience_segments_venue ON public.audience_segments USING btree (venue_id);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_log_entity ON public.compliance_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_automation_triggers_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_triggers_type ON public.email_automation_triggers USING btree (trigger_type, is_active);


--
-- Name: idx_automation_triggers_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_triggers_venue ON public.email_automation_triggers USING btree (venue_id);


--
-- Name: idx_behavioral_analytics_user_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_behavioral_analytics_user_session ON public.behavioral_analytics USING btree (user_id, session_id);


--
-- Name: idx_biometric_credentials_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_biometric_credentials_user_id ON public.biometric_credentials USING btree (user_id);


--
-- Name: idx_campaigns_ab_test; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaigns_ab_test ON public.notification_campaigns USING btree (ab_test_id) WHERE (ab_test_id IS NOT NULL);


--
-- Name: idx_campaigns_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaigns_scheduled ON public.notification_campaigns USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaigns_status ON public.notification_campaigns USING btree (status);


--
-- Name: idx_campaigns_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaigns_venue ON public.notification_campaigns USING btree (venue_id);


--
-- Name: idx_card_fingerprints_risk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_card_fingerprints_risk ON public.card_fingerprints USING btree (risk_level) WHERE ((risk_level)::text = ANY ((ARRAY['high'::character varying, 'blocked'::character varying])::text[]));


--
-- Name: idx_clicks_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clicks_date ON public.notification_clicks USING btree (clicked_at);


--
-- Name: idx_clicks_notification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clicks_notification ON public.notification_clicks USING btree (notification_id);


--
-- Name: idx_clicks_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clicks_user ON public.notification_clicks USING btree (user_id);


--
-- Name: idx_compliance_documents_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compliance_documents_venue_id ON public.compliance_documents USING btree (venue_id);


--
-- Name: idx_consent_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consent_customer ON public.consent_records USING btree (customer_id);


--
-- Name: idx_consent_customer_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consent_customer_channel ON public.consent_records USING btree (customer_id, channel);


--
-- Name: idx_consent_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consent_status ON public.consent_records USING btree (status);


--
-- Name: idx_consent_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consent_venue ON public.consent_records USING btree (venue_id) WHERE (venue_id IS NOT NULL);


--
-- Name: idx_costs_notification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_costs_notification ON public.notification_costs USING btree (notification_id);


--
-- Name: idx_costs_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_costs_period ON public.notification_costs USING btree (billing_period);


--
-- Name: idx_costs_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_costs_venue ON public.notification_costs USING btree (venue_id);


--
-- Name: idx_custom_domains_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_domains_domain ON public.custom_domains USING btree (domain);


--
-- Name: idx_custom_domains_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_domains_status ON public.custom_domains USING btree (status);


--
-- Name: idx_custom_domains_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_domains_venue_id ON public.custom_domains USING btree (venue_id);


--
-- Name: idx_custom_domains_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_domains_verified ON public.custom_domains USING btree (is_verified);


--
-- Name: idx_dashboards_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dashboards_name ON public.dashboards USING btree (name);


--
-- Name: idx_dashboards_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dashboards_owner ON public.dashboards USING btree (owner);


--
-- Name: idx_dashboards_shared; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dashboards_shared ON public.dashboards USING btree (shared) WHERE (shared = true);


--
-- Name: idx_discounts_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_discounts_active ON public.discounts USING btree (active);


--
-- Name: idx_discounts_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_discounts_code ON public.discounts USING btree (code) WHERE (active = true);


--
-- Name: idx_discounts_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_discounts_event_id ON public.discounts USING btree (event_id);


--
-- Name: idx_discounts_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_discounts_tenant_id ON public.discounts USING btree (tenant_id);


--
-- Name: idx_discounts_valid_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_discounts_valid_dates ON public.discounts USING btree (valid_from, valid_until);


--
-- Name: idx_engagement_notification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_engagement_notification ON public.notification_engagement USING btree (notification_id);


--
-- Name: idx_engagement_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_engagement_user ON public.notification_engagement USING btree (user_id, action_timestamp DESC);


--
-- Name: idx_event_capacity_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_available ON public.event_capacity USING btree (available_capacity);


--
-- Name: idx_event_capacity_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_event_id ON public.event_capacity USING btree (event_id);


--
-- Name: idx_event_capacity_reserved_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_reserved_expires ON public.event_capacity USING btree (reserved_expires_at);


--
-- Name: idx_event_capacity_schedule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_schedule_id ON public.event_capacity USING btree (schedule_id);


--
-- Name: idx_event_capacity_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_tenant_id ON public.event_capacity USING btree (tenant_id);


--
-- Name: idx_event_capacity_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_event_capacity_unique ON public.event_capacity USING btree (event_id, section_name, COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: idx_event_categories_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_is_active ON public.event_categories USING btree (is_active);


--
-- Name: idx_event_categories_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_parent_id ON public.event_categories USING btree (parent_id);


--
-- Name: idx_event_categories_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_slug ON public.event_categories USING btree (slug);


--
-- Name: idx_event_metadata_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_metadata_event_id ON public.event_metadata USING btree (event_id);


--
-- Name: idx_event_pricing_active_sales; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_active_sales ON public.event_pricing USING btree (is_active, sales_start_at, sales_end_at);


--
-- Name: idx_event_pricing_capacity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_capacity_id ON public.event_pricing USING btree (capacity_id);


--
-- Name: idx_event_pricing_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_event_id ON public.event_pricing USING btree (event_id);


--
-- Name: idx_event_pricing_schedule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_schedule_id ON public.event_pricing USING btree (schedule_id);


--
-- Name: idx_event_pricing_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_tenant_id ON public.event_pricing USING btree (tenant_id);


--
-- Name: idx_event_schedules_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_event_id ON public.event_schedules USING btree (event_id);


--
-- Name: idx_event_schedules_starts_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_starts_at ON public.event_schedules USING btree (starts_at);


--
-- Name: idx_event_schedules_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_status ON public.event_schedules USING btree (status);


--
-- Name: idx_event_schedules_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_tenant_id ON public.event_schedules USING btree (tenant_id);


--
-- Name: idx_event_schedules_tenant_starts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_tenant_starts ON public.event_schedules USING btree (tenant_id, starts_at);


--
-- Name: idx_events_accessibility_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_accessibility_gin ON public.events USING gin (accessibility_info);


--
-- Name: idx_events_allow_transfers; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_allow_transfers ON public.events USING btree (allow_transfers);


--
-- Name: idx_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_created_at ON public.events USING btree (created_at);


--
-- Name: idx_events_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_deleted_at ON public.events USING btree (deleted_at);


--
-- Name: idx_events_end_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_end_date ON public.events USING btree (end_date);


--
-- Name: idx_events_is_featured_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_is_featured_priority ON public.events USING btree (is_featured, priority_score);


--
-- Name: idx_events_metadata_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_metadata_gin ON public.events USING gin (metadata);


--
-- Name: idx_events_primary_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_primary_category_id ON public.events USING btree (primary_category_id);


--
-- Name: idx_events_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_search ON public.events USING gin (to_tsvector('english'::regconfig, (((((COALESCE(name, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(short_description, ''::character varying))::text)));


--
-- Name: idx_events_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_slug ON public.events USING btree (slug);


--
-- Name: idx_events_start_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_start_date ON public.events USING btree (start_date);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_tenant_id ON public.events USING btree (tenant_id);


--
-- Name: idx_events_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_tenant_status ON public.events USING btree (tenant_id, status);


--
-- Name: idx_events_transfer_blackout; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_transfer_blackout ON public.events USING btree (transfer_blackout_start, transfer_blackout_end);


--
-- Name: idx_events_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_venue_id ON public.events USING btree (venue_id);


--
-- Name: idx_events_venue_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_events_venue_slug ON public.events USING btree (venue_id, slug) WHERE (deleted_at IS NULL);


--
-- Name: idx_form_1099_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_form_1099_venue ON public.form_1099_records USING btree (venue_id, year);


--
-- Name: idx_fraud_events_investigated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_events_investigated ON public.fraud_events USING btree (investigated) WHERE (investigated = false);


--
-- Name: idx_fraud_events_pattern; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_events_pattern ON public.fraud_events USING btree (pattern);


--
-- Name: idx_fraud_events_risk_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_events_risk_level ON public.fraud_events USING btree (risk_level);


--
-- Name: idx_fraud_events_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_events_timestamp ON public.fraud_events USING btree ("timestamp" DESC);


--
-- Name: idx_fraud_events_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_fraud_events_unique ON public.fraud_events USING btree (user_id, pattern, "timestamp");


--
-- Name: idx_fraud_events_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_events_user ON public.fraud_events USING btree (user_id);


--
-- Name: idx_fraud_review_queue_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_review_queue_assigned ON public.fraud_review_queue USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_fraud_review_queue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_review_queue_status ON public.fraud_review_queue USING btree (status, priority);


--
-- Name: idx_fraud_rules_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fraud_rules_active ON public.fraud_rules USING btree (is_active, priority);


--
-- Name: idx_idempotency_keys_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_index_queue_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_index_queue_priority ON public.index_queue USING btree (priority, created_at);


--
-- Name: idx_index_queue_unprocessed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_index_queue_unprocessed ON public.index_queue USING btree (processed_at);


--
-- Name: idx_index_versions_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_index_versions_entity ON public.index_versions USING btree (entity_type, entity_id);


--
-- Name: idx_index_versions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_index_versions_status ON public.index_versions USING btree (index_status, created_at);


--
-- Name: idx_invalidated_tokens_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invalidated_tokens_expires_at ON public.invalidated_tokens USING btree (expires_at);


--
-- Name: idx_invalidated_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invalidated_tokens_user_id ON public.invalidated_tokens USING btree (user_id);


--
-- Name: idx_ip_reputation_risk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ip_reputation_risk ON public.ip_reputation USING btree (risk_score) WHERE (risk_score > 50);


--
-- Name: idx_ip_reputation_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ip_reputation_status ON public.ip_reputation USING btree (reputation_status);


--
-- Name: idx_marketplace_blacklist_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_blacklist_expires_at ON public.marketplace_blacklist USING btree (expires_at);


--
-- Name: idx_marketplace_blacklist_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_blacklist_is_active ON public.marketplace_blacklist USING btree (is_active);


--
-- Name: idx_marketplace_blacklist_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_blacklist_user_id ON public.marketplace_blacklist USING btree (user_id);


--
-- Name: idx_marketplace_blacklist_wallet_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_blacklist_wallet_address ON public.marketplace_blacklist USING btree (wallet_address);


--
-- Name: idx_marketplace_disputes_filed_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_disputes_filed_by ON public.marketplace_disputes USING btree (filed_by);


--
-- Name: idx_marketplace_disputes_listing_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_disputes_listing_id ON public.marketplace_disputes USING btree (listing_id);


--
-- Name: idx_marketplace_disputes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_disputes_status ON public.marketplace_disputes USING btree (status);


--
-- Name: idx_marketplace_disputes_transfer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_disputes_transfer_id ON public.marketplace_disputes USING btree (transfer_id);


--
-- Name: idx_marketplace_listings_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_event_id ON public.marketplace_listings USING btree (event_id);


--
-- Name: idx_marketplace_listings_event_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_event_status ON public.marketplace_listings USING btree (event_id, status);


--
-- Name: idx_marketplace_listings_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_expires_at ON public.marketplace_listings USING btree (expires_at);


--
-- Name: idx_marketplace_listings_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_seller_id ON public.marketplace_listings USING btree (seller_id);


--
-- Name: idx_marketplace_listings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_status ON public.marketplace_listings USING btree (status);


--
-- Name: idx_marketplace_listings_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_ticket_id ON public.marketplace_listings USING btree (ticket_id);


--
-- Name: idx_marketplace_listings_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_listings_venue_id ON public.marketplace_listings USING btree (venue_id);


--
-- Name: idx_marketplace_price_history_changed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_price_history_changed_at ON public.marketplace_price_history USING btree (changed_at);


--
-- Name: idx_marketplace_price_history_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_price_history_event_id ON public.marketplace_price_history USING btree (event_id);


--
-- Name: idx_marketplace_price_history_listing_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_price_history_listing_id ON public.marketplace_price_history USING btree (listing_id);


--
-- Name: idx_marketplace_transfers_buyer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_buyer_id ON public.marketplace_transfers USING btree (buyer_id);


--
-- Name: idx_marketplace_transfers_buyer_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_buyer_status ON public.marketplace_transfers USING btree (buyer_id, status);


--
-- Name: idx_marketplace_transfers_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_event_id ON public.marketplace_transfers USING btree (event_id);


--
-- Name: idx_marketplace_transfers_listing_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_listing_id ON public.marketplace_transfers USING btree (listing_id);


--
-- Name: idx_marketplace_transfers_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_seller_id ON public.marketplace_transfers USING btree (seller_id);


--
-- Name: idx_marketplace_transfers_seller_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_seller_status ON public.marketplace_transfers USING btree (seller_id, status);


--
-- Name: idx_marketplace_transfers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_transfers_status ON public.marketplace_transfers USING btree (status);


--
-- Name: idx_metrics_metric_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_metric_name ON public.metrics USING btree (metric_name);


--
-- Name: idx_metrics_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_name ON public.metrics USING btree (name);


--
-- Name: idx_metrics_name_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_name_timestamp ON public.metrics USING btree (name, "timestamp" DESC);


--
-- Name: idx_metrics_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_service ON public.metrics USING btree (service);


--
-- Name: idx_metrics_service_metric_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_service_metric_timestamp ON public.metrics USING btree (service_name, metric_name, "timestamp" DESC);


--
-- Name: idx_metrics_service_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_service_name ON public.metrics USING btree (service_name);


--
-- Name: idx_metrics_service_name_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_service_name_timestamp ON public.metrics USING btree (service_name, "timestamp" DESC);


--
-- Name: idx_metrics_service_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_service_timestamp ON public.metrics USING btree (service, "timestamp" DESC);


--
-- Name: idx_metrics_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_metrics_timestamp ON public.metrics USING btree ("timestamp" DESC);


--
-- Name: idx_ml_fraud_models_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_fraud_models_active ON public.ml_fraud_models USING btree (status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_ml_fraud_predictions_high_risk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_fraud_predictions_high_risk ON public.ml_fraud_predictions USING btree (fraud_probability) WHERE (fraud_probability > 0.7);


--
-- Name: idx_nft_mints_mint_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_mints_mint_address ON public.nft_mints USING btree (mint_address);


--
-- Name: idx_nft_mints_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_mints_status ON public.nft_mints USING btree (status);


--
-- Name: idx_nft_mints_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_mints_ticket_id ON public.nft_mints USING btree (ticket_id);


--
-- Name: idx_nft_transfers_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_transfers_created ON public.nft_transfers USING btree (created_at DESC);


--
-- Name: idx_nft_transfers_from; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_transfers_from ON public.nft_transfers USING btree (from_address);


--
-- Name: idx_nft_transfers_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_transfers_to ON public.nft_transfers USING btree (to_address);


--
-- Name: idx_nft_transfers_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nft_transfers_token ON public.nft_transfers USING btree (token_address);


--
-- Name: idx_notification_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_channel ON public.notification_history USING btree (channel);


--
-- Name: idx_notification_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_created ON public.notification_history USING btree (created_at DESC);


--
-- Name: idx_notification_delivery_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_delivery_status ON public.notification_history USING btree (delivery_status) WHERE ((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'retrying'::character varying])::text[]));


--
-- Name: idx_notification_recipient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_recipient ON public.notification_history USING btree (recipient_id);


--
-- Name: idx_notification_retry_after; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_retry_after ON public.notification_history USING btree (retry_after) WHERE ((retry_after IS NOT NULL) AND (should_retry = true));


--
-- Name: idx_notification_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_scheduled ON public.notification_history USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL);


--
-- Name: idx_notification_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_status ON public.notification_history USING btree (status);


--
-- Name: idx_notification_user_delivery; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_user_delivery ON public.notification_history USING btree (recipient_id, delivery_status, created_at DESC);


--
-- Name: idx_notification_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_venue ON public.notification_history USING btree (venue_id);


--
-- Name: idx_oauth_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oauth_connections_user_id ON public.oauth_connections USING btree (user_id);


--
-- Name: idx_ofac_checks_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ofac_checks_venue_id ON public.ofac_checks USING btree (venue_id);


--
-- Name: idx_ofac_sdn_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ofac_sdn_name ON public.ofac_sdn_list USING btree (full_name);


--
-- Name: idx_order_discounts_discount_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_discounts_discount_id ON public.order_discounts USING btree (discount_id);


--
-- Name: idx_order_discounts_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_discounts_order_id ON public.order_discounts USING btree (order_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_ticket_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_ticket_type_id ON public.order_items USING btree (ticket_type_id);


--
-- Name: idx_orders_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_event_id ON public.orders USING btree (event_id);


--
-- Name: idx_orders_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_expires_at ON public.orders USING btree (expires_at);


--
-- Name: idx_orders_idempotency_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_idempotency_key ON public.orders USING btree (idempotency_key);


--
-- Name: idx_orders_order_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);


--
-- Name: idx_orders_payment_intent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_payment_intent_id ON public.orders USING btree (payment_intent_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_tenant_id ON public.orders USING btree (tenant_id);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- Name: idx_outbox_aggregate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_outbox_aggregate ON public.outbox USING btree (aggregate_type, aggregate_id);


--
-- Name: idx_outbox_processed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_outbox_processed ON public.outbox USING btree (processed_at) WHERE (processed_at IS NULL);


--
-- Name: idx_payment_event_sequence_payment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_event_sequence_payment ON public.payment_event_sequence USING btree (payment_id, sequence_number);


--
-- Name: idx_payment_event_sequence_unprocessed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_event_sequence_unprocessed ON public.payment_event_sequence USING btree (processed_at) WHERE (processed_at IS NULL);


--
-- Name: idx_platform_fees_platform_collected; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_fees_platform_collected ON public.platform_fees USING btree (platform_fee_collected);


--
-- Name: idx_platform_fees_transfer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_fees_transfer_id ON public.platform_fees USING btree (transfer_id);


--
-- Name: idx_platform_fees_venue_paid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_fees_venue_paid ON public.platform_fees USING btree (venue_fee_paid);


--
-- Name: idx_preference_history_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_preference_history_user ON public.notification_preference_history USING btree (user_id, created_at DESC);


--
-- Name: idx_preferences_unsubscribe_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_preferences_unsubscribe_token ON public.notification_preferences USING btree (unsubscribe_token) WHERE (unsubscribe_token IS NOT NULL);


--
-- Name: idx_preferences_unsubscribed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_preferences_unsubscribed ON public.notification_preferences USING btree (unsubscribed_at) WHERE (unsubscribed_at IS NOT NULL);


--
-- Name: idx_qr_codes_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qr_codes_code ON public.qr_codes USING btree (code);


--
-- Name: idx_qr_codes_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qr_codes_expires_at ON public.qr_codes USING btree (expires_at);


--
-- Name: idx_qr_codes_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qr_codes_ticket_id ON public.qr_codes USING btree (ticket_id);


--
-- Name: idx_read_consistency_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_read_consistency_expires ON public.read_consistency_tokens USING btree (expires_at);


--
-- Name: idx_reservation_history_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservation_history_created_at ON public.reservation_history USING btree (created_at);


--
-- Name: idx_reservation_history_reservation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservation_history_reservation_id ON public.reservation_history USING btree (reservation_id);


--
-- Name: idx_reservations_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_event_id ON public.reservations USING btree (event_id);


--
-- Name: idx_reservations_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_expires_at ON public.reservations USING btree (expires_at);


--
-- Name: idx_reservations_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_order_id ON public.reservations USING btree (order_id);


--
-- Name: idx_reservations_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_status ON public.reservations USING btree (status);


--
-- Name: idx_reservations_status_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_status_expires ON public.reservations USING btree (status, expires_at);


--
-- Name: idx_reservations_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_tenant_id ON public.reservations USING btree (tenant_id);


--
-- Name: idx_reservations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_user_id ON public.reservations USING btree (user_id);


--
-- Name: idx_risk_flags_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_risk_flags_venue_id ON public.risk_flags USING btree (venue_id);


--
-- Name: idx_scalper_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scalper_reports_status ON public.scalper_reports USING btree (status);


--
-- Name: idx_scalper_reports_suspected; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scalper_reports_suspected ON public.scalper_reports USING btree (suspected_scalper_id, status);


--
-- Name: idx_suppression_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_suppression_expires ON public.suppression_list USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_suppression_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_suppression_hash ON public.suppression_list USING btree (identifier_hash, channel);


--
-- Name: idx_tax_records_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_records_venue_id ON public.tax_records USING btree (venue_id);


--
-- Name: idx_tax_records_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_records_year ON public.tax_records USING btree (year);


--
-- Name: idx_tax_transactions_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_transactions_seller_id ON public.tax_transactions USING btree (seller_id);


--
-- Name: idx_tax_transactions_seller_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_transactions_seller_year ON public.tax_transactions USING btree (seller_id, tax_year);


--
-- Name: idx_tax_transactions_tax_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_transactions_tax_year ON public.tax_transactions USING btree (tax_year);


--
-- Name: idx_tax_transactions_transfer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_transactions_transfer_id ON public.tax_transactions USING btree (transfer_id);


--
-- Name: idx_templates_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_active ON public.notification_templates USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_templates_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_channel ON public.notification_templates USING btree (channel);


--
-- Name: idx_templates_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_venue ON public.notification_templates USING btree (venue_id) WHERE (venue_id IS NOT NULL);


--
-- Name: idx_ticket_transfers_from_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_from_user_id ON public.ticket_transfers USING btree (from_user_id);


--
-- Name: idx_ticket_transfers_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_tenant_id ON public.ticket_transfers USING btree (tenant_id);


--
-- Name: idx_ticket_transfers_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_ticket_id ON public.ticket_transfers USING btree (ticket_id);


--
-- Name: idx_ticket_transfers_to_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_to_user_id ON public.ticket_transfers USING btree (to_user_id);


--
-- Name: idx_ticket_transfers_transfer_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_transfer_code ON public.ticket_transfers USING btree (transfer_code);


--
-- Name: idx_ticket_types_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_available ON public.ticket_types USING btree (available_quantity);


--
-- Name: idx_ticket_types_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_event_id ON public.ticket_types USING btree (event_id);


--
-- Name: idx_ticket_types_tenant_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_tenant_event ON public.ticket_types USING btree (tenant_id, event_id);


--
-- Name: idx_ticket_types_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_tenant_id ON public.ticket_types USING btree (tenant_id);


--
-- Name: idx_ticket_validations_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_validations_event_id ON public.ticket_validations USING btree (event_id);


--
-- Name: idx_ticket_validations_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_validations_tenant_id ON public.ticket_validations USING btree (tenant_id);


--
-- Name: idx_ticket_validations_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_validations_ticket_id ON public.ticket_validations USING btree (ticket_id);


--
-- Name: idx_ticket_validations_validated_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_validations_validated_at ON public.ticket_validations USING btree (validated_at);


--
-- Name: idx_tickets_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_event_id ON public.tickets USING btree (event_id);


--
-- Name: idx_tickets_nft_token_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_nft_token_id ON public.tickets USING btree (nft_token_id);


--
-- Name: idx_tickets_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_order_id ON public.tickets USING btree (order_id);


--
-- Name: idx_tickets_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_payment_id ON public.tickets USING btree (payment_id);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_tenant_id ON public.tickets USING btree (tenant_id);


--
-- Name: idx_tickets_tenant_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_tenant_user ON public.tickets USING btree (tenant_id, user_id);


--
-- Name: idx_tickets_ticket_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_ticket_type_id ON public.tickets USING btree (ticket_type_id);


--
-- Name: idx_tickets_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);


--
-- Name: idx_trusted_devices_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices USING btree (user_id);


--
-- Name: idx_user_blacklists_action_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_blacklists_action_type ON public.user_blacklists USING btree (action_type);


--
-- Name: idx_user_blacklists_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_blacklists_user_id ON public.user_blacklists USING btree (user_id);


--
-- Name: idx_user_sessions_ended_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_user_venue_roles_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_venue_roles_user_id ON public.user_venue_roles USING btree (user_id);


--
-- Name: idx_user_venue_roles_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_venue_roles_venue_id ON public.user_venue_roles USING btree (venue_id);


--
-- Name: idx_users_can_receive_transfers; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_can_receive_transfers ON public.users USING btree (can_receive_transfers);


--
-- Name: idx_users_country_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_country_code ON public.users USING btree (country_code);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_display_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_display_name ON public.users USING btree (display_name);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_email_verification_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email_verification_token ON public.users USING btree (email_verification_token);


--
-- Name: idx_users_identity_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_identity_verified ON public.users USING btree (identity_verified);


--
-- Name: idx_users_metadata_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_metadata_gin ON public.users USING gin (metadata);


--
-- Name: idx_users_password_reset_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_password_reset_token ON public.users USING btree (password_reset_token);


--
-- Name: idx_users_permissions_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_permissions_gin ON public.users USING gin (permissions);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: idx_users_preferences_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_preferences_gin ON public.users USING gin (preferences);


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_role_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role_status ON public.users USING btree (role, status);


--
-- Name: idx_users_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_search ON public.users USING gin (to_tsvector('english'::regconfig, (((((((((COALESCE(username, ''::character varying))::text || ' '::text) || (COALESCE(display_name, ''::character varying))::text) || ' '::text) || (COALESCE(first_name, ''::character varying))::text) || ' '::text) || (COALESCE(last_name, ''::character varying))::text) || ' '::text) || (COALESCE(email, ''::character varying))::text)));


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_status_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_status_created_at ON public.users USING btree (status, created_at);


--
-- Name: idx_users_timezone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_timezone ON public.users USING btree (timezone);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_velocity_limits_window; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_velocity_limits_window ON public.velocity_limits USING btree (window_end) WHERE (current_count >= limit_count);


--
-- Name: idx_venue_branding_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_branding_venue_id ON public.venue_branding USING btree (venue_id);


--
-- Name: idx_venue_integrations_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_type ON public.venue_integrations USING btree (integration_type);


--
-- Name: idx_venue_integrations_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_venue_integrations_unique ON public.venue_integrations USING btree (venue_id, integration_type);


--
-- Name: idx_venue_integrations_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_venue_id ON public.venue_integrations USING btree (venue_id);


--
-- Name: idx_venue_layouts_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_deleted_at ON public.venue_layouts USING btree (deleted_at);


--
-- Name: idx_venue_layouts_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_venue_id ON public.venue_layouts USING btree (venue_id);


--
-- Name: idx_venue_settings_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_settings_venue ON public.venue_notification_settings USING btree (venue_id);


--
-- Name: idx_venue_settings_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_settings_venue_id ON public.venue_settings USING btree (venue_id);


--
-- Name: idx_venue_staff_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_is_active ON public.venue_staff USING btree (is_active);


--
-- Name: idx_venue_staff_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_role ON public.venue_staff USING btree (role);


--
-- Name: idx_venue_staff_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_venue_staff_unique ON public.venue_staff USING btree (venue_id, user_id);


--
-- Name: idx_venue_staff_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_user_id ON public.venue_staff USING btree (user_id);


--
-- Name: idx_venue_staff_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_venue_id ON public.venue_staff USING btree (venue_id);


--
-- Name: idx_venue_tier_history_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_tier_history_venue_id ON public.venue_tier_history USING btree (venue_id, changed_at DESC);


--
-- Name: idx_venue_verifications_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_verifications_status ON public.venue_verifications USING btree (status);


--
-- Name: idx_venue_verifications_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_verifications_venue_id ON public.venue_verifications USING btree (venue_id);


--
-- Name: idx_venues_amenities_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_amenities_gin ON public.venues USING gin (amenities);


--
-- Name: idx_venues_city; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_city ON public.venues USING btree (city);


--
-- Name: idx_venues_country_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_country_code ON public.venues USING btree (country_code);


--
-- Name: idx_venues_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_created_by ON public.venues USING btree (created_by);


--
-- Name: idx_venues_custom_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_custom_domain ON public.venues USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);


--
-- Name: idx_venues_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_deleted_at ON public.venues USING btree (deleted_at);


--
-- Name: idx_venues_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_email ON public.venues USING btree (email);


--
-- Name: idx_venues_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_location ON public.venues USING btree (latitude, longitude);


--
-- Name: idx_venues_metadata_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_metadata_gin ON public.venues USING gin (metadata);


--
-- Name: idx_venues_pricing_tier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_pricing_tier ON public.venues USING btree (pricing_tier);


--
-- Name: idx_venues_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_search ON public.venues USING gin (to_tsvector('english'::regconfig, (((((((COALESCE(name, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(city, ''::character varying))::text) || ' '::text) || (COALESCE(state_province, ''::character varying))::text)));


--
-- Name: idx_venues_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_slug ON public.venues USING btree (slug);


--
-- Name: idx_venues_social_media_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_social_media_gin ON public.venues USING gin (social_media);


--
-- Name: idx_venues_state_province; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_state_province ON public.venues USING btree (state_province);


--
-- Name: idx_venues_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_status ON public.venues USING btree (status);


--
-- Name: idx_venues_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_tenant_id ON public.venues USING btree (tenant_id);


--
-- Name: idx_venues_transfer_deadline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_transfer_deadline ON public.venues USING btree (transfer_deadline_hours);


--
-- Name: idx_venues_venue_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_venue_type ON public.venues USING btree (venue_type);


--
-- Name: idx_wallet_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_connections_user_id ON public.wallet_connections USING btree (user_id);


--
-- Name: idx_webhook_inbox_provider_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_inbox_provider_event ON public.webhook_inbox USING btree (provider, event_id);


--
-- Name: idx_webhook_logs_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_logs_source ON public.webhook_logs USING btree (source);


--
-- Name: idx_webhook_nonces_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_nonces_expires_at ON public.webhook_nonces USING btree (expires_at);


--
-- Name: idx_white_label_pricing_tier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_white_label_pricing_tier ON public.white_label_pricing USING btree (tier_name);


--
-- Name: integration_configs_health_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_configs_health_status_idx ON public.integration_configs USING btree (health_status);


--
-- Name: integration_configs_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_configs_integration_type_idx ON public.integration_configs USING btree (integration_type);


--
-- Name: integration_configs_last_sync_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_configs_last_sync_at_idx ON public.integration_configs USING btree (last_sync_at);


--
-- Name: integration_configs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_configs_status_idx ON public.integration_configs USING btree (status);


--
-- Name: integration_configs_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_configs_venue_id_idx ON public.integration_configs USING btree (venue_id);


--
-- Name: integration_configs_venue_integration_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX integration_configs_venue_integration_unique ON public.integration_configs USING btree (venue_id, integration_type);


--
-- Name: integration_costs_composite_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_costs_composite_idx ON public.integration_costs USING btree (venue_id, integration_type, period_start);


--
-- Name: integration_costs_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_costs_integration_type_idx ON public.integration_costs USING btree (integration_type);


--
-- Name: integration_costs_period_start_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_costs_period_start_idx ON public.integration_costs USING btree (period_start);


--
-- Name: integration_costs_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_costs_venue_id_idx ON public.integration_costs USING btree (venue_id);


--
-- Name: integration_health_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_health_integration_type_idx ON public.integration_health USING btree (integration_type);


--
-- Name: integration_health_last_check_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_health_last_check_at_idx ON public.integration_health USING btree (last_check_at);


--
-- Name: integration_health_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_health_status_idx ON public.integration_health USING btree (status);


--
-- Name: integration_health_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_health_venue_id_idx ON public.integration_health USING btree (venue_id);


--
-- Name: integration_health_venue_integration_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX integration_health_venue_integration_unique ON public.integration_health USING btree (venue_id, integration_type);


--
-- Name: integration_webhooks_event_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_event_type_idx ON public.integration_webhooks USING btree (event_type);


--
-- Name: integration_webhooks_external_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_external_id_idx ON public.integration_webhooks USING btree (external_id);


--
-- Name: integration_webhooks_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_integration_type_idx ON public.integration_webhooks USING btree (integration_type);


--
-- Name: integration_webhooks_received_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_received_at_idx ON public.integration_webhooks USING btree (received_at);


--
-- Name: integration_webhooks_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_status_idx ON public.integration_webhooks USING btree (status);


--
-- Name: integration_webhooks_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integration_webhooks_venue_id_idx ON public.integration_webhooks USING btree (venue_id);


--
-- Name: integrations_category_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integrations_category_index ON public.integrations USING btree (category);


--
-- Name: integrations_name_provider_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX integrations_name_provider_unique ON public.integrations USING btree (name, provider);


--
-- Name: integrations_provider_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integrations_provider_index ON public.integrations USING btree (provider);


--
-- Name: integrations_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX integrations_status_index ON public.integrations USING btree (status);


--
-- Name: jobs_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_created_at_index ON public.jobs USING btree (created_at);


--
-- Name: jobs_queue_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);


--
-- Name: jobs_queue_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_queue_status_index ON public.jobs USING btree (queue, status);


--
-- Name: jobs_scheduled_for_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_scheduled_for_index ON public.jobs USING btree (scheduled_for);


--
-- Name: jobs_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_status_index ON public.jobs USING btree (status);


--
-- Name: jobs_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jobs_type_index ON public.jobs USING btree (type);


--
-- Name: manual_review_queue_assigned_to_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX manual_review_queue_assigned_to_index ON public.manual_review_queue USING btree (assigned_to);


--
-- Name: manual_review_queue_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX manual_review_queue_created_at_index ON public.manual_review_queue USING btree (created_at);


--
-- Name: manual_review_queue_status_priority_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX manual_review_queue_status_priority_index ON public.manual_review_queue USING btree (status, priority);


--
-- Name: manual_review_queue_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX manual_review_queue_venue_id_index ON public.manual_review_queue USING btree (venue_id);


--
-- Name: ml_fraud_predictions_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ml_fraud_predictions_created_at_index ON public.ml_fraud_predictions USING btree (created_at);


--
-- Name: ml_fraud_predictions_model_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ml_fraud_predictions_model_id_index ON public.ml_fraud_predictions USING btree (model_id);


--
-- Name: ml_fraud_predictions_transaction_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ml_fraud_predictions_transaction_id_index ON public.ml_fraud_predictions USING btree (transaction_id);


--
-- Name: ml_fraud_predictions_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ml_fraud_predictions_user_id_index ON public.ml_fraud_predictions USING btree (user_id);


--
-- Name: nft_mint_queue_payment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nft_mint_queue_payment_id_index ON public.nft_mint_queue USING btree (payment_id);


--
-- Name: nft_mint_queue_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nft_mint_queue_status_index ON public.nft_mint_queue USING btree (status);


--
-- Name: notifications_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notifications_created_at_index ON public.notifications USING btree (created_at);


--
-- Name: notifications_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notifications_type_index ON public.notifications USING btree (type);


--
-- Name: notifications_user_id_read_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notifications_user_id_read_index ON public.notifications USING btree (user_id, read);


--
-- Name: notifications_venue_id_read_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notifications_venue_id_read_index ON public.notifications USING btree (venue_id, read);


--
-- Name: ofac_checks_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ofac_checks_venue_id_index ON public.ofac_checks USING btree (venue_id);


--
-- Name: ofac_sdn_list_full_name_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ofac_sdn_list_full_name_index ON public.ofac_sdn_list USING btree (full_name);


--
-- Name: offline_validation_cache_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_validation_cache_event_id_index ON public.offline_validation_cache USING btree (event_id);


--
-- Name: offline_validation_cache_event_id_valid_until_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_validation_cache_event_id_valid_until_index ON public.offline_validation_cache USING btree (event_id, valid_until);


--
-- Name: offline_validation_cache_ticket_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_validation_cache_ticket_id_index ON public.offline_validation_cache USING btree (ticket_id);


--
-- Name: offline_validation_cache_valid_until_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_validation_cache_valid_until_index ON public.offline_validation_cache USING btree (valid_until);


--
-- Name: payment_escrows_buyer_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_escrows_buyer_id_index ON public.payment_escrows USING btree (buyer_id);


--
-- Name: payment_escrows_seller_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_escrows_seller_id_index ON public.payment_escrows USING btree (seller_id);


--
-- Name: payment_escrows_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_escrows_status_index ON public.payment_escrows USING btree (status);


--
-- Name: payment_event_sequence_event_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_event_sequence_event_timestamp_index ON public.payment_event_sequence USING btree (event_timestamp);


--
-- Name: payment_idempotency_expires_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_idempotency_expires_at_index ON public.payment_idempotency USING btree (expires_at);


--
-- Name: payment_intents_external_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_intents_external_id_index ON public.payment_intents USING btree (external_id);


--
-- Name: payment_intents_order_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_intents_order_id_index ON public.payment_intents USING btree (order_id);


--
-- Name: payment_intents_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_intents_status_index ON public.payment_intents USING btree (status);


--
-- Name: payment_refunds_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_refunds_status_index ON public.payment_refunds USING btree (status);


--
-- Name: payment_refunds_transaction_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_refunds_transaction_id_index ON public.payment_refunds USING btree (transaction_id);


--
-- Name: payment_retries_payment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_retries_payment_id_index ON public.payment_retries USING btree (payment_id);


--
-- Name: payment_state_transitions_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_state_transitions_created_at_index ON public.payment_state_transitions USING btree (created_at);


--
-- Name: payment_state_transitions_order_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_state_transitions_order_id_index ON public.payment_state_transitions USING btree (order_id);


--
-- Name: payment_state_transitions_payment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_state_transitions_payment_id_index ON public.payment_state_transitions USING btree (payment_id);


--
-- Name: payment_transactions_device_fingerprint_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_transactions_device_fingerprint_index ON public.payment_transactions USING btree (device_fingerprint);


--
-- Name: payment_transactions_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_transactions_event_id_index ON public.payment_transactions USING btree (event_id);


--
-- Name: payment_transactions_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_transactions_status_index ON public.payment_transactions USING btree (status);


--
-- Name: payment_transactions_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_transactions_user_id_index ON public.payment_transactions USING btree (user_id);


--
-- Name: payment_transactions_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_transactions_venue_id_index ON public.payment_transactions USING btree (venue_id);


--
-- Name: payout_methods_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payout_methods_venue_id_index ON public.payout_methods USING btree (venue_id);


--
-- Name: pending_price_changes_approved_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pending_price_changes_approved_at_index ON public.pending_price_changes USING btree (approved_at);


--
-- Name: pending_price_changes_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pending_price_changes_event_id_index ON public.pending_price_changes USING btree (event_id);


--
-- Name: price_history_event_id_changed_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX price_history_event_id_changed_at_index ON public.price_history USING btree (event_id, changed_at);


--
-- Name: queues_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX queues_active_index ON public.queues USING btree (active);


--
-- Name: queues_name_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX queues_name_index ON public.queues USING btree (name);


--
-- Name: queues_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX queues_type_index ON public.queues USING btree (type);


--
-- Name: rate_limits_key_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rate_limits_key_index ON public.rate_limits USING btree (key);


--
-- Name: rate_limits_reset_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rate_limits_reset_at_index ON public.rate_limits USING btree (reset_at);


--
-- Name: reconciliation_reports_report_date_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reconciliation_reports_report_date_index ON public.reconciliation_reports USING btree (report_date);


--
-- Name: risk_assessments_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX risk_assessments_venue_id_index ON public.risk_assessments USING btree (venue_id);


--
-- Name: risk_flags_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX risk_flags_venue_id_index ON public.risk_flags USING btree (venue_id);


--
-- Name: royalty_discrepancies_reconciliation_run_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_discrepancies_reconciliation_run_id_index ON public.royalty_discrepancies USING btree (reconciliation_run_id);


--
-- Name: royalty_discrepancies_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_discrepancies_status_index ON public.royalty_discrepancies USING btree (status);


--
-- Name: royalty_discrepancies_transaction_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_discrepancies_transaction_id_index ON public.royalty_discrepancies USING btree (transaction_id);


--
-- Name: royalty_distributions_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_distributions_event_id_index ON public.royalty_distributions USING btree (event_id);


--
-- Name: royalty_distributions_recipient_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_distributions_recipient_id_index ON public.royalty_distributions USING btree (recipient_id);


--
-- Name: royalty_distributions_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_distributions_status_index ON public.royalty_distributions USING btree (status);


--
-- Name: royalty_distributions_transaction_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_distributions_transaction_id_index ON public.royalty_distributions USING btree (transaction_id);


--
-- Name: royalty_payouts_recipient_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_payouts_recipient_id_index ON public.royalty_payouts USING btree (recipient_id);


--
-- Name: royalty_payouts_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_payouts_status_index ON public.royalty_payouts USING btree (status);


--
-- Name: royalty_reconciliation_runs_reconciliation_date_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_reconciliation_runs_reconciliation_date_index ON public.royalty_reconciliation_runs USING btree (reconciliation_date);


--
-- Name: royalty_reconciliation_runs_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX royalty_reconciliation_runs_status_index ON public.royalty_reconciliation_runs USING btree (status);


--
-- Name: scalper_reports_reporter_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scalper_reports_reporter_id_index ON public.scalper_reports USING btree (reporter_id);


--
-- Name: scalper_reports_suspected_scalper_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scalper_reports_suspected_scalper_id_index ON public.scalper_reports USING btree (suspected_scalper_id);


--
-- Name: scan_policies_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policies_event_id_index ON public.scan_policies USING btree (event_id);


--
-- Name: scan_policies_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policies_is_active_index ON public.scan_policies USING btree (is_active);


--
-- Name: scan_policies_policy_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policies_policy_type_index ON public.scan_policies USING btree (policy_type);


--
-- Name: scan_policies_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policies_venue_id_index ON public.scan_policies USING btree (venue_id);


--
-- Name: scan_policy_templates_is_default_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policy_templates_is_default_index ON public.scan_policy_templates USING btree (is_default);


--
-- Name: scan_policy_templates_name_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_policy_templates_name_index ON public.scan_policy_templates USING btree (name);


--
-- Name: scanner_devices_can_scan_offline_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanner_devices_can_scan_offline_index ON public.scanner_devices USING btree (can_scan_offline);


--
-- Name: scanner_devices_device_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanner_devices_device_id_index ON public.scanner_devices USING btree (device_id);


--
-- Name: scanner_devices_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanner_devices_is_active_index ON public.scanner_devices USING btree (is_active);


--
-- Name: scanner_devices_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanner_devices_venue_id_index ON public.scanner_devices USING btree (venue_id);


--
-- Name: scanner_devices_venue_id_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanner_devices_venue_id_is_active_index ON public.scanner_devices USING btree (venue_id, is_active);


--
-- Name: scans_device_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scans_device_id_index ON public.scans USING btree (device_id);


--
-- Name: scans_result_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scans_result_index ON public.scans USING btree (result);


--
-- Name: scans_scanned_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scans_scanned_at_index ON public.scans USING btree (scanned_at);


--
-- Name: scans_ticket_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scans_ticket_id_index ON public.scans USING btree (ticket_id);


--
-- Name: scans_ticket_id_result_scanned_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scans_ticket_id_result_scanned_at_index ON public.scans USING btree (ticket_id, result, scanned_at);


--
-- Name: schedules_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX schedules_active_index ON public.schedules USING btree (active);


--
-- Name: schedules_name_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX schedules_name_index ON public.schedules USING btree (name);


--
-- Name: schedules_next_run_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX schedules_next_run_index ON public.schedules USING btree (next_run);


--
-- Name: settlement_batches_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX settlement_batches_status_index ON public.settlement_batches USING btree (status);


--
-- Name: settlement_batches_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX settlement_batches_venue_id_index ON public.settlement_batches USING btree (venue_id);


--
-- Name: sync_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_logs_created_at_idx ON public.sync_logs USING btree (created_at);


--
-- Name: sync_logs_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_logs_integration_type_idx ON public.sync_logs USING btree (integration_type);


--
-- Name: sync_logs_started_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_logs_started_at_idx ON public.sync_logs USING btree (started_at);


--
-- Name: sync_logs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_logs_status_idx ON public.sync_logs USING btree (status);


--
-- Name: sync_logs_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_logs_venue_id_idx ON public.sync_logs USING btree (venue_id);


--
-- Name: sync_queue_composite_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_composite_idx ON public.sync_queue USING btree (status, priority, scheduled_for);


--
-- Name: sync_queue_integration_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_integration_type_idx ON public.sync_queue USING btree (integration_type);


--
-- Name: sync_queue_priority_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_priority_idx ON public.sync_queue USING btree (priority);


--
-- Name: sync_queue_scheduled_for_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_scheduled_for_idx ON public.sync_queue USING btree (scheduled_for);


--
-- Name: sync_queue_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_status_idx ON public.sync_queue USING btree (status);


--
-- Name: sync_queue_venue_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_queue_venue_id_idx ON public.sync_queue USING btree (venue_id);


--
-- Name: tax_records_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tax_records_venue_id_index ON public.tax_records USING btree (venue_id);


--
-- Name: tax_records_venue_id_year_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tax_records_venue_id_year_index ON public.tax_records USING btree (venue_id, year);


--
-- Name: tax_records_year_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tax_records_year_index ON public.tax_records USING btree (year);


--
-- Name: upload_sessions_expires_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_expires_at_index ON public.upload_sessions USING btree (expires_at);


--
-- Name: upload_sessions_session_token_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_session_token_index ON public.upload_sessions USING btree (session_token);


--
-- Name: upload_sessions_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_status_index ON public.upload_sessions USING btree (status);


--
-- Name: upload_sessions_uploaded_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_uploaded_by_index ON public.upload_sessions USING btree (uploaded_by);


--
-- Name: uq_payment_intents_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_payment_intents_idempotency ON public.payment_intents USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_payment_refunds_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_payment_refunds_idempotency ON public.payment_refunds USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_payment_transactions_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_payment_transactions_idempotency ON public.payment_transactions USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: venue_balances_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_balances_venue_id_index ON public.venue_balances USING btree (venue_id);


--
-- Name: venue_compliance_reports_venue_id_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_reports_venue_id_created_at_index ON public.venue_compliance_reports USING btree (venue_id, created_at);


--
-- Name: venue_compliance_reviews_reviewer_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_reviews_reviewer_id_index ON public.venue_compliance_reviews USING btree (reviewer_id);


--
-- Name: venue_compliance_reviews_status_scheduled_date_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_reviews_status_scheduled_date_index ON public.venue_compliance_reviews USING btree (status, scheduled_date);


--
-- Name: venue_compliance_reviews_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_reviews_venue_id_index ON public.venue_compliance_reviews USING btree (venue_id);


--
-- Name: venue_compliance_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_venue_id_index ON public.venue_compliance USING btree (venue_id);


--
-- Name: venue_royalty_settings_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_royalty_settings_venue_id_index ON public.venue_royalty_settings USING btree (venue_id);


--
-- Name: venue_verifications_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_verifications_status_index ON public.venue_verifications USING btree (status);


--
-- Name: venue_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_verifications_venue_id_index ON public.venue_verifications USING btree (venue_id);


--
-- Name: webhook_events_event_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_events_event_type_index ON public.webhook_events USING btree (event_type);


--
-- Name: webhook_events_processor_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_events_processor_index ON public.webhook_events USING btree (processor);


--
-- Name: webhook_inbox_received_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_inbox_received_at_index ON public.webhook_inbox USING btree (received_at);


--
-- Name: webhook_inbox_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_inbox_status_index ON public.webhook_inbox USING btree (status);


--
-- Name: webhook_inbox_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_inbox_tenant_id_index ON public.webhook_inbox USING btree (tenant_id);


--
-- Name: webhook_logs_source_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_logs_source_index ON public.webhook_logs USING btree (source);


--
-- Name: webhooks_connection_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhooks_connection_id_index ON public.webhooks USING btree (connection_id);


--
-- Name: webhooks_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhooks_created_at_index ON public.webhooks USING btree (created_at);


--
-- Name: webhooks_event_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhooks_event_type_index ON public.webhooks USING btree (event_type);


--
-- Name: webhooks_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhooks_status_index ON public.webhooks USING btree (status);


--
-- Name: tickets audit_tickets_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_tickets_trigger AFTER INSERT OR DELETE OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();


--
-- Name: users audit_users_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_users_trigger AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();


--
-- Name: venues audit_venues_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_venues_trigger AFTER INSERT OR DELETE OR UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();


--
-- Name: users trigger_generate_referral_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.generate_user_referral_code();


--
-- Name: users trigger_increment_referral_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_increment_referral_count AFTER UPDATE OF email_verified ON public.users FOR EACH ROW WHEN (((new.email_verified = true) AND (old.email_verified = false))) EXECUTE FUNCTION public.increment_referral_count();


--
-- Name: custom_domains trigger_update_custom_domains_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_custom_domains_timestamp BEFORE UPDATE ON public.custom_domains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: discounts trigger_update_discounts_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_discounts_timestamp BEFORE UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_capacity trigger_update_event_capacity_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_event_capacity_timestamp BEFORE UPDATE ON public.event_capacity FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_categories trigger_update_event_categories_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_event_categories_timestamp BEFORE UPDATE ON public.event_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_metadata trigger_update_event_metadata_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_event_metadata_timestamp BEFORE UPDATE ON public.event_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_pricing trigger_update_event_pricing_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_event_pricing_timestamp BEFORE UPDATE ON public.event_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_schedules trigger_update_event_schedules_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_event_schedules_timestamp BEFORE UPDATE ON public.event_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events trigger_update_events_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_events_timestamp BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders trigger_update_orders_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_orders_timestamp BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reservations trigger_update_reservations_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_reservations_timestamp BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ticket_types trigger_update_ticket_types_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_types_timestamp BEFORE UPDATE ON public.ticket_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets trigger_update_tickets_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_tickets_timestamp BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users trigger_update_users_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_branding trigger_update_venue_branding_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_branding_timestamp BEFORE UPDATE ON public.venue_branding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_integrations trigger_update_venue_integrations_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_integrations_timestamp BEFORE UPDATE ON public.venue_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_layouts trigger_update_venue_layouts_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_layouts_timestamp BEFORE UPDATE ON public.venue_layouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_settings trigger_update_venue_settings_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_settings_timestamp BEFORE UPDATE ON public.venue_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_staff trigger_update_venue_staff_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_staff_timestamp BEFORE UPDATE ON public.venue_staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venues trigger_update_venues_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venues_timestamp BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: white_label_pricing trigger_update_white_label_pricing_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_white_label_pricing_timestamp BEFORE UPDATE ON public.white_label_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ab_tests update_ab_tests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON public.ab_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: alert_rules update_alert_rules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: alerts update_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audience_segments update_audience_segments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_audience_segments_updated_at BEFORE UPDATE ON public.audience_segments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: card_fingerprints update_card_fingerprints_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_card_fingerprints_updated_at BEFORE UPDATE ON public.card_fingerprints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: consent_records update_consent_records_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON public.consent_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dashboards update_dashboards_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON public.dashboards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_automation_triggers update_email_automation_triggers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_email_automation_triggers_updated_at BEFORE UPDATE ON public.email_automation_triggers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_purchase_limits update_event_purchase_limits_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_event_purchase_limits_updated_at BEFORE UPDATE ON public.event_purchase_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_royalty_settings update_event_royalty_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_event_royalty_settings_updated_at BEFORE UPDATE ON public.event_royalty_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fraud_review_queue update_fraud_review_queue_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_fraud_review_queue_updated_at BEFORE UPDATE ON public.fraud_review_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fraud_rules update_fraud_rules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_fraud_rules_updated_at BEFORE UPDATE ON public.fraud_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_payment_members update_group_payment_members_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_group_payment_members_updated_at BEFORE UPDATE ON public.group_payment_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_payments update_group_payments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_group_payments_updated_at BEFORE UPDATE ON public.group_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ip_reputation update_ip_reputation_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_ip_reputation_updated_at BEFORE UPDATE ON public.ip_reputation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ml_fraud_models update_ml_fraud_models_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_ml_fraud_models_updated_at BEFORE UPDATE ON public.ml_fraud_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: nft_mint_queue update_nft_mint_queue_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_nft_mint_queue_updated_at BEFORE UPDATE ON public.nft_mint_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: nft_mints update_nft_mints_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_nft_mints_updated_at BEFORE UPDATE ON public.nft_mints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_campaigns update_notification_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_notification_campaigns_updated_at BEFORE UPDATE ON public.notification_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_history update_notification_history_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_notification_history_updated_at BEFORE UPDATE ON public.notification_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_preferences update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_templates update_notification_templates_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_escrows update_payment_escrows_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_payment_escrows_updated_at BEFORE UPDATE ON public.payment_escrows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_intents update_payment_intents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON public.payment_intents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_refunds update_payment_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON public.payment_refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_transactions update_payment_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: royalty_distributions update_royalty_distributions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_royalty_distributions_updated_at BEFORE UPDATE ON public.royalty_distributions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: royalty_payouts update_royalty_payouts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_royalty_payouts_updated_at BEFORE UPDATE ON public.royalty_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: velocity_limits update_velocity_limits_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_velocity_limits_updated_at BEFORE UPDATE ON public.velocity_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_balances update_venue_balances_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_venue_balances_updated_at BEFORE UPDATE ON public.venue_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_notification_settings update_venue_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_venue_notification_settings_updated_at BEFORE UPDATE ON public.venue_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_royalty_settings update_venue_royalty_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_venue_royalty_settings_updated_at BEFORE UPDATE ON public.venue_royalty_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venues validate_tax_id_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER validate_tax_id_trigger BEFORE INSERT OR UPDATE OF tax_id ON public.venues FOR EACH ROW EXECUTE FUNCTION public.validate_tax_id();


--
-- Name: webhook_inbox webhook_inbox_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER webhook_inbox_updated_at BEFORE UPDATE ON public.webhook_inbox FOR EACH ROW EXECUTE FUNCTION public.update_webhook_inbox_updated_at();


--
-- Name: ab_test_variants ab_test_variants_ab_test_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ab_test_variants
    ADD CONSTRAINT ab_test_variants_ab_test_id_foreign FOREIGN KEY (ab_test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;


--
-- Name: analytics_widgets analytics_widgets_dashboard_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_widgets
    ADD CONSTRAINT analytics_widgets_dashboard_id_foreign FOREIGN KEY (dashboard_id) REFERENCES public.analytics_dashboards(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: biometric_credentials biometric_credentials_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: connections connections_integration_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_integration_id_foreign FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: custom_domains custom_domains_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: email_automation_triggers email_automation_triggers_template_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_automation_triggers
    ADD CONSTRAINT email_automation_triggers_template_id_foreign FOREIGN KEY (template_id) REFERENCES public.notification_templates(id) ON DELETE CASCADE;


--
-- Name: event_capacity event_capacity_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_capacity event_capacity_schedule_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_schedule_id_foreign FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE SET NULL;


--
-- Name: event_categories event_categories_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;


--
-- Name: event_metadata event_metadata_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT event_metadata_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_capacity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_capacity_id_foreign FOREIGN KEY (capacity_id) REFERENCES public.event_capacity(id) ON DELETE SET NULL;


--
-- Name: event_pricing event_pricing_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_schedule_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_schedule_id_foreign FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE SET NULL;


--
-- Name: event_schedules event_schedules_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_schedules
    ADD CONSTRAINT event_schedules_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_primary_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_primary_category_id_foreign FOREIGN KEY (primary_category_id) REFERENCES public.event_categories(id);


--
-- Name: external_verifications external_verifications_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_verifications
    ADD CONSTRAINT external_verifications_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: field_mappings field_mappings_connection_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_mappings
    ADD CONSTRAINT field_mappings_connection_id_foreign FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;


--
-- Name: file_access_logs file_access_logs_file_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_file_id_foreign FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: file_versions file_versions_file_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_foreign FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: fraud_review_queue fraud_review_queue_fraud_check_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_review_queue
    ADD CONSTRAINT fraud_review_queue_fraud_check_id_foreign FOREIGN KEY (fraud_check_id) REFERENCES public.fraud_checks(id);


--
-- Name: group_payment_members group_payment_members_group_payment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_payment_members
    ADD CONSTRAINT group_payment_members_group_payment_id_foreign FOREIGN KEY (group_payment_id) REFERENCES public.group_payments(id);


--
-- Name: invalidated_tokens invalidated_tokens_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: manual_review_queue manual_review_queue_assigned_to_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_assigned_to_foreign FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: manual_review_queue manual_review_queue_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: manual_review_queue manual_review_queue_verification_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_verification_id_foreign FOREIGN KEY (verification_id) REFERENCES public.external_verifications(id) ON DELETE SET NULL;


--
-- Name: ml_fraud_predictions ml_fraud_predictions_model_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_fraud_predictions
    ADD CONSTRAINT ml_fraud_predictions_model_id_foreign FOREIGN KEY (model_id) REFERENCES public.ml_fraud_models(id);


--
-- Name: nft_mint_queue nft_mint_queue_payment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nft_mint_queue
    ADD CONSTRAINT nft_mint_queue_payment_id_foreign FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(id);


--
-- Name: notification_campaigns notification_campaigns_template_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_campaigns
    ADD CONSTRAINT notification_campaigns_template_id_foreign FOREIGN KEY (template_id) REFERENCES public.notification_templates(id) ON DELETE SET NULL;


--
-- Name: notification_costs notification_costs_notification_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_costs
    ADD CONSTRAINT notification_costs_notification_id_foreign FOREIGN KEY (notification_id) REFERENCES public.notification_history(id) ON DELETE CASCADE;


--
-- Name: notification_preference_history notification_preference_history_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preference_history
    ADD CONSTRAINT notification_preference_history_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.notification_preferences(user_id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_refunds payment_refunds_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id);


--
-- Name: payment_state_transitions payment_state_transitions_payment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_payment_id_foreign FOREIGN KEY (payment_id) REFERENCES public.payment_intents(id);


--
-- Name: royalty_discrepancies royalty_discrepancies_distribution_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_discrepancies
    ADD CONSTRAINT royalty_discrepancies_distribution_id_foreign FOREIGN KEY (distribution_id) REFERENCES public.royalty_distributions(id);


--
-- Name: royalty_discrepancies royalty_discrepancies_reconciliation_run_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalty_discrepancies
    ADD CONSTRAINT royalty_discrepancies_reconciliation_run_id_foreign FOREIGN KEY (reconciliation_run_id) REFERENCES public.royalty_reconciliation_runs(id);


--
-- Name: tax_collections tax_collections_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_collections
    ADD CONSTRAINT tax_collections_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id);


--
-- Name: trusted_devices trusted_devices_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_granted_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_granted_by_foreign FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_revoked_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_revoked_by_foreign FOREIGN KEY (revoked_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_referred_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_foreign FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: venue_branding venue_branding_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_branding
    ADD CONSTRAINT venue_branding_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance_reports venue_compliance_reports_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reports
    ADD CONSTRAINT venue_compliance_reports_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance_reviews venue_compliance_reviews_reviewer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_reviewer_id_foreign FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: venue_compliance_reviews venue_compliance_reviews_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance venue_compliance_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_integrations venue_integrations_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_layouts venue_layouts_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_settings venue_settings_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_staff venue_staff_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_tier_history venue_tier_history_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_tier_history
    ADD CONSTRAINT venue_tier_history_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: wallet_connections wallet_connections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_connection_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_connection_id_foreign FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;


--
-- Name: analytics_aggregations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_aggregations ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_dashboards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_dashboards ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_exports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_exports ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_widgets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_lifetime_value; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_lifetime_value ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_rfm_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_rfm_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_segments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_aggregations tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_aggregations USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: analytics_alerts tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_alerts USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: analytics_dashboards tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_dashboards USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: analytics_exports tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_exports USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: analytics_metrics tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_metrics USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: analytics_widgets tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.analytics_widgets USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: customer_lifetime_value tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.customer_lifetime_value USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: customer_rfm_scores tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.customer_rfm_scores USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: customer_segments tenant_isolation_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation_policy ON public.customer_segments USING ((tenant_id = (current_setting('app.current_tenant'::text))::uuid));


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tickets_admin_all ON public.tickets USING (((current_setting('app.current_user_role'::text, true) = 'admin'::text) OR (current_setting('app.current_user_role'::text, true) = 'superadmin'::text)));


--
-- Name: tickets tickets_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tickets_update_own ON public.tickets FOR UPDATE USING ((user_id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_admin_all ON public.users USING (((current_setting('app.current_user_role'::text, true) = 'admin'::text) OR (current_setting('app.current_user_role'::text, true) = 'superadmin'::text)));


--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_update_own ON public.users FOR UPDATE USING ((id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: users users_view_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_view_own ON public.users FOR SELECT USING ((id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: venues venues_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY venues_admin_all ON public.venues USING (((current_setting('app.current_user_role'::text, true) = 'admin'::text) OR (current_setting('app.current_user_role'::text, true) = 'superadmin'::text)));


--
-- Name: venues venues_public_view; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY venues_public_view ON public.venues FOR SELECT USING (((status)::text = 'active'::text));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TABLE ab_test_variants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ab_test_variants TO service_role;


--
-- Name: TABLE ab_tests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ab_tests TO service_role;


--
-- Name: TABLE abandoned_carts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.abandoned_carts TO service_role;


--
-- Name: TABLE account_takeover_signals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.account_takeover_signals TO service_role;


--
-- Name: TABLE alert_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.alert_rules TO service_role;


--
-- Name: TABLE alerts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.alerts TO service_role;


--
-- Name: TABLE analytics_aggregations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_aggregations TO service_role;


--
-- Name: TABLE analytics_alerts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_alerts TO service_role;


--
-- Name: TABLE analytics_dashboards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_dashboards TO service_role;


--
-- Name: TABLE analytics_exports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_exports TO service_role;


--
-- Name: TABLE analytics_metrics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_metrics TO service_role;


--
-- Name: TABLE analytics_widgets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_widgets TO service_role;


--
-- Name: TABLE anti_bot_activities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.anti_bot_activities TO service_role;


--
-- Name: TABLE anti_bot_violations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.anti_bot_violations TO service_role;


--
-- Name: TABLE audience_segments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.audience_segments TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE bank_verifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.bank_verifications TO service_role;


--
-- Name: TABLE behavioral_analytics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.behavioral_analytics TO service_role;


--
-- Name: TABLE biometric_credentials; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.biometric_credentials TO service_role;


--
-- Name: TABLE bot_detections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.bot_detections TO service_role;


--
-- Name: TABLE card_fingerprints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.card_fingerprints TO service_role;


--
-- Name: TABLE compliance_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.compliance_audit_log TO service_role;


--
-- Name: TABLE compliance_batch_jobs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.compliance_batch_jobs TO service_role;


--
-- Name: TABLE compliance_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.compliance_documents TO service_role;


--
-- Name: TABLE compliance_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.compliance_settings TO service_role;


--
-- Name: TABLE connections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.connections TO service_role;


--
-- Name: TABLE consent_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.consent_records TO service_role;


--
-- Name: TABLE custom_domains; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.custom_domains TO service_role;


--
-- Name: TABLE customer_lifetime_value; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customer_lifetime_value TO service_role;


--
-- Name: TABLE customer_rfm_scores; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customer_rfm_scores TO service_role;


--
-- Name: TABLE customer_segments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customer_segments TO service_role;


--
-- Name: TABLE dashboards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dashboards TO service_role;


--
-- Name: TABLE device_activity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.device_activity TO service_role;


--
-- Name: TABLE devices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.devices TO service_role;


--
-- Name: TABLE discounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.discounts TO service_role;


--
-- Name: TABLE email_automation_triggers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_automation_triggers TO service_role;


--
-- Name: TABLE email_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_queue TO service_role;


--
-- Name: TABLE event_capacity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_capacity TO service_role;


--
-- Name: TABLE event_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_categories TO service_role;


--
-- Name: TABLE event_metadata; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_metadata TO service_role;


--
-- Name: TABLE event_pricing; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_pricing TO service_role;


--
-- Name: TABLE event_purchase_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_purchase_limits TO service_role;


--
-- Name: TABLE event_royalty_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_royalty_settings TO service_role;


--
-- Name: TABLE event_schedules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_schedules TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE external_verifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_verifications TO service_role;


--
-- Name: TABLE field_mappings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.field_mappings TO service_role;


--
-- Name: TABLE file_access_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.file_access_logs TO service_role;


--
-- Name: TABLE file_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.file_versions TO service_role;


--
-- Name: TABLE files; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.files TO service_role;


--
-- Name: TABLE form_1099_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.form_1099_records TO service_role;


--
-- Name: TABLE fraud_checks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fraud_checks TO service_role;


--
-- Name: TABLE fraud_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fraud_events TO service_role;


--
-- Name: TABLE fraud_review_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fraud_review_queue TO service_role;


--
-- Name: TABLE fraud_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fraud_rules TO service_role;


--
-- Name: TABLE group_payment_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_payment_members TO service_role;


--
-- Name: TABLE group_payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_payments TO service_role;


--
-- Name: TABLE idempotency_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.idempotency_keys TO service_role;


--
-- Name: TABLE index_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.index_queue TO service_role;


--
-- Name: TABLE index_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.index_versions TO service_role;


--
-- Name: TABLE integration_configs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_configs TO service_role;


--
-- Name: TABLE integration_costs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_costs TO service_role;


--
-- Name: TABLE integration_health; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_health TO service_role;


--
-- Name: TABLE integration_webhooks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_webhooks TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integrations TO service_role;


--
-- Name: TABLE invalidated_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invalidated_tokens TO service_role;


--
-- Name: TABLE ip_reputation; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ip_reputation TO service_role;


--
-- Name: TABLE jobs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.jobs TO service_role;


--
-- Name: TABLE knex_migrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations TO service_role;


--
-- Name: TABLE knex_migrations_analytics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_analytics TO service_role;


--
-- Name: TABLE knex_migrations_analytics_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_analytics_lock TO service_role;


--
-- Name: TABLE knex_migrations_auth; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_auth TO service_role;


--
-- Name: TABLE knex_migrations_auth_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_auth_lock TO service_role;


--
-- Name: TABLE knex_migrations_compliance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_compliance TO service_role;


--
-- Name: TABLE knex_migrations_compliance_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_compliance_lock TO service_role;


--
-- Name: TABLE knex_migrations_event; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_event TO service_role;


--
-- Name: TABLE knex_migrations_event_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_event_lock TO service_role;


--
-- Name: TABLE knex_migrations_files; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_files TO service_role;


--
-- Name: TABLE knex_migrations_files_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_files_lock TO service_role;


--
-- Name: TABLE knex_migrations_integration; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_integration TO service_role;


--
-- Name: TABLE knex_migrations_integration_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_integration_lock TO service_role;


--
-- Name: TABLE knex_migrations_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_lock TO service_role;


--
-- Name: TABLE knex_migrations_marketplace; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_marketplace TO service_role;


--
-- Name: TABLE knex_migrations_marketplace_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_marketplace_lock TO service_role;


--
-- Name: TABLE knex_migrations_monitoring; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_monitoring TO service_role;


--
-- Name: TABLE knex_migrations_monitoring_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_monitoring_lock TO service_role;


--
-- Name: TABLE knex_migrations_notification; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_notification TO service_role;


--
-- Name: TABLE knex_migrations_notification_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_notification_lock TO service_role;


--
-- Name: TABLE knex_migrations_payment; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_payment TO service_role;


--
-- Name: TABLE knex_migrations_payment_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_payment_lock TO service_role;


--
-- Name: TABLE knex_migrations_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_queue TO service_role;


--
-- Name: TABLE knex_migrations_queue_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_queue_lock TO service_role;


--
-- Name: TABLE knex_migrations_scanning; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_scanning TO service_role;


--
-- Name: TABLE knex_migrations_scanning_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_scanning_lock TO service_role;


--
-- Name: TABLE knex_migrations_search; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_search TO service_role;


--
-- Name: TABLE knex_migrations_search_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_search_lock TO service_role;


--
-- Name: TABLE knex_migrations_ticket; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_ticket TO service_role;


--
-- Name: TABLE knex_migrations_ticket_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_ticket_lock TO service_role;


--
-- Name: TABLE knex_migrations_venue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_venue TO service_role;


--
-- Name: TABLE knex_migrations_venue_lock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knex_migrations_venue_lock TO service_role;


--
-- Name: TABLE known_scalpers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.known_scalpers TO service_role;


--
-- Name: TABLE manual_review_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.manual_review_queue TO service_role;


--
-- Name: TABLE marketplace_blacklist; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.marketplace_blacklist TO service_role;


--
-- Name: TABLE marketplace_disputes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.marketplace_disputes TO service_role;


--
-- Name: TABLE marketplace_listings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.marketplace_listings TO service_role;


--
-- Name: TABLE marketplace_price_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.marketplace_price_history TO service_role;


--
-- Name: TABLE marketplace_transfers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.marketplace_transfers TO service_role;


--
-- Name: TABLE metrics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.metrics TO service_role;


--
-- Name: TABLE ml_fraud_models; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ml_fraud_models TO service_role;


--
-- Name: TABLE ml_fraud_predictions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ml_fraud_predictions TO service_role;


--
-- Name: TABLE nft_mint_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.nft_mint_queue TO service_role;


--
-- Name: TABLE nft_mints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.nft_mints TO service_role;


--
-- Name: TABLE nft_transfers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.nft_transfers TO service_role;


--
-- Name: TABLE notification_analytics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_analytics TO service_role;


--
-- Name: TABLE notification_campaigns; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_campaigns TO service_role;


--
-- Name: TABLE notification_clicks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_clicks TO service_role;


--
-- Name: TABLE notification_costs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_costs TO service_role;


--
-- Name: TABLE notification_delivery_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_delivery_stats TO service_role;


--
-- Name: TABLE notification_engagement; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_engagement TO service_role;


--
-- Name: TABLE notification_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_history TO service_role;


--
-- Name: TABLE notification_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_log TO service_role;


--
-- Name: TABLE notification_preference_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_preference_history TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notification_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_templates TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE oauth_connections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.oauth_connections TO service_role;


--
-- Name: TABLE ofac_checks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ofac_checks TO service_role;


--
-- Name: TABLE ofac_sdn_list; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ofac_sdn_list TO service_role;


--
-- Name: TABLE offline_validation_cache; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.offline_validation_cache TO service_role;


--
-- Name: TABLE order_discounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_discounts TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE outbox; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.outbox TO service_role;


--
-- Name: TABLE outbox_dlq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.outbox_dlq TO service_role;


--
-- Name: TABLE payment_escrows; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_escrows TO service_role;


--
-- Name: TABLE payment_event_sequence; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_event_sequence TO service_role;


--
-- Name: TABLE payment_idempotency; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_idempotency TO service_role;


--
-- Name: TABLE payment_intents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_intents TO service_role;


--
-- Name: TABLE payment_refunds; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_refunds TO service_role;


--
-- Name: TABLE payment_retries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_retries TO service_role;


--
-- Name: TABLE payment_state_machine; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_state_machine TO service_role;


--
-- Name: TABLE payment_state_transitions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_state_transitions TO service_role;


--
-- Name: TABLE payment_transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_transactions TO service_role;


--
-- Name: TABLE payout_methods; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payout_methods TO service_role;


--
-- Name: TABLE pending_price_changes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pending_price_changes TO service_role;


--
-- Name: TABLE platform_fees; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.platform_fees TO service_role;


--
-- Name: TABLE price_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.price_history TO service_role;


--
-- Name: TABLE qr_codes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.qr_codes TO service_role;


--
-- Name: TABLE queues; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.queues TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE read_consistency_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.read_consistency_tokens TO service_role;


--
-- Name: TABLE reconciliation_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reconciliation_reports TO service_role;


--
-- Name: TABLE reservation_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reservation_history TO service_role;


--
-- Name: TABLE reservations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reservations TO service_role;


--
-- Name: TABLE risk_assessments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.risk_assessments TO service_role;


--
-- Name: TABLE risk_flags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.risk_flags TO service_role;


--
-- Name: TABLE royalty_discrepancies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.royalty_discrepancies TO service_role;


--
-- Name: TABLE royalty_distributions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.royalty_distributions TO service_role;


--
-- Name: TABLE royalty_payouts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.royalty_payouts TO service_role;


--
-- Name: TABLE royalty_reconciliation_runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.royalty_reconciliation_runs TO service_role;


--
-- Name: TABLE scalper_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scalper_reports TO service_role;


--
-- Name: TABLE scan_policies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scan_policies TO service_role;


--
-- Name: TABLE scan_policy_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scan_policy_templates TO service_role;


--
-- Name: TABLE scanner_devices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scanner_devices TO service_role;


--
-- Name: TABLE scans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scans TO service_role;


--
-- Name: TABLE schedules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.schedules TO service_role;


--
-- Name: TABLE settlement_batches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.settlement_batches TO service_role;


--
-- Name: TABLE suppression_list; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.suppression_list TO service_role;


--
-- Name: TABLE sync_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sync_logs TO service_role;


--
-- Name: TABLE sync_queue; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sync_queue TO service_role;


--
-- Name: TABLE tax_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tax_collections TO service_role;


--
-- Name: TABLE tax_forms_1099da; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tax_forms_1099da TO service_role;


--
-- Name: TABLE tax_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tax_records TO service_role;


--
-- Name: TABLE tax_transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tax_transactions TO service_role;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tenants TO service_role;


--
-- Name: TABLE ticket_transfers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ticket_transfers TO service_role;


--
-- Name: TABLE ticket_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ticket_types TO service_role;


--
-- Name: TABLE ticket_validations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ticket_validations TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: TABLE trusted_devices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.trusted_devices TO service_role;


--
-- Name: TABLE upload_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.upload_sessions TO service_role;


--
-- Name: TABLE user_blacklists; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_blacklists TO service_role;


--
-- Name: TABLE user_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_sessions TO service_role;


--
-- Name: TABLE user_venue_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_venue_roles TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE velocity_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.velocity_limits TO service_role;


--
-- Name: TABLE venue_balances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_balances TO service_role;


--
-- Name: TABLE venue_branding; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_branding TO service_role;


--
-- Name: TABLE venue_compliance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_compliance TO service_role;


--
-- Name: TABLE venue_compliance_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_compliance_reports TO service_role;


--
-- Name: TABLE venue_compliance_reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_compliance_reviews TO service_role;


--
-- Name: TABLE venue_integrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_integrations TO service_role;


--
-- Name: TABLE venue_layouts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_layouts TO service_role;


--
-- Name: TABLE venue_marketplace_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_marketplace_settings TO service_role;


--
-- Name: TABLE venue_notification_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_notification_settings TO service_role;


--
-- Name: TABLE venue_royalty_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_royalty_settings TO service_role;


--
-- Name: TABLE venue_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_settings TO service_role;


--
-- Name: TABLE venue_staff; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_staff TO service_role;


--
-- Name: TABLE venue_tier_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_tier_history TO service_role;


--
-- Name: TABLE venue_verifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_verifications TO service_role;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venues TO service_role;


--
-- Name: TABLE waiting_room_activity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.waiting_room_activity TO service_role;


--
-- Name: TABLE wallet_connections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wallet_connections TO service_role;


--
-- Name: TABLE webhook_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhook_events TO service_role;


--
-- Name: TABLE webhook_inbox; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhook_inbox TO service_role;


--
-- Name: TABLE webhook_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhook_logs TO service_role;


--
-- Name: TABLE webhook_nonces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhook_nonces TO service_role;


--
-- Name: TABLE webhooks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhooks TO service_role;


--
-- Name: TABLE white_label_pricing; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.white_label_pricing TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict JSfyEJzjZXhvmA5ERz4UesMCKEZb9T2gq95m2OPX2DgncRH8VnSHngCwbqvdgng

