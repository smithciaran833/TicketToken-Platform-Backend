--
-- PostgreSQL database dump
--

\restrict PLxv5U5jQYiC5lfHciB6RkNbtenR842NXVbDFAS3czdpFOeQXincrQPSGLKLgQE

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
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
-- Name: analytics; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA analytics;


ALTER SCHEMA analytics OWNER TO postgres;

--
-- Name: SCHEMA analytics; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA analytics IS 'Materialized views and analytics data';


--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA audit;


ALTER SCHEMA audit OWNER TO postgres;

--
-- Name: SCHEMA audit; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA audit IS 'Audit logs and data change history';


--
-- Name: blockchain; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA blockchain;


ALTER SCHEMA blockchain OWNER TO postgres;

--
-- Name: SCHEMA blockchain; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA blockchain IS 'Blockchain transactions, NFTs, and smart contract data';


--
-- Name: cache; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA cache;


ALTER SCHEMA cache OWNER TO postgres;

--
-- Name: SCHEMA cache; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA cache IS 'Temporary tables and cached data';


--
-- Name: compliance; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA compliance;


ALTER SCHEMA compliance OWNER TO postgres;

--
-- Name: SCHEMA compliance; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA compliance IS 'KYC, AML, and regulatory compliance data';


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'Core application tables and data';


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION btree_gist IS 'GiST index support for common data types';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'Case-insensitive text type';


--
-- Name: hstore; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS hstore WITH SCHEMA public;


--
-- Name: EXTENSION hstore; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION hstore IS 'Key-value store for flexible data';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'Text similarity search using trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'Cryptographic functions for hashing and encryption';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'Functions for generating UUIDs';


--
-- Name: email; Type: DOMAIN; Schema: public; Owner: postgres
--

CREATE DOMAIN public.email AS character varying(255)
	CONSTRAINT email_check CHECK (((VALUE)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text));


ALTER DOMAIN public.email OWNER TO postgres;

--
-- Name: DOMAIN email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON DOMAIN public.email IS 'Email address with format validation';


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.event_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ON_SALE',
    'SOLD_OUT',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public.event_status OWNER TO postgres;

--
-- Name: TYPE event_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.event_status IS 'Event lifecycle status';


--
-- Name: kyc_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_status AS ENUM (
    'NOT_STARTED',
    'PENDING',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);


ALTER TYPE public.kyc_status OWNER TO postgres;

--
-- Name: TYPE kyc_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.kyc_status IS 'Know Your Customer verification status';


--
-- Name: positive_numeric; Type: DOMAIN; Schema: public; Owner: postgres
--

CREATE DOMAIN public.positive_numeric AS numeric
	CONSTRAINT positive_numeric_check CHECK ((VALUE > (0)::numeric));


ALTER DOMAIN public.positive_numeric OWNER TO postgres;

--
-- Name: DOMAIN positive_numeric; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON DOMAIN public.positive_numeric IS 'Positive numeric values only';


--
-- Name: priority_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.priority_level AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);


ALTER TYPE public.priority_level OWNER TO postgres;

--
-- Name: TYPE priority_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.priority_level IS 'Priority levels for various operations';


--
-- Name: text; Type: DOMAIN; Schema: public; Owner: postgres
--

CREATE DOMAIN public.text AS character varying(2048)
	CONSTRAINT text_check CHECK (((VALUE)::text ~ '^https?://'::text));


ALTER DOMAIN public.text OWNER TO postgres;

--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ticket_status AS ENUM (
    'DRAFT',
    'MINTING',
    'ACTIVE',
    'LISTED',
    'TRANSFERRED',
    'REDEEMED',
    'EXPIRED',
    'CANCELLED',
    'BURNED'
);


ALTER TYPE public.ticket_status OWNER TO postgres;

--
-- Name: TYPE ticket_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.ticket_status IS 'Ticket lifecycle status';


--
-- Name: transaction_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transaction_status AS ENUM (
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'EXPIRED',
    'CANCELLED'
);


ALTER TYPE public.transaction_status OWNER TO postgres;

--
-- Name: TYPE transaction_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.transaction_status IS 'Blockchain transaction status';


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'DELETED'
);


ALTER TYPE public.user_status OWNER TO postgres;

--
-- Name: TYPE user_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.user_status IS 'User account status';


--
-- Name: anonymize_email(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.anonymize_email(email_address text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
   parts TEXT[];
   username TEXT;
   domain TEXT;
BEGIN
   parts := string_to_array(email_address, '@');
   IF array_length(parts, 1) != 2 THEN
       RETURN 'invalid@example.com';
   END IF;
   
   username := parts[1];
   domain := parts[2];
   
   IF length(username) <= 2 THEN
       username := repeat('*', length(username));
   ELSE
       username := substr(username, 1, 1) || repeat('*', length(username) - 2) || substr(username, length(username), 1);
   END IF;
   
   RETURN username || '@' || domain;
END;
$$;


ALTER FUNCTION public.anonymize_email(email_address text) OWNER TO postgres;

--
-- Name: FUNCTION anonymize_email(email_address text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.anonymize_email(email_address text) IS 'Anonymize email address for privacy';


--
-- Name: calculate_age(date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_age(birth_date date) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
   RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, birth_date));
END;
$$;


ALTER FUNCTION public.calculate_age(birth_date date) OWNER TO postgres;

--
-- Name: FUNCTION calculate_age(birth_date date); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.calculate_age(birth_date date) IS 'Calculate age in years from birth date';


--
-- Name: calculate_dynamic_price(uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_dynamic_price(p_ticket_id uuid, p_base_price numeric) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_days_until_event INTEGER;
  v_demand_factor NUMERIC;
  v_similar_sales_avg NUMERIC;
  v_suggested_price NUMERIC;
BEGIN
  -- Calculate days until event
  SELECT EXTRACT(DAY FROM e.start_date - CURRENT_TIMESTAMP)
  INTO v_days_until_event
  FROM public.tickets t
  JOIN public.events e ON t.event_id = e.id
  WHERE t.id = p_ticket_id;

  -- Calculate demand factor based on recent sales
  SELECT AVG(sale_price / original_price)
  INTO v_demand_factor
  FROM public.marketplace_transactions mt
  JOIN public.tickets t ON mt.ticket_id = t.id
  WHERE t.event_id = (SELECT event_id FROM public.tickets WHERE id = p_ticket_id)
  AND mt.status = 'COMPLETED'
  AND mt.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days';

  -- Get average of similar recent sales
  SELECT AVG(sale_price)
  INTO v_similar_sales_avg
  FROM public.marketplace_transactions mt
  JOIN public.tickets t ON mt.ticket_id = t.id
  WHERE t.ticket_type_id = (SELECT ticket_type_id FROM public.tickets WHERE id = p_ticket_id)
  AND mt.status = 'COMPLETED'
  AND mt.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days';

  -- Calculate suggested price
  v_suggested_price := p_base_price;

  -- Adjust for time until event
  IF v_days_until_event <= 7 THEN
      v_suggested_price := v_suggested_price * 1.2;
  ELSIF v_days_until_event <= 30 THEN
      v_suggested_price := v_suggested_price * 1.1;
  END IF;

  -- Adjust for demand
  IF v_demand_factor IS NOT NULL THEN
      v_suggested_price := v_suggested_price * v_demand_factor;
  END IF;

  -- Consider recent sales
  IF v_similar_sales_avg IS NOT NULL THEN
      v_suggested_price := (v_suggested_price + v_similar_sales_avg) / 2;
  END IF;

  RETURN ROUND(v_suggested_price, 2);
END;
$$;


ALTER FUNCTION public.calculate_dynamic_price(p_ticket_id uuid, p_base_price numeric) OWNER TO postgres;

--
-- Name: calculate_royalties(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_royalties() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_venue_id UUID;
  v_royalty_percentage NUMERIC(5, 2);
  v_royalty_amount NUMERIC(10, 2);
BEGIN
  -- Only calculate for completed sales
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
      -- Get venue and royalty percentage
      SELECT v.id, COALESCE(v.resale_royalty_percentage, 2.5)
      INTO v_venue_id, v_royalty_percentage
      FROM public.tickets t
      JOIN public.events e ON t.event_id = e.id
      JOIN public.venues v ON e.venue_id = v.id
      WHERE t.id = NEW.ticket_id;

      -- Calculate royalty amount
      v_royalty_amount := ROUND(NEW.sale_price * (v_royalty_percentage / 100.0), 2);

      -- Create royalty record
      INSERT INTO public.royalties (
          marketplace_transaction_id, venue_id, recipient_id,
          royalty_percentage, sale_amount, royalty_amount
      )
      SELECT 
          NEW.id, v_venue_id, v.owner_id,
          v_royalty_percentage, NEW.sale_price, v_royalty_amount
      FROM public.venues v
      WHERE v.id = v_venue_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.calculate_royalties() OWNER TO postgres;

--
-- Name: calculate_ticket_price(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_ticket_price(pricing_id uuid) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
   pricing RECORD;
   total NUMERIC;
BEGIN
   SELECT * INTO pricing FROM public.event_pricing WHERE id = pricing_id;
   
   IF pricing.is_dynamic AND pricing.current_price IS NOT NULL THEN
       total := pricing.current_price;
   ELSE
       total := pricing.base_price;
   END IF;
   
   total := total + COALESCE(pricing.service_fee, 0) + COALESCE(pricing.facility_fee, 0);
   total := total * (1 + COALESCE(pricing.tax_rate, 0));
   
   RETURN ROUND(total, 2);
END;
$$;


ALTER FUNCTION public.calculate_ticket_price(pricing_id uuid) OWNER TO postgres;

--
-- Name: calculate_transaction_fees(bigint, character varying, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_transaction_fees(amount bigint, payment_type character varying, provider character varying) RETURNS TABLE(platform_fee bigint, processor_fee bigint, total_fee bigint)
    LANGUAGE plpgsql
    AS $$
DECLARE
   platform_rate NUMERIC;
   processor_rate NUMERIC;
BEGIN
   -- Platform fee rates
   platform_rate := CASE payment_type
       WHEN 'credit_card' THEN 0.015  -- 1.5%
       WHEN 'crypto' THEN 0.01        -- 1%
       ELSE 0.02                      -- 2%
   END;
   
   -- Processor fee rates
   processor_rate := CASE provider
       WHEN 'stripe' THEN 0.029       -- 2.9%
       WHEN 'coinbase' THEN 0.01      -- 1%
       ELSE 0.025                     -- 2.5%
   END;
   
   platform_fee := ROUND(amount * platform_rate);
   processor_fee := ROUND(amount * processor_rate);
   total_fee := platform_fee + processor_fee;
   
   RETURN QUERY SELECT platform_fee, processor_fee, total_fee;
END;
$$;


ALTER FUNCTION public.calculate_transaction_fees(amount bigint, payment_type character varying, provider character varying) OWNER TO postgres;

--
-- Name: check_event_availability(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_event_availability(p_event_id uuid, p_schedule_id uuid DEFAULT NULL::uuid, p_quantity integer DEFAULT 1) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
   available INTEGER;
BEGIN
   SELECT SUM(available_capacity) INTO available
   FROM public.event_capacity
   WHERE event_id = p_event_id
       AND (p_schedule_id IS NULL OR schedule_id = p_schedule_id)
       AND is_active = TRUE;
   
   RETURN COALESCE(available, 0) >= p_quantity;
END;
$$;


ALTER FUNCTION public.check_event_availability(p_event_id uuid, p_schedule_id uuid, p_quantity integer) OWNER TO postgres;

--
-- Name: check_fraud_rules(uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_fraud_rules(p_user_id uuid, p_listing_price numeric, p_ticket_id uuid) RETURNS TABLE(rule_violated boolean, rule_name character varying, severity character varying, action character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_rule RECORD;
  v_user_age INTEGER;
  v_listings_last_hour INTEGER;
BEGIN
  -- Get user metrics
  SELECT EXTRACT(DAY FROM CURRENT_TIMESTAMP - created_at)
  INTO v_user_age
  FROM public.users WHERE id = p_user_id;

  SELECT COUNT(*)
  INTO v_listings_last_hour
  FROM public.listings
  WHERE seller_id = p_user_id
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';

  -- Check each active rule
  FOR v_rule IN 
      SELECT * FROM public.fraud_prevention_rules
      WHERE is_active = TRUE
  LOOP
      -- Check velocity rules
      IF v_rule.rule_type = 'VELOCITY' AND 
         v_listings_last_hour > (v_rule.conditions->>'max_listings_per_hour')::INTEGER THEN
          RETURN QUERY SELECT TRUE, v_rule.rule_name, v_rule.severity, v_rule.action;
      END IF;

      -- Check user age rules
      IF v_rule.rule_type = 'USER_BEHAVIOR' AND
         v_user_age < (v_rule.conditions->>'min_user_age_days')::INTEGER THEN
          RETURN QUERY SELECT TRUE, v_rule.rule_name, v_rule.severity, v_rule.action;
      END IF;
  END LOOP;

  -- No rules violated
  IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
  END IF;
END;
$$;


ALTER FUNCTION public.check_fraud_rules(p_user_id uuid, p_listing_price numeric, p_ticket_id uuid) OWNER TO postgres;

--
-- Name: create_default_venue_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_default_venue_settings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.venue_settings (venue_id)
    VALUES (NEW.id)
    ON CONFLICT (venue_id) DO NOTHING;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_default_venue_settings() OWNER TO postgres;

--
-- Name: create_escrow_hold(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_escrow_hold() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Create escrow for new marketplace transactions
  INSERT INTO public.escrow (
      marketplace_transaction_id, buyer_id, seller_id,
      amount, currency, auto_release_at
  ) VALUES (
      NEW.id, NEW.buyer_id, NEW.seller_id,
      NEW.sale_price, NEW.currency,
      CURRENT_TIMESTAMP + INTERVAL '72 hours'
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_escrow_hold() OWNER TO postgres;

--
-- Name: create_event_metadata(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_event_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   INSERT INTO public.event_metadata (event_id)
   VALUES (NEW.id)
   ON CONFLICT (event_id) DO NOTHING;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_event_metadata() OWNER TO postgres;

--
-- Name: create_ticket_metadata(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_ticket_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   INSERT INTO public.ticket_metadata (ticket_id)
   VALUES (NEW.id)
   ON CONFLICT (ticket_id) DO NOTHING;


   RETURN NEW;


END;


$$;


ALTER FUNCTION public.create_ticket_metadata() OWNER TO postgres;

--
-- Name: decrypt_sensitive_data(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decrypt_sensitive_data(encrypted_data text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- In production, use proper decryption with pgcrypto
   -- This is a placeholder
   RETURN convert_from(decode(encrypted_data, 'base64'), 'UTF8');
END;
$$;


ALTER FUNCTION public.decrypt_sensitive_data(encrypted_data text) OWNER TO postgres;

--
-- Name: encrypt_sensitive_data(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.encrypt_sensitive_data(data text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- In production, use proper encryption with pgcrypto
   -- This is a placeholder
   RETURN encode(data::bytea, 'base64');
END;
$$;


ALTER FUNCTION public.encrypt_sensitive_data(data text) OWNER TO postgres;

--
-- Name: ensure_one_default_payment_method(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_one_default_payment_method() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF NEW.is_default = TRUE THEN
       UPDATE public.payment_methods
       SET is_default = FALSE
       WHERE user_id = NEW.user_id 
           AND id != NEW.id
           AND is_default = TRUE;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.ensure_one_default_payment_method() OWNER TO postgres;

--
-- Name: generate_event_slug(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_event_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF NEW.slug IS NULL OR NEW.slug = '' THEN
       NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
       -- Add venue slug prefix
       NEW.slug := (SELECT slug FROM public.venues WHERE id = NEW.venue_id) || '-' || NEW.slug;
       -- Ensure uniqueness
       WHILE EXISTS (SELECT 1 FROM public.events WHERE slug = NEW.slug AND id != NEW.id) LOOP
           NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
       END LOOP;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_event_slug() OWNER TO postgres;

--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
   year_month VARCHAR(6);
   sequence_num INTEGER;
BEGIN
   -- Format: INV-YYYYMM-0001
   year_month := TO_CHAR(CURRENT_DATE, 'YYYYMM');
   
   SELECT COUNT(*) + 1 INTO sequence_num
   FROM public.invoices
   WHERE invoice_number LIKE 'INV-' || year_month || '-%';
   
   NEW.invoice_number := 'INV-' || year_month || '-' || LPAD(sequence_num::TEXT, 4, '0');
   
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_invoice_number() OWNER TO postgres;

--
-- Name: generate_qr_code_data(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_qr_code_data() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
   qr_data JSONB;


BEGIN
   -- Create QR code data
   qr_data := jsonb_build_object(
       'ticket_id', NEW.id,
       'ticket_code', NEW.ticket_code,
       'event_id', NEW.event_id,
       'owner_id', NEW.owner_id,
       'valid', NEW.is_valid
   );


   
   -- Encrypt the data (in production, use proper encryption)
   NEW.qr_code_data := encode(qr_data::text::bytea, 'base64');


   NEW.qr_code_generated_at := CURRENT_TIMESTAMP;


   
   RETURN NEW;


END;


$$;


ALTER FUNCTION public.generate_qr_code_data() OWNER TO postgres;

--
-- Name: generate_random_code(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_random_code(length integer DEFAULT 6) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
   chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   result TEXT := '';
   i INTEGER;
BEGIN
   FOR i IN 1..length LOOP
       result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
   END LOOP;
   RETURN result;
END;
$$;


ALTER FUNCTION public.generate_random_code(length integer) OWNER TO postgres;

--
-- Name: FUNCTION generate_random_code(length integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.generate_random_code(length integer) IS 'Generate random alphanumeric code';


--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_ticket_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
   event_code VARCHAR(4);


   sequence_num INTEGER;


BEGIN
   -- Get event code (first 4 chars of event slug)
   SELECT UPPER(SUBSTR(slug, 1, 4)) INTO event_code
   FROM public.events WHERE id = NEW.event_id;


   
   -- Get next sequence number for this event
   SELECT COUNT(*) + 1 INTO sequence_num
   FROM public.tickets WHERE event_id = NEW.event_id;


   
   -- Generate ticket number: EVNT-000001
   NEW.ticket_number := event_code || '-' || LPAD(sequence_num::TEXT, 6, '0');


   
   RETURN NEW;


END;


$$;


ALTER FUNCTION public.generate_ticket_number() OWNER TO postgres;

--
-- Name: generate_user_referral_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_user_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF NEW.referral_code IS NULL THEN
       NEW.referral_code := UPPER(generate_random_code(8));
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_user_referral_code() OWNER TO postgres;

--
-- Name: generate_venue_slug(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_venue_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        WHILE EXISTS (SELECT 1 FROM public.venues WHERE slug = NEW.slug AND id != NEW.id) LOOP
            NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_venue_slug() OWNER TO postgres;

--
-- Name: increment_referral_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_referral_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF NEW.referred_by IS NOT NULL AND NEW.email_verified = TRUE AND OLD.email_verified = FALSE THEN
       UPDATE public.users 
       SET referral_count = referral_count + 1 
       WHERE id = NEW.referred_by;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.increment_referral_count() OWNER TO postgres;

--
-- Name: is_email_available(character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_email_available(check_email character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
   RETURN NOT EXISTS (
       SELECT 1 FROM public.users 
       WHERE email = check_email 
       AND deleted_at IS NULL
   );
END;
$$;


ALTER FUNCTION public.is_email_available(check_email character varying) OWNER TO postgres;

--
-- Name: is_username_available(character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_username_available(check_username character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
   RETURN NOT EXISTS (
       SELECT 1 FROM public.users 
       WHERE username = check_username 
       AND deleted_at IS NULL
   );
END;
$$;


ALTER FUNCTION public.is_username_available(check_username character varying) OWNER TO postgres;

--
-- Name: is_venue_available(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_venue_available(p_venue_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN TRUE; -- Placeholder
END;
$$;


ALTER FUNCTION public.is_venue_available(p_venue_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone) OWNER TO postgres;

--
-- Name: soft_delete_user(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.soft_delete_user(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
   UPDATE public.users 
   SET 
       deleted_at = CURRENT_TIMESTAMP,
       status = 'DELETED',
       email = email || '.deleted.' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP),
       username = CASE 
           WHEN username IS NOT NULL 
           THEN username || '.deleted.' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
           ELSE NULL
       END
   WHERE id = user_id;
   
   RETURN FOUND;
END;
$$;


ALTER FUNCTION public.soft_delete_user(user_id uuid) OWNER TO postgres;

--
-- Name: track_price_history(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.track_price_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Record price change
  IF NEW.price != OLD.price OR TG_OP = 'INSERT' THEN
      INSERT INTO public.price_history (
          ticket_id, listing_id, price, currency, price_type, event_id, source
      )
      SELECT 
          NEW.ticket_id, NEW.id, NEW.price, NEW.currency, 'LISTING',
          t.event_id, 'USER'
      FROM public.tickets t
      WHERE t.id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.track_price_history() OWNER TO postgres;

--
-- Name: transfer_ticket(uuid, uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.transfer_ticket(p_ticket_id uuid, p_from_user_id uuid, p_to_user_id uuid, p_transfer_price numeric DEFAULT NULL::numeric) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
   v_transfer_id UUID;


   v_transaction_id UUID;


BEGIN
   -- Validate transfer is allowed
   IF NOT EXISTS (
       SELECT 1 FROM public.tickets 
       WHERE id = p_ticket_id 
       AND owner_id = p_from_user_id 
       AND is_transferable = TRUE
       AND (transfer_locked_until IS NULL OR transfer_locked_until < CURRENT_TIMESTAMP)
   ) THEN
       RAISE EXCEPTION 'Transfer not allowed for this ticket';


   END IF;


   
   -- Create transaction record
   INSERT INTO public.ticket_transactions (
       ticket_id, transaction_type, from_user_id, to_user_id, amount, status
   ) VALUES (
       p_ticket_id, 'TRANSFER', p_from_user_id, p_to_user_id, p_transfer_price, 'PROCESSING'
   ) RETURNING id INTO v_transaction_id;


   
   -- Create transfer record
   INSERT INTO public.ticket_transfers (
       ticket_id, transaction_id, from_user_id, to_user_id, 
       transfer_price, status
   ) VALUES (
       p_ticket_id, v_transaction_id, p_from_user_id, p_to_user_id,
       p_transfer_price, 'PENDING'
   ) RETURNING id INTO v_transfer_id;


   
   -- Update ticket owner and status
   UPDATE public.tickets
   SET 
       owner_id = p_to_user_id,
       transfer_count = transfer_count + 1,
       status = 'TRANSFERRED',
       updated_at = CURRENT_TIMESTAMP
   WHERE id = p_ticket_id;


   
   -- Complete transaction
   UPDATE public.ticket_transactions
   SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
   WHERE id = v_transaction_id;


   
   -- Complete transfer
   UPDATE public.ticket_transfers
   SET status = 'COMPLETED', accepted_at = CURRENT_TIMESTAMP
   WHERE id = v_transfer_id;


   
   RETURN v_transfer_id;


END;


$$;


ALTER FUNCTION public.transfer_ticket(p_ticket_id uuid, p_from_user_id uuid, p_to_user_id uuid, p_transfer_price numeric) OWNER TO postgres;

--
-- Name: update_available_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_available_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- When sold_count or pending_count changes, update available_capacity
   NEW.available_capacity := NEW.total_capacity - NEW.sold_count - NEW.pending_count - NEW.reserved_capacity;
   
   -- Ensure available capacity doesn't go negative
   IF NEW.available_capacity < 0 THEN
       NEW.available_capacity := 0;
   END IF;
   
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_available_capacity() OWNER TO postgres;

--
-- Name: update_category_event_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_category_event_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF TG_OP = 'INSERT' AND NEW.primary_category_id IS NOT NULL THEN
       UPDATE public.event_categories 
       SET event_count = event_count + 1 
       WHERE id = NEW.primary_category_id;
   ELSIF TG_OP = 'DELETE' AND OLD.primary_category_id IS NOT NULL THEN
       UPDATE public.event_categories 
       SET event_count = event_count - 1 
       WHERE id = OLD.primary_category_id;
   ELSIF TG_OP = 'UPDATE' THEN
       IF OLD.primary_category_id IS DISTINCT FROM NEW.primary_category_id THEN
           IF OLD.primary_category_id IS NOT NULL THEN
               UPDATE public.event_categories 
               SET event_count = event_count - 1 
               WHERE id = OLD.primary_category_id;
           END IF;
           IF NEW.primary_category_id IS NOT NULL THEN
               UPDATE public.event_categories 
               SET event_count = event_count + 1 
               WHERE id = NEW.primary_category_id;
           END IF;
       END IF;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_category_event_count() OWNER TO postgres;

--
-- Name: update_subscription_on_payment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_subscription_on_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- Only process subscription payments
   IF NEW.type = 'payment' AND NEW.status = 'succeeded' AND 
      EXISTS (SELECT 1 FROM public.invoices WHERE transaction_id = NEW.id AND subscription_id IS NOT NULL) THEN
       
       UPDATE public.subscriptions
       SET current_period_start = current_period_end,
           current_period_end = current_period_end + 
               CASE interval
                   WHEN 'daily' THEN INTERVAL '1 day' * interval_count
                   WHEN 'weekly' THEN INTERVAL '1 week' * interval_count
                   WHEN 'monthly' THEN INTERVAL '1 month' * interval_count
                   WHEN 'quarterly' THEN INTERVAL '3 months' * interval_count
                   WHEN 'yearly' THEN INTERVAL '1 year' * interval_count
               END
       WHERE id = (SELECT subscription_id FROM public.invoices WHERE transaction_id = NEW.id);
   END IF;
   
   RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_subscription_on_payment() OWNER TO postgres;

--
-- Name: update_ticket_on_redemption(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ticket_on_redemption() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- Update redemption count
   UPDATE public.tickets
   SET 
       redemption_count = redemption_count + 1,
       first_redeemed_at = COALESCE(first_redeemed_at, NEW.redeemed_at),
       last_redeemed_at = NEW.redeemed_at,
       status = CASE 
           WHEN redemption_count + 1 >= (
               SELECT max_redemptions_per_ticket 
               FROM public.ticket_types 
               WHERE id = tickets.ticket_type_id
           ) THEN 'REDEEMED'
           ELSE status
       END
   WHERE id = NEW.ticket_id;


   
   RETURN NEW;


END;


$$;


ALTER FUNCTION public.update_ticket_on_redemption() OWNER TO postgres;

--
-- Name: update_ticket_type_supply(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ticket_type_supply() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   IF TG_OP = 'INSERT' THEN
       UPDATE public.ticket_types 
       SET current_supply = current_supply + 1
       WHERE id = NEW.ticket_type_id;


   ELSIF TG_OP = 'DELETE' THEN
       UPDATE public.ticket_types 
       SET current_supply = current_supply - 1
       WHERE id = OLD.ticket_type_id;


   END IF;


   RETURN NULL;


END;


$$;


ALTER FUNCTION public.update_ticket_type_supply() OWNER TO postgres;

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
-- Name: FUNCTION update_updated_at_column(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at timestamp';


--
-- Name: validate_json_schema(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_json_schema(data jsonb, schema jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
   -- Simplified validation - extend as needed
   RETURN data IS NOT NULL AND jsonb_typeof(data) = 'object';
END;
$$;


ALTER FUNCTION public.validate_json_schema(data jsonb, schema jsonb) OWNER TO postgres;

--
-- Name: FUNCTION validate_json_schema(data jsonb, schema jsonb); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.validate_json_schema(data jsonb, schema jsonb) IS 'Validate JSON data against schema';


--
-- Name: validate_ticket_redemption(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_ticket_redemption(p_ticket_id uuid, p_event_schedule_id uuid DEFAULT NULL::uuid) RETURNS TABLE(is_valid boolean, error_message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
   v_ticket RECORD;


   v_ticket_type RECORD;


   v_event RECORD;


   v_schedule RECORD;


BEGIN
   -- Get ticket details
   SELECT t.*, tt.max_redemptions_per_ticket
   INTO v_ticket
   FROM public.tickets t
   JOIN public.ticket_types tt ON t.ticket_type_id = tt.id
   WHERE t.id = p_ticket_id;


   
   IF NOT FOUND THEN
       RETURN QUERY SELECT FALSE, 'Ticket not found';


       RETURN;


   END IF;


   
   -- Check ticket status
   IF v_ticket.status NOT IN ('ACTIVE', 'TRANSFERRED') THEN
       RETURN QUERY SELECT FALSE, 'Ticket status is ' || v_ticket.status;


       RETURN;


   END IF;


   
   -- Check if ticket is valid
   IF NOT v_ticket.is_valid THEN
       RETURN QUERY SELECT FALSE, 'Ticket has been invalidated: ' || COALESCE(v_ticket.invalidation_reason, 'Unknown reason');


       RETURN;


   END IF;


   
   -- Check redemption limit
   IF v_ticket.redemption_count >= v_ticket.max_redemptions_per_ticket THEN
       RETURN QUERY SELECT FALSE, 'Ticket has reached maximum redemptions';


       RETURN;


   END IF;


   
   -- All checks passed
   RETURN QUERY SELECT TRUE, NULL::TEXT;


END;


$$;


ALTER FUNCTION public.validate_ticket_redemption(p_ticket_id uuid, p_event_schedule_id uuid) OWNER TO postgres;

--
-- Name: venue_distance(numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.venue_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    R NUMERIC := 6371; -- Earth radius in km
    dlat NUMERIC;
    dlon NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    dlat := RADIANS(lat2 - lat1);
    dlon := RADIANS(lon2 - lon1);
    a := SIN(dlat/2) * SIN(dlat/2) + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * SIN(dlon/2) * SIN(dlon/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    RETURN R * c;
END;
$$;


ALTER FUNCTION public.venue_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: audit; Owner: postgres
--

CREATE TABLE audit.audit_log (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    table_name text NOT NULL,
    operation text NOT NULL,
    user_id uuid,
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    old_data jsonb,
    new_data jsonb,
    query text,
    ip_address inet
);


ALTER TABLE audit.audit_log OWNER TO postgres;

--
-- Name: blockchain_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blockchain_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tx_hash text,
    status text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.blockchain_transactions OWNER TO postgres;

--
-- Name: dispute_resolution; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dispute_resolution (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    marketplace_transaction_id uuid NOT NULL,
    escrow_id uuid,
    initiator_id uuid NOT NULL,
    respondent_id uuid NOT NULL,
    dispute_type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'OPEN'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'NORMAL'::character varying,
    reason character varying(100) NOT NULL,
    description text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb,
    resolution_type character varying(50),
    resolution_decision text,
    resolved_by uuid,
    resolution_amount numeric(10,2),
    buyer_refund_amount numeric(10,2),
    seller_payout_amount numeric(10,2),
    messages jsonb DEFAULT '[]'::jsonb,
    last_message_at timestamp with time zone,
    is_escalated boolean DEFAULT false,
    escalated_at timestamp with time zone,
    escalation_level integer DEFAULT 1,
    response_deadline timestamp with time zone,
    resolution_deadline timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    opened_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_dispute_status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'AWAITING_RESPONSE'::character varying, 'UNDER_REVIEW'::character varying, 'RESOLVED'::character varying, 'CLOSED'::character varying, 'ESCALATED'::character varying])::text[]))),
    CONSTRAINT valid_dispute_type CHECK (((dispute_type)::text = ANY ((ARRAY['NON_DELIVERY'::character varying, 'NOT_AS_DESCRIBED'::character varying, 'FRAUDULENT'::character varying, 'DUPLICATE_CHARGE'::character varying, 'TRANSFER_ISSUE'::character varying, 'AUTHENTICATION'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT valid_resolution_type CHECK (((resolution_type IS NULL) OR ((resolution_type)::text = ANY ((ARRAY['FULL_REFUND'::character varying, 'PARTIAL_REFUND'::character varying, 'NO_REFUND'::character varying, 'REPLACEMENT'::character varying, 'SPLIT'::character varying])::text[]))))
);


ALTER TABLE public.dispute_resolution OWNER TO postgres;

--
-- Name: escrow; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.escrow (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    marketplace_transaction_id uuid NOT NULL,
    payment_transaction_id uuid,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    status character varying(50) DEFAULT 'HELD'::character varying NOT NULL,
    release_type character varying(50) DEFAULT 'AUTOMATIC'::character varying,
    auto_release_at timestamp with time zone,
    release_conditions jsonb DEFAULT '{}'::jsonb,
    buyer_approved boolean DEFAULT false,
    seller_approved boolean DEFAULT false,
    admin_approved boolean DEFAULT false,
    buyer_approved_at timestamp with time zone,
    seller_approved_at timestamp with time zone,
    admin_approved_at timestamp with time zone,
    is_disputed boolean DEFAULT false,
    dispute_id uuid,
    released_at timestamp with time zone,
    released_to character varying(50),
    release_transaction_id uuid,
    hold_reason text,
    release_notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_escrow_status CHECK (((status)::text = ANY ((ARRAY['HELD'::character varying, 'PENDING_RELEASE'::character varying, 'RELEASED'::character varying, 'REFUNDED'::character varying, 'DISPUTED'::character varying, 'EXPIRED'::character varying])::text[]))),
    CONSTRAINT valid_release_type CHECK (((release_type)::text = ANY ((ARRAY['AUTOMATIC'::character varying, 'MANUAL'::character varying, 'CONDITIONAL'::character varying, 'DISPUTE_RESOLUTION'::character varying])::text[])))
);


ALTER TABLE public.escrow OWNER TO postgres;

--
-- Name: event_capacity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_capacity (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
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
    row_config jsonb,
    seat_map jsonb,
    is_active boolean DEFAULT true,
    is_visible boolean DEFAULT true,
    minimum_purchase integer DEFAULT 1,
    maximum_purchase integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_capacity CHECK (((total_capacity >= 0) AND (available_capacity >= 0) AND (available_capacity <= total_capacity)))
);


ALTER TABLE public.event_capacity OWNER TO postgres;

--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
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
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    event_id uuid NOT NULL,
    performers jsonb DEFAULT '[]'::jsonb,
    headliner character varying(200),
    supporting_acts text[],
    production_company character varying(200),
    technical_requirements jsonb DEFAULT '{}'::jsonb,
    stage_setup_time_hours integer,
    sponsors jsonb DEFAULT '[]'::jsonb,
    primary_sponsor character varying(200),
    performance_rights_org character varying(100),
    licensing_requirements text[],
    insurance_requirements jsonb DEFAULT '{}'::jsonb,
    press_release text,
    marketing_copy jsonb DEFAULT '{}'::jsonb,
    social_media_copy jsonb DEFAULT '{}'::jsonb,
    sound_requirements jsonb DEFAULT '{}'::jsonb,
    lighting_requirements jsonb DEFAULT '{}'::jsonb,
    video_requirements jsonb DEFAULT '{}'::jsonb,
    catering_requirements jsonb DEFAULT '{}'::jsonb,
    rider_requirements jsonb DEFAULT '{}'::jsonb,
    production_budget numeric(12,2),
    marketing_budget numeric(12,2),
    projected_revenue numeric(12,2),
    break_even_capacity integer,
    previous_events jsonb DEFAULT '[]'::jsonb,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_metadata OWNER TO postgres;

--
-- Name: event_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_pricing (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    event_id uuid NOT NULL,
    schedule_id uuid,
    capacity_id uuid,
    name character varying(100) NOT NULL,
    description text,
    tier character varying(50),
    base_price numeric(10,2) NOT NULL,
    service_fee numeric(10,2) DEFAULT 0,
    facility_fee numeric(10,2) DEFAULT 0,
    tax_rate numeric(5,4) DEFAULT 0,
    is_dynamic boolean DEFAULT false,
    min_price numeric(10,2),
    max_price numeric(10,2),
    price_adjustment_rules jsonb DEFAULT '{}'::jsonb,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_base_price CHECK ((base_price >= (0)::numeric)),
    CONSTRAINT valid_dynamic_range CHECK (((is_dynamic = false) OR ((min_price IS NOT NULL) AND (max_price IS NOT NULL) AND (min_price <= max_price)))),
    CONSTRAINT valid_early_bird CHECK (((early_bird_price IS NULL) OR ((early_bird_price < base_price) AND (early_bird_ends_at IS NOT NULL))))
);


ALTER TABLE public.event_pricing OWNER TO postgres;

--
-- Name: event_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_schedules (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    event_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    doors_open_at timestamp with time zone,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    recurrence_end_date date,
    occurrence_number integer,
    timezone character varying(50) NOT NULL,
    utc_offset integer,
    status character varying(20) DEFAULT 'SCHEDULED'::character varying,
    status_reason text,
    capacity_override integer,
    check_in_opens_at timestamp with time zone,
    check_in_closes_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_doors_open CHECK (((doors_open_at IS NULL) OR (doors_open_at <= starts_at))),
    CONSTRAINT valid_schedule_dates CHECK ((ends_at > starts_at)),
    CONSTRAINT valid_schedule_status CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'CONFIRMED'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'POSTPONED'::character varying, 'RESCHEDULED'::character varying])::text[])))
);


ALTER TABLE public.event_schedules OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
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
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    visibility character varying(20) DEFAULT 'PUBLIC'::character varying,
    is_featured boolean DEFAULT false,
    priority_score integer DEFAULT 0,
    banner_image_url text,
    thumbnail_image_url text,
    image_gallery jsonb DEFAULT '[]'::jsonb,
    video_url text,
    virtual_event_url text,
    age_restriction integer DEFAULT 0,
    dress_code character varying(100),
    special_requirements text[],
    accessibility_info jsonb DEFAULT '{}'::jsonb,
    collection_address character varying(44),
    mint_authority character varying(44),
    royalty_percentage numeric(5,2),
    is_virtual boolean DEFAULT false,
    is_hybrid boolean DEFAULT false,
    streaming_platform character varying(50),
    streaming_config jsonb DEFAULT '{}'::jsonb,
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
    CONSTRAINT valid_event_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'REVIEW'::character varying, 'APPROVED'::character varying, 'PUBLISHED'::character varying, 'ON_SALE'::character varying, 'SOLD_OUT'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'POSTPONED'::character varying])::text[]))),
    CONSTRAINT valid_event_type CHECK (((event_type)::text = ANY ((ARRAY['single'::character varying, 'recurring'::character varying, 'series'::character varying])::text[]))),
    CONSTRAINT valid_visibility CHECK (((visibility)::text = ANY ((ARRAY['PUBLIC'::character varying, 'PRIVATE'::character varying, 'UNLISTED'::character varying])::text[])))
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: financial_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_reports (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    report_type character varying(50) NOT NULL,
    report_period character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_revenue bigint DEFAULT 0 NOT NULL,
    refund_amount bigint DEFAULT 0 NOT NULL,
    net_revenue bigint DEFAULT 0 NOT NULL,
    total_transactions integer DEFAULT 0 NOT NULL,
    successful_transactions integer DEFAULT 0 NOT NULL,
    failed_transactions integer DEFAULT 0 NOT NULL,
    platform_fees bigint DEFAULT 0 NOT NULL,
    processing_fees bigint DEFAULT 0 NOT NULL,
    network_fees bigint DEFAULT 0 NOT NULL,
    total_fees bigint GENERATED ALWAYS AS (((platform_fees + processing_fees) + network_fees)) STORED,
    revenue_by_method jsonb DEFAULT '{}'::jsonb,
    transactions_by_method jsonb DEFAULT '{}'::jsonb,
    revenue_by_currency jsonb DEFAULT '{}'::jsonb,
    average_transaction_value bigint,
    average_fee_percentage numeric(5,4),
    new_subscriptions integer DEFAULT 0,
    cancelled_subscriptions integer DEFAULT 0,
    mrr bigint DEFAULT 0,
    arr bigint DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    generated_at timestamp with time zone,
    report_url text,
    report_data jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_report_period CHECK (((report_period)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying, 'custom'::character varying])::text[]))),
    CONSTRAINT valid_report_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'generating'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT valid_report_type CHECK (((report_type)::text = ANY ((ARRAY['revenue'::character varying, 'transaction'::character varying, 'settlement'::character varying, 'tax'::character varying, 'subscription'::character varying, 'chargeback'::character varying, 'comprehensive'::character varying])::text[])))
);


ALTER TABLE public.financial_reports OWNER TO postgres;

--
-- Name: fraud_prevention_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fraud_prevention_rules (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    rule_name character varying(100) NOT NULL,
    rule_type character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    severity character varying(20) DEFAULT 'MEDIUM'::character varying,
    conditions jsonb NOT NULL,
    action character varying(50) NOT NULL,
    action_parameters jsonb DEFAULT '{}'::jsonb,
    triggers_count integer DEFAULT 0,
    false_positive_count integer DEFAULT 0,
    last_triggered_at timestamp with time zone,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_action CHECK (((action)::text = ANY ((ARRAY['BLOCK'::character varying, 'FLAG_REVIEW'::character varying, 'REQUIRE_VERIFICATION'::character varying, 'LIMIT_FEATURES'::character varying, 'NOTIFY_ADMIN'::character varying, 'AUTO_DELIST'::character varying])::text[]))),
    CONSTRAINT valid_rule_type CHECK (((rule_type)::text = ANY ((ARRAY['PRICE_MANIPULATION'::character varying, 'VELOCITY'::character varying, 'GEOGRAPHIC'::character varying, 'PAYMENT'::character varying, 'USER_BEHAVIOR'::character varying, 'LISTING_PATTERN'::character varying, 'TRANSACTION_PATTERN'::character varying])::text[]))),
    CONSTRAINT valid_severity CHECK (((severity)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);


ALTER TABLE public.fraud_prevention_rules OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    user_id uuid NOT NULL,
    subscription_id uuid,
    invoice_number character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    payment_date date,
    subtotal bigint NOT NULL,
    tax_amount bigint DEFAULT 0,
    discount_amount bigint DEFAULT 0,
    total_amount bigint GENERATED ALWAYS AS (((subtotal + tax_amount) - discount_amount)) STORED,
    amount_paid bigint DEFAULT 0,
    amount_due bigint GENERATED ALWAYS AS ((((subtotal + tax_amount) - discount_amount) - amount_paid)) STORED,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    tax_rate numeric(5,4),
    tax_id character varying(50),
    payment_method_id uuid,
    transaction_id uuid,
    provider_invoice_id text,
    provider_invoice_url text,
    pdf_url text,
    pdf_generated_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_invoice_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'open'::character varying, 'paid'::character varying, 'void'::character varying, 'uncollectible'::character varying])::text[])))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: listings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.listings (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    listing_type character varying(50) DEFAULT 'FIXED_PRICE'::character varying,
    price numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    original_price numeric(10,2),
    min_price numeric(10,2),
    max_price numeric(10,2),
    price_cap_percentage numeric(5,2) DEFAULT 200,
    auto_price_drop boolean DEFAULT false,
    price_drop_percentage numeric(5,2),
    price_drop_interval_hours integer DEFAULT 24,
    last_price_drop_at timestamp with time zone,
    market_maker_enabled boolean DEFAULT false,
    spread_percentage numeric(5,2) DEFAULT 2.0,
    liquidity_pool_id uuid,
    is_featured boolean DEFAULT false,
    featured_until timestamp with time zone,
    visibility character varying(50) DEFAULT 'PUBLIC'::character varying,
    instant_transfer boolean DEFAULT true,
    transfer_deadline_hours integer DEFAULT 24,
    accepts_offers boolean DEFAULT true,
    view_count integer DEFAULT 0,
    offer_count integer DEFAULT 0,
    price_history jsonb DEFAULT '[]'::jsonb,
    listing_title character varying(200),
    listing_description text,
    tags text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    listed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    sold_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT price_cap_check CHECK (((original_price IS NULL) OR (price <= (original_price * (price_cap_percentage / 100.0))))),
    CONSTRAINT valid_listing_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'SOLD'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying, 'SUSPENDED'::character varying, 'PENDING_APPROVAL'::character varying])::text[]))),
    CONSTRAINT valid_price_limits CHECK ((((min_price IS NULL) OR (price >= min_price)) AND ((max_price IS NULL) OR (price <= max_price))))
);


ALTER TABLE public.listings OWNER TO postgres;

--
-- Name: market_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.market_analytics (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    analytics_type character varying(50) NOT NULL,
    scope_id uuid,
    period character varying(20) NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    total_listings integer DEFAULT 0,
    total_sales integer DEFAULT 0,
    total_volume numeric(12,2) DEFAULT 0,
    average_price numeric(10,2),
    median_price numeric(10,2),
    price_std_dev numeric(10,2),
    min_price numeric(10,2),
    max_price numeric(10,2),
    active_listings integer DEFAULT 0,
    unique_sellers integer DEFAULT 0,
    unique_buyers integer DEFAULT 0,
    average_time_to_sale interval,
    sell_through_rate numeric(5,2),
    price_change_percentage numeric(5,2),
    volatility_index numeric(5,2),
    calculation_metadata jsonb DEFAULT '{}'::jsonb,
    calculated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_analytics_type CHECK (((analytics_type)::text = ANY ((ARRAY['EVENT'::character varying, 'VENUE'::character varying, 'CATEGORY'::character varying, 'ARTIST'::character varying, 'GLOBAL'::character varying])::text[]))),
    CONSTRAINT valid_period CHECK (((period)::text = ANY ((ARRAY['HOURLY'::character varying, 'DAILY'::character varying, 'WEEKLY'::character varying, 'MONTHLY'::character varying, 'QUARTERLY'::character varying, 'YEARLY'::character varying])::text[])))
);


ALTER TABLE public.market_analytics OWNER TO postgres;

--
-- Name: marketplace_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_transactions (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    listing_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    offer_id uuid,
    escrow_id uuid,
    transaction_type character varying(50) DEFAULT 'SALE'::character varying NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    sale_price numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    platform_fee numeric(10,2) DEFAULT 0,
    platform_fee_percentage numeric(5,2) DEFAULT 5.0,
    payment_processing_fee numeric(10,2) DEFAULT 0,
    blockchain_fee numeric(10,2) DEFAULT 0,
    total_fees numeric(10,2) GENERATED ALWAYS AS (((platform_fee + payment_processing_fee) + blockchain_fee)) STORED,
    seller_payout numeric(10,2) GENERATED ALWAYS AS ((((sale_price - platform_fee) - payment_processing_fee) - blockchain_fee)) STORED,
    transfer_initiated_at timestamp with time zone,
    transfer_completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_transaction_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying, 'DISPUTED'::character varying, 'REFUNDED'::character varying])::text[]))),
    CONSTRAINT valid_transaction_type CHECK (((transaction_type)::text = ANY ((ARRAY['SALE'::character varying, 'AUCTION_WIN'::character varying, 'OFFER_ACCEPTED'::character varying, 'INSTANT_BUY'::character varying])::text[])))
);


ALTER TABLE public.marketplace_transactions OWNER TO postgres;

--
-- Name: offers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offers (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    offer_amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '24:00:00'::interval) NOT NULL,
    buyer_message text,
    seller_response text,
    is_counter_offer boolean DEFAULT false,
    previous_offer_id uuid,
    counter_offer_count integer DEFAULT 0,
    auto_accept_enabled boolean DEFAULT false,
    auto_accept_price numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT max_counter_offers CHECK ((counter_offer_count <= 5)),
    CONSTRAINT positive_offer CHECK ((offer_amount > (0)::numeric)),
    CONSTRAINT valid_offer_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'REJECTED'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying, 'COUNTERED'::character varying, 'AUTO_REJECTED'::character varying])::text[])))
);


ALTER TABLE public.offers OWNER TO postgres;

--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    provider character varying(50),
    payment_token text,
    last_four character varying(4),
    card_brand character varying(20),
    card_type character varying(20),
    account_last_four character varying(4),
    routing_number_encrypted text,
    account_type character varying(20),
    wallet_address character varying(44),
    wallet_type character varying(20),
    network character varying(50),
    billing_name character varying(200),
    billing_email character varying(255),
    billing_phone character varying(20),
    billing_address_line1 character varying(255),
    billing_address_line2 character varying(255),
    billing_city character varying(100),
    billing_state character varying(100),
    billing_postal_code character varying(20),
    billing_country character varying(2),
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    verification_method character varying(50),
    expiry_month integer,
    expiry_year integer,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    nickname character varying(100),
    risk_score integer DEFAULT 0,
    fraud_check_passed boolean,
    requires_3ds boolean DEFAULT true,
    provider_customer_id text,
    provider_payment_method_id text,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone,
    CONSTRAINT valid_card_expiry CHECK ((((type)::text <> ALL ((ARRAY['credit_card'::character varying, 'debit_card'::character varying])::text[])) OR (((expiry_month >= 1) AND (expiry_month <= 12)) AND ((expiry_year)::numeric >= EXTRACT(year FROM CURRENT_DATE))))),
    CONSTRAINT valid_payment_type CHECK (((type)::text = ANY ((ARRAY['credit_card'::character varying, 'debit_card'::character varying, 'bank_account'::character varying, 'crypto'::character varying, 'paypal'::character varying, 'apple_pay'::character varying, 'google_pay'::character varying, 'other'::character varying])::text[])))
);


ALTER TABLE public.payment_methods OWNER TO postgres;

--
-- Name: price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_history (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    listing_id uuid,
    price numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    price_type character varying(50) NOT NULL,
    market_average numeric(10,2),
    market_low numeric(10,2),
    market_high numeric(10,2),
    percentile_rank integer,
    event_id uuid NOT NULL,
    days_until_event integer,
    source character varying(50),
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_price_type CHECK (((price_type)::text = ANY ((ARRAY['LISTING'::character varying, 'SALE'::character varying, 'OFFER'::character varying, 'ASK'::character varying, 'BID'::character varying, 'MARKET_MAKER'::character varying])::text[])))
);


ALTER TABLE public.price_history OWNER TO postgres;

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refunds (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    transaction_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount bigint NOT NULL,
    currency character varying(10) NOT NULL,
    reason character varying(100) NOT NULL,
    reason_details text,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    provider_refund_id text,
    provider_status character varying(50),
    provider_response jsonb,
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp with time zone,
    processed_at timestamp with time zone,
    completed_at timestamp with time zone,
    approved_by uuid,
    approval_notes text,
    auto_approved boolean DEFAULT false,
    refund_fee bigint DEFAULT 0,
    net_refund_amount bigint GENERATED ALWAYS AS ((amount - refund_fee)) STORED,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_refund_reason CHECK (((reason)::text = ANY ((ARRAY['duplicate'::character varying, 'fraudulent'::character varying, 'requested_by_customer'::character varying, 'event_cancelled'::character varying, 'technical_issue'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT valid_refund_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'reversed'::character varying])::text[])))
);


ALTER TABLE public.refunds OWNER TO postgres;

--
-- Name: royalties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.royalties (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    marketplace_transaction_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    royalty_percentage numeric(5,2) NOT NULL,
    sale_amount numeric(10,2) NOT NULL,
    royalty_amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    payment_transaction_id uuid,
    distribution_type character varying(50) DEFAULT 'IMMEDIATE'::character varying,
    batch_id uuid,
    calculation_details jsonb DEFAULT '{}'::jsonb,
    calculated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT royalty_calculation_check CHECK ((royalty_amount = round((sale_amount * (royalty_percentage / 100.0)), 2))),
    CONSTRAINT valid_royalty_percentage CHECK (((royalty_percentage >= (0)::numeric) AND (royalty_percentage <= (50)::numeric))),
    CONSTRAINT valid_royalty_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'PAID'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.royalties OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    version integer NOT NULL,
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: settlements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settlements (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    settlement_date date NOT NULL,
    provider character varying(50) NOT NULL,
    provider_settlement_id text,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    gross_amount bigint NOT NULL,
    fee_amount bigint NOT NULL,
    net_amount bigint NOT NULL,
    transaction_count integer NOT NULL,
    refund_count integer DEFAULT 0,
    chargeback_count integer DEFAULT 0,
    bank_account_id uuid,
    transfer_initiated_at timestamp with time zone,
    transfer_completed_at timestamp with time zone,
    transfer_reference character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    payment_volume bigint DEFAULT 0,
    refund_volume bigint DEFAULT 0,
    fee_breakdown jsonb DEFAULT '{}'::jsonb,
    is_reconciled boolean DEFAULT false,
    reconciled_at timestamp with time zone,
    reconciliation_notes text,
    discrepancy_amount bigint DEFAULT 0,
    report_url text,
    invoice_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_settlement_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying, 'reversed'::character varying])::text[])))
);


ALTER TABLE public.settlements OWNER TO postgres;

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    user_id uuid NOT NULL,
    payment_method_id uuid,
    plan_id character varying(100) NOT NULL,
    plan_name character varying(200),
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    amount bigint NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    "interval" character varying(20) NOT NULL,
    interval_count integer DEFAULT 1,
    trial_start date,
    trial_end date,
    trial_days integer DEFAULT 0,
    current_period_start date NOT NULL,
    current_period_end date NOT NULL,
    billing_cycle_anchor date,
    cancel_at_period_end boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancellation_reason character varying(100),
    provider character varying(50),
    provider_subscription_id text,
    provider_customer_id text,
    usage_based boolean DEFAULT false,
    usage_limit bigint,
    current_usage bigint DEFAULT 0,
    discount_percentage numeric(5,2),
    discount_amount bigint,
    discount_end_date date,
    metadata jsonb DEFAULT '{}'::jsonb,
    features jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_interval CHECK ((("interval")::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT valid_subscription_status CHECK (((status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying, 'cancelled'::character varying, 'unpaid'::character varying, 'incomplete'::character varying, 'incomplete_expired'::character varying, 'paused'::character varying])::text[])))
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: ticket_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_metadata (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    name character varying(200),
    symbol character varying(10),
    description text,
    image text,
    animation_url text,
    external_url text,
    attributes jsonb DEFAULT '[]'::jsonb,
    properties jsonb DEFAULT '{}'::jsonb,
    collection jsonb,
    uses jsonb,
    seller_fee_basis_points integer DEFAULT 250,
    creators jsonb DEFAULT '[]'::jsonb,
    event_details jsonb,
    venue_details jsonb,
    perks jsonb DEFAULT '[]'::jsonb,
    media_assets jsonb DEFAULT '[]'::jsonb,
    authenticity_hash character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_metadata OWNER TO postgres;

--
-- Name: ticket_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_redemptions (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    event_schedule_id uuid,
    redeemed_by_user_id uuid,
    redeemed_by_staff_id uuid,
    redemption_method character varying(50) DEFAULT 'QR_CODE'::character varying,
    redemption_gate character varying(50),
    redemption_location jsonb,
    device_id character varying(100),
    validation_code character varying(100),
    is_valid boolean DEFAULT true,
    validation_errors text[],
    seat_assigned character varying(50),
    special_instructions text,
    metadata jsonb DEFAULT '{}'::jsonb,
    redeemed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_redemption_method CHECK (((redemption_method)::text = ANY ((ARRAY['QR_CODE'::character varying, 'BARCODE'::character varying, 'MANUAL'::character varying, 'NFC'::character varying, 'FACIAL'::character varying, 'OTHER'::character varying])::text[])))
);


ALTER TABLE public.ticket_redemptions OWNER TO postgres;

--
-- Name: ticket_refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_refunds (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    transaction_id uuid,
    requested_by_user_id uuid NOT NULL,
    approved_by_user_id uuid,
    original_amount numeric(10,2) NOT NULL,
    refund_amount numeric(10,2) NOT NULL,
    refund_fee numeric(10,2) DEFAULT 0,
    refund_percentage numeric(5,2),
    reason character varying(100) NOT NULL,
    reason_details text,
    status character varying(20) DEFAULT 'REQUESTED'::character varying,
    processed_at timestamp with time zone,
    payment_method character varying(50),
    transaction_reference character varying(100),
    supporting_documents jsonb DEFAULT '[]'::jsonb,
    admin_notes text,
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_refund_amount CHECK (((refund_amount >= (0)::numeric) AND (refund_amount <= original_amount))),
    CONSTRAINT valid_refund_status CHECK (((status)::text = ANY ((ARRAY['REQUESTED'::character varying, 'REVIEWING'::character varying, 'APPROVED'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying, 'REJECTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.ticket_refunds OWNER TO postgres;

--
-- Name: ticket_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_transactions (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    blockchain_transaction_id uuid,
    transaction_type character varying(50) NOT NULL,
    from_user_id uuid,
    to_user_id uuid,
    amount numeric(10,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    fee_amount numeric(10,2) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    error_message text,
    transaction_signature character varying(88),
    block_number bigint,
    ip_address inet,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    CONSTRAINT valid_transaction_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT valid_transaction_type CHECK (((transaction_type)::text = ANY ((ARRAY['PURCHASE'::character varying, 'TRANSFER'::character varying, 'LIST'::character varying, 'DELIST'::character varying, 'SALE'::character varying, 'REDEEM'::character varying, 'REFUND'::character varying, 'BURN'::character varying, 'MINT'::character varying])::text[])))
);


ALTER TABLE public.ticket_transactions OWNER TO postgres;

--
-- Name: ticket_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_transfers (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    ticket_id uuid NOT NULL,
    transaction_id uuid,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    to_email character varying(255),
    to_phone character varying(20),
    transfer_method character varying(50) DEFAULT 'DIRECT'::character varying,
    transfer_price numeric(10,2),
    transfer_fee numeric(10,2) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    acceptance_code character varying(20),
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_gift boolean DEFAULT false,
    message text,
    initiated_via character varying(50),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_users CHECK ((from_user_id <> to_user_id)),
    CONSTRAINT valid_transfer_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'REJECTED'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying, 'COMPLETED'::character varying])::text[])))
);


ALTER TABLE public.ticket_transfers OWNER TO postgres;

--
-- Name: ticket_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_types (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    event_id uuid NOT NULL,
    pricing_id uuid,
    capacity_id uuid,
    name character varying(200) NOT NULL,
    description text,
    category character varying(50),
    is_nft_enabled boolean DEFAULT true,
    collection_address character varying(44),
    nft_metadata_template jsonb DEFAULT '{}'::jsonb,
    max_per_customer integer DEFAULT 4,
    max_per_order integer DEFAULT 10,
    total_supply integer NOT NULL,
    current_supply integer DEFAULT 0,
    is_transferable boolean DEFAULT true,
    transfer_fee_percentage numeric(5,2) DEFAULT 0,
    transfer_allowed_after timestamp with time zone,
    transfer_blocked_before_hours integer DEFAULT 0,
    is_refundable boolean DEFAULT true,
    refund_percentage numeric(5,2) DEFAULT 100,
    refund_deadline_hours integer DEFAULT 24,
    max_redemptions_per_ticket integer DEFAULT 1,
    redemption_start_offset_minutes integer DEFAULT '-30'::integer,
    redemption_end_offset_minutes integer DEFAULT 120,
    display_order integer DEFAULT 0,
    color_code character varying(7),
    icon_url text,
    is_active boolean DEFAULT true,
    is_visible boolean DEFAULT true,
    benefits text[],
    restrictions text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_supply CHECK (((current_supply >= 0) AND (current_supply <= total_supply)))
);


ALTER TABLE public.ticket_types OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_transferable boolean DEFAULT true,
    is_valid boolean DEFAULT true,
    mint_address text,
    status text DEFAULT 'active'::text NOT NULL,
    ticket_type_id uuid,
    owner_id uuid,
    event_id uuid,
    transfer_locked_until timestamp with time zone,
    original_purchaser_id uuid,
    ticket_code uuid DEFAULT public.uuid_generate_v1()
);


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    user_id uuid NOT NULL,
    payment_method_id uuid,
    order_id uuid,
    type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    amount bigint NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    exchange_rate numeric(20,10) DEFAULT 1.0,
    platform_fee bigint DEFAULT 0,
    payment_processor_fee bigint DEFAULT 0,
    network_fee bigint DEFAULT 0,
    total_fee bigint GENERATED ALWAYS AS (((platform_fee + payment_processor_fee) + network_fee)) STORED,
    net_amount bigint GENERATED ALWAYS AS ((((amount - platform_fee) - payment_processor_fee) - network_fee)) STORED,
    provider character varying(50),
    provider_transaction_id text,
    provider_reference text,
    provider_response jsonb,
    blockchain_network character varying(50),
    transaction_hash character varying(100),
    block_number bigint,
    confirmations integer DEFAULT 0,
    authentication_required boolean DEFAULT false,
    authentication_status character varying(50),
    authentication_response jsonb,
    risk_score integer,
    risk_factors jsonb DEFAULT '[]'::jsonb,
    fraud_detected boolean DEFAULT false,
    initiated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_code character varying(50),
    error_message text,
    retry_count integer DEFAULT 0,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    idempotency_key character varying(100),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_amount CHECK ((amount > 0)),
    CONSTRAINT valid_transaction_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'requires_action'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'reversed'::character varying])::text[]))),
    CONSTRAINT valid_transaction_type CHECK (((type)::text = ANY ((ARRAY['payment'::character varying, 'refund'::character varying, 'partial_refund'::character varying, 'payout'::character varying, 'fee'::character varying, 'adjustment'::character varying, 'chargeback'::character varying, 'dispute'::character varying])::text[])))
);


ALTER TABLE public.transactions OWNER TO postgres;

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
    status public.user_status DEFAULT 'PENDING'::public.user_status,
    role character varying(20) DEFAULT 'user'::character varying,
    permissions jsonb DEFAULT '[]'::jsonb,
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret character varying(32),
    backup_codes text[],
    last_password_change timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    password_reset_token character varying(64),
    password_reset_expires timestamp with time zone,
    last_login_at timestamp with time zone,
    last_login_ip inet,
    last_login_device character varying(255),
    login_count integer DEFAULT 0,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    preferences jsonb DEFAULT '{}'::jsonb,
    notification_preferences jsonb DEFAULT '{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}'::jsonb,
    terms_accepted_at timestamp with time zone,
    terms_version character varying(20),
    privacy_accepted_at timestamp with time zone,
    privacy_version character varying(20),
    marketing_consent boolean DEFAULT false,
    marketing_consent_date timestamp with time zone,
    referral_code character varying(20),
    referred_by uuid,
    referral_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    tenant_id uuid,
    mfa_enabled boolean DEFAULT false,
    mfa_secret text,
    CONSTRAINT check_age_minimum CHECK (((date_of_birth IS NULL) OR (date_of_birth <= (CURRENT_DATE - '13 years'::interval)))),
    CONSTRAINT check_email_lowercase CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT check_referral_not_self CHECK (((referred_by IS NULL) OR (referred_by <> id))),
    CONSTRAINT check_username_format CHECK (((username)::text ~ '^[a-zA-Z0-9_]{3,30}$'::text))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: venue_compliance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    license_type character varying(100) NOT NULL,
    license_number character varying(100),
    issuing_authority character varying(200),
    issue_date date,
    expiry_date date,
    is_verified boolean DEFAULT false,
    document_url text,
    document_hash character varying(64),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    compliance_level character varying(20),
    insurance_provider character varying(200),
    insurance_policy_number character varying(100),
    insurance_coverage_amount numeric(12,2),
    insurance_expiry date,
    fire_safety_cert_date date,
    health_inspection_date date,
    security_assessment_date date,
    approved_capacity integer,
    emergency_plan_approved boolean DEFAULT false,
    compliance_notes text,
    outstanding_issues jsonb DEFAULT '[]'::jsonb,
    verified_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_compliance_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'UNDER_REVIEW'::character varying, 'APPROVED'::character varying, 'EXPIRED'::character varying, 'REVOKED'::character varying])::text[])))
);


ALTER TABLE public.venue_compliance OWNER TO postgres;

--
-- Name: venue_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_integrations (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(50) NOT NULL,
    integration_name character varying(100) NOT NULL,
    is_active boolean DEFAULT true,
    api_key_encrypted text,
    api_secret_encrypted text,
    webhook_endpoint text,
    config_data jsonb DEFAULT '{}'::jsonb,
    sync_enabled boolean DEFAULT false,
    sync_frequency character varying(20),
    last_sync_at timestamp with time zone,
    last_sync_status character varying(20),
    last_sync_error text,
    field_mappings jsonb DEFAULT '{}'::jsonb,
    rate_limit integer,
    rate_limit_window integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_integrations OWNER TO postgres;

--
-- Name: venue_layouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_layouts (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    layout_type character varying(50) NOT NULL,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    total_capacity integer NOT NULL,
    seated_capacity integer,
    standing_capacity integer,
    accessible_capacity integer,
    svg_data text,
    seat_map jsonb,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    price_tiers jsonb DEFAULT '[]'::jsonb,
    stage_location character varying(20),
    stage_dimensions jsonb,
    entry_points jsonb DEFAULT '[]'::jsonb,
    exit_points jsonb DEFAULT '[]'::jsonb,
    emergency_exits jsonb DEFAULT '[]'::jsonb,
    restroom_locations jsonb DEFAULT '[]'::jsonb,
    concession_locations jsonb DEFAULT '[]'::jsonb,
    merchandise_locations jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_layouts OWNER TO postgres;

--
-- Name: venue_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_settings (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    allow_print_at_home boolean DEFAULT true,
    allow_mobile_tickets boolean DEFAULT true,
    require_id_verification boolean DEFAULT false,
    ticket_transfer_allowed boolean DEFAULT true,
    ticket_resale_allowed boolean DEFAULT true,
    max_tickets_per_order integer DEFAULT 10,
    service_fee_percentage numeric(5,2) DEFAULT 2.50,
    facility_fee_amount numeric(10,2) DEFAULT 0.00,
    processing_fee_percentage numeric(5,2) DEFAULT 2.95,
    payment_methods jsonb DEFAULT '["credit_card", "crypto"]'::jsonb,
    accepted_currencies text[] DEFAULT ARRAY['USD'::text, 'SOL'::text],
    payout_frequency character varying(20) DEFAULT 'weekly'::character varying,
    minimum_payout_amount numeric(10,2) DEFAULT 100.00,
    email_notifications jsonb DEFAULT '{"payout": true, "review": true, "new_order": true, "cancellation": true}'::jsonb,
    webhook_url text,
    webhook_secret character varying(255),
    google_analytics_id character varying(50),
    facebook_pixel_id character varying(50),
    custom_tracking_code text,
    require_2fa boolean DEFAULT false,
    ip_whitelist inet[],
    api_rate_limit integer DEFAULT 1000,
    primary_color character varying(7),
    secondary_color character varying(7),
    custom_css text,
    custom_js text,
    check_in_method character varying(20) DEFAULT 'qr_code'::character varying,
    early_entry_minutes integer DEFAULT 30,
    late_entry_minutes integer DEFAULT 60,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_settings OWNER TO postgres;

--
-- Name: venue_staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_staff (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    department character varying(100),
    job_title character varying(100),
    employment_type character varying(20),
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    is_active boolean DEFAULT true,
    access_areas text[],
    shift_schedule jsonb,
    pin_code character varying(6),
    contact_email character varying(255),
    contact_phone character varying(20),
    emergency_contact jsonb,
    hourly_rate numeric(10,2),
    commission_percentage numeric(5,2),
    added_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_staff_role CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'assistant_manager'::character varying, 'box_office'::character varying, 'security'::character varying, 'maintenance'::character varying, 'marketing'::character varying, 'finance'::character varying, 'other'::character varying])::text[])))
);


ALTER TABLE public.venue_staff OWNER TO postgres;

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venues (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    venue_type character varying(50) DEFAULT 'general'::character varying NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    website text,
    address_line1 character varying(255) NOT NULL,
    address_line2 character varying(255),
    city character varying(100) NOT NULL,
    state_province character varying(100) NOT NULL,
    postal_code character varying(20),
    country_code character varying(2) NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    max_capacity integer NOT NULL,
    standing_capacity integer,
    seated_capacity integer,
    vip_capacity integer,
    logo_url text,
    cover_image_url text,
    image_gallery jsonb DEFAULT '[]'::jsonb,
    virtual_tour_url text,
    business_name character varying(200),
    business_registration character varying(100),
    tax_id character varying(50),
    business_type character varying(50),
    wallet_address character varying(44),
    collection_address character varying(44),
    royalty_percentage numeric(5,2) DEFAULT 2.50,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    verification_level character varying(20),
    features text[],
    amenities jsonb DEFAULT '{}'::jsonb,
    accessibility_features text[],
    age_restriction integer DEFAULT 0,
    dress_code text,
    prohibited_items text[],
    cancellation_policy text,
    refund_policy text,
    social_media jsonb DEFAULT '{}'::jsonb,
    average_rating numeric(3,2) DEFAULT 0.00,
    total_reviews integer DEFAULT 0,
    total_events integer DEFAULT 0,
    total_tickets_sold integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[],
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


ALTER TABLE public.venues OWNER TO postgres;

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: audit; Owner: postgres
--

ALTER TABLE ONLY audit.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: blockchain_transactions blockchain_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blockchain_transactions
    ADD CONSTRAINT blockchain_transactions_pkey PRIMARY KEY (id);


--
-- Name: dispute_resolution dispute_resolution_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_pkey PRIMARY KEY (id);


--
-- Name: escrow escrow_marketplace_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_marketplace_transaction_id_key UNIQUE (marketplace_transaction_id);


--
-- Name: escrow escrow_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_pkey PRIMARY KEY (id);


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
-- Name: event_categories event_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_slug_key UNIQUE (slug);


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
-- Name: financial_reports financial_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_reports
    ADD CONSTRAINT financial_reports_pkey PRIMARY KEY (id);


--
-- Name: fraud_prevention_rules fraud_prevention_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_prevention_rules
    ADD CONSTRAINT fraud_prevention_rules_pkey PRIMARY KEY (id);


--
-- Name: fraud_prevention_rules fraud_prevention_rules_rule_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fraud_prevention_rules
    ADD CONSTRAINT fraud_prevention_rules_rule_name_key UNIQUE (rule_name);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: market_analytics market_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.market_analytics
    ADD CONSTRAINT market_analytics_pkey PRIMARY KEY (id);


--
-- Name: marketplace_transactions marketplace_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_pkey PRIMARY KEY (id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: royalties royalties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalties
    ADD CONSTRAINT royalties_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: ticket_metadata ticket_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_metadata
    ADD CONSTRAINT ticket_metadata_pkey PRIMARY KEY (id);


--
-- Name: ticket_redemptions ticket_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_redemptions
    ADD CONSTRAINT ticket_redemptions_pkey PRIMARY KEY (id);


--
-- Name: ticket_refunds ticket_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_refunds
    ADD CONSTRAINT ticket_refunds_pkey PRIMARY KEY (id);


--
-- Name: ticket_transactions ticket_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_pkey PRIMARY KEY (id);


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
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: market_analytics unique_analytics; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.market_analytics
    ADD CONSTRAINT unique_analytics UNIQUE (analytics_type, scope_id, period, period_start);


--
-- Name: event_metadata unique_event_metadata; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT unique_event_metadata UNIQUE (event_id);


--
-- Name: event_capacity unique_event_section; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT unique_event_section UNIQUE (event_id, section_name, schedule_id);


--
-- Name: ticket_metadata unique_ticket_metadata; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_metadata
    ADD CONSTRAINT unique_ticket_metadata UNIQUE (ticket_id);


--
-- Name: ticket_types unique_ticket_type_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT unique_ticket_type_name UNIQUE (event_id, name);


--
-- Name: venue_integrations unique_venue_integration; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT unique_venue_integration UNIQUE (venue_id, integration_type);


--
-- Name: venue_settings unique_venue_settings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT unique_venue_settings UNIQUE (venue_id);


--
-- Name: venue_staff unique_venue_staff; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT unique_venue_staff UNIQUE (venue_id, user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: venue_compliance venue_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_pkey PRIMARY KEY (id);


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
-- Name: venue_settings venue_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_pkey PRIMARY KEY (id);


--
-- Name: venue_staff venue_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: venues venues_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_slug_key UNIQUE (slug);


--
-- Name: idx_audit_log_changed_at; Type: INDEX; Schema: audit; Owner: postgres
--

CREATE INDEX idx_audit_log_changed_at ON audit.audit_log USING btree (changed_at);


--
-- Name: idx_audit_log_table_name; Type: INDEX; Schema: audit; Owner: postgres
--

CREATE INDEX idx_audit_log_table_name ON audit.audit_log USING btree (table_name);


--
-- Name: idx_audit_log_user_id; Type: INDEX; Schema: audit; Owner: postgres
--

CREATE INDEX idx_audit_log_user_id ON audit.audit_log USING btree (user_id);


--
-- Name: idx_disputes_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_disputes_priority ON public.dispute_resolution USING btree (priority, created_at);


--
-- Name: idx_disputes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_disputes_status ON public.dispute_resolution USING btree (status);


--
-- Name: idx_escrow_auto_release; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_escrow_auto_release ON public.escrow USING btree (auto_release_at) WHERE ((status)::text = 'HELD'::text);


--
-- Name: idx_escrow_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_escrow_status ON public.escrow USING btree (status);


--
-- Name: idx_event_capacity_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_available ON public.event_capacity USING btree (available_capacity);


--
-- Name: idx_event_capacity_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_event_id ON public.event_capacity USING btree (event_id);


--
-- Name: idx_event_capacity_schedule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_capacity_schedule_id ON public.event_capacity USING btree (schedule_id);


--
-- Name: idx_event_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_active ON public.event_categories USING btree (is_active);


--
-- Name: idx_event_categories_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_parent ON public.event_categories USING btree (parent_id);


--
-- Name: idx_event_categories_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_slug ON public.event_categories USING btree (slug);


--
-- Name: idx_event_metadata_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_metadata_event_id ON public.event_metadata USING btree (event_id);


--
-- Name: idx_event_pricing_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_pricing_active ON public.event_pricing USING btree (is_active, sales_start_at, sales_end_at);


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
-- Name: idx_event_schedules_upcoming; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_schedules_upcoming ON public.event_schedules USING btree (starts_at);


--
-- Name: idx_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_created_at ON public.events USING btree (created_at);


--
-- Name: idx_events_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_deleted_at ON public.events USING btree (deleted_at);


--
-- Name: idx_events_featured; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_featured ON public.events USING btree (is_featured, priority_score);


--
-- Name: idx_events_primary_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_primary_category ON public.events USING btree (primary_category_id);


--
-- Name: idx_events_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_search ON public.events USING gin (to_tsvector('english'::regconfig, (((((COALESCE(name, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(short_description, ''::character varying))::text)));


--
-- Name: idx_events_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_slug ON public.events USING btree (slug);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_venue_id ON public.events USING btree (venue_id);


--
-- Name: idx_financial_reports_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financial_reports_period ON public.financial_reports USING btree (period_start, period_end);


--
-- Name: idx_financial_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financial_reports_status ON public.financial_reports USING btree (status);


--
-- Name: idx_financial_reports_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financial_reports_type ON public.financial_reports USING btree (report_type);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_number ON public.invoices USING btree (invoice_number);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_subscription_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_subscription_id ON public.invoices USING btree (subscription_id);


--
-- Name: idx_invoices_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_user_id ON public.invoices USING btree (user_id);


--
-- Name: idx_listings_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_listings_expires_at ON public.listings USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_listings_price; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_listings_price ON public.listings USING btree (price);


--
-- Name: idx_listings_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_listings_seller_id ON public.listings USING btree (seller_id);


--
-- Name: idx_listings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_listings_status ON public.listings USING btree (status) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: idx_listings_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_listings_ticket_id ON public.listings USING btree (ticket_id);


--
-- Name: idx_market_analytics_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_market_analytics_lookup ON public.market_analytics USING btree (analytics_type, scope_id, period, period_start);


--
-- Name: idx_marketplace_tx_buyer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_tx_buyer_id ON public.marketplace_transactions USING btree (buyer_id);


--
-- Name: idx_marketplace_tx_listing_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_tx_listing_id ON public.marketplace_transactions USING btree (listing_id);


--
-- Name: idx_marketplace_tx_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_tx_seller_id ON public.marketplace_transactions USING btree (seller_id);


--
-- Name: idx_marketplace_tx_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marketplace_tx_status ON public.marketplace_transactions USING btree (status);


--
-- Name: idx_offers_buyer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offers_buyer_id ON public.offers USING btree (buyer_id);


--
-- Name: idx_offers_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offers_expires_at ON public.offers USING btree (expires_at);


--
-- Name: idx_offers_listing_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offers_listing_id ON public.offers USING btree (listing_id);


--
-- Name: idx_offers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offers_status ON public.offers USING btree (status);


--
-- Name: idx_payment_methods_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_methods_active ON public.payment_methods USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_payment_methods_is_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_methods_is_default ON public.payment_methods USING btree (user_id, is_default) WHERE (is_default = true);


--
-- Name: idx_payment_methods_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_methods_type ON public.payment_methods USING btree (type);


--
-- Name: idx_payment_methods_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_methods_user_id ON public.payment_methods USING btree (user_id);


--
-- Name: idx_price_history_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_history_event_id ON public.price_history USING btree (event_id);


--
-- Name: idx_price_history_recorded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_history_recorded_at ON public.price_history USING btree (recorded_at);


--
-- Name: idx_price_history_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_history_ticket_id ON public.price_history USING btree (ticket_id);


--
-- Name: idx_refunds_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refunds_created_at ON public.refunds USING btree (created_at);


--
-- Name: idx_refunds_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refunds_status ON public.refunds USING btree (status);


--
-- Name: idx_refunds_transaction_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refunds_transaction_id ON public.refunds USING btree (transaction_id);


--
-- Name: idx_refunds_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refunds_user_id ON public.refunds USING btree (user_id);


--
-- Name: idx_royalties_batch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_royalties_batch_id ON public.royalties USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: idx_royalties_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_royalties_status ON public.royalties USING btree (status);


--
-- Name: idx_royalties_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_royalties_venue_id ON public.royalties USING btree (venue_id);


--
-- Name: idx_settlements_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_settlements_date ON public.settlements USING btree (settlement_date);


--
-- Name: idx_settlements_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_settlements_provider ON public.settlements USING btree (provider);


--
-- Name: idx_settlements_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_settlements_status ON public.settlements USING btree (status);


--
-- Name: idx_subscriptions_current_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subscriptions_current_period ON public.subscriptions USING btree (current_period_end);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_ticket_metadata_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_metadata_ticket_id ON public.ticket_metadata USING btree (ticket_id);


--
-- Name: idx_ticket_redemptions_event_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_redemptions_event_schedule ON public.ticket_redemptions USING btree (event_schedule_id);


--
-- Name: idx_ticket_redemptions_redeemed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_redemptions_redeemed_at ON public.ticket_redemptions USING btree (redeemed_at);


--
-- Name: idx_ticket_redemptions_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_redemptions_ticket_id ON public.ticket_redemptions USING btree (ticket_id);


--
-- Name: idx_ticket_refunds_requested_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_refunds_requested_by ON public.ticket_refunds USING btree (requested_by_user_id);


--
-- Name: idx_ticket_refunds_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_refunds_status ON public.ticket_refunds USING btree (status);


--
-- Name: idx_ticket_refunds_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_refunds_ticket_id ON public.ticket_refunds USING btree (ticket_id);


--
-- Name: idx_ticket_transactions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transactions_created_at ON public.ticket_transactions USING btree (created_at);


--
-- Name: idx_ticket_transactions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transactions_status ON public.ticket_transactions USING btree (status);


--
-- Name: idx_ticket_transactions_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transactions_ticket_id ON public.ticket_transactions USING btree (ticket_id);


--
-- Name: idx_ticket_transactions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transactions_type ON public.ticket_transactions USING btree (transaction_type);


--
-- Name: idx_ticket_transfers_from_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_from_user ON public.ticket_transfers USING btree (from_user_id);


--
-- Name: idx_ticket_transfers_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_pending ON public.ticket_transfers USING btree (status, expires_at) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_ticket_transfers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_status ON public.ticket_transfers USING btree (status);


--
-- Name: idx_ticket_transfers_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_ticket_id ON public.ticket_transfers USING btree (ticket_id);


--
-- Name: idx_ticket_transfers_to_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_transfers_to_user ON public.ticket_transfers USING btree (to_user_id);


--
-- Name: idx_ticket_types_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_active ON public.ticket_types USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_ticket_types_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_types_event_id ON public.ticket_types USING btree (event_id);


--
-- Name: idx_tickets_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_active ON public.tickets USING btree (status, is_valid) WHERE ((status = 'ACTIVE'::text) AND (is_valid = true));


--
-- Name: idx_tickets_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_event_id ON public.tickets USING btree (event_id);


--
-- Name: idx_tickets_mint_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_mint_address ON public.tickets USING btree (mint_address) WHERE (mint_address IS NOT NULL);


--
-- Name: idx_tickets_original_purchaser; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_original_purchaser ON public.tickets USING btree (original_purchaser_id);


--
-- Name: idx_tickets_owner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_owner_id ON public.tickets USING btree (owner_id);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_ticket_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_ticket_type_id ON public.tickets USING btree (ticket_type_id);


--
-- Name: idx_tickets_transferable; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_transferable ON public.tickets USING btree (is_transferable, transfer_locked_until) WHERE (is_transferable = true);


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at);


--
-- Name: idx_transactions_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_idempotency ON public.transactions USING btree (idempotency_key);


--
-- Name: idx_transactions_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_provider ON public.transactions USING btree (provider);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- Name: idx_transactions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);


--
-- Name: idx_users_country_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_country_code ON public.users USING btree (country_code) WHERE (country_code IS NOT NULL);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_display_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_display_name ON public.users USING btree (display_name) WHERE (display_name IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_email_verification_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email_verification_token ON public.users USING btree (email_verification_token) WHERE (email_verification_token IS NOT NULL);


--
-- Name: idx_users_metadata_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_metadata_gin ON public.users USING gin (metadata);


--
-- Name: idx_users_password_reset_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_password_reset_token ON public.users USING btree (password_reset_token) WHERE (password_reset_token IS NOT NULL);


--
-- Name: idx_users_permissions_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_permissions_gin ON public.users USING gin (permissions);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_users_preferences_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_preferences_gin ON public.users USING gin (preferences);


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code) WHERE (referral_code IS NOT NULL);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by) WHERE (referred_by IS NOT NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_role_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role_status ON public.users USING btree (role, status) WHERE (deleted_at IS NULL);


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

CREATE INDEX idx_users_username ON public.users USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: idx_venue_compliance_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_compliance_expiry ON public.venue_compliance USING btree (expiry_date);


--
-- Name: idx_venue_compliance_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_compliance_status ON public.venue_compliance USING btree (status);


--
-- Name: idx_venue_compliance_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_compliance_venue_id ON public.venue_compliance USING btree (venue_id);


--
-- Name: idx_venue_integrations_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_active ON public.venue_integrations USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_venue_integrations_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_type ON public.venue_integrations USING btree (integration_type);


--
-- Name: idx_venue_integrations_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_venue_id ON public.venue_integrations USING btree (venue_id);


--
-- Name: idx_venue_layouts_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_active ON public.venue_layouts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_venue_layouts_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_default ON public.venue_layouts USING btree (venue_id) WHERE (is_default = true);


--
-- Name: idx_venue_layouts_one_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_venue_layouts_one_default ON public.venue_layouts USING btree (venue_id) WHERE (is_default = true);


--
-- Name: idx_venue_layouts_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_venue_id ON public.venue_layouts USING btree (venue_id);


--
-- Name: idx_venue_settings_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_settings_venue_id ON public.venue_settings USING btree (venue_id);


--
-- Name: idx_venue_staff_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_active ON public.venue_staff USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_venue_staff_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_role ON public.venue_staff USING btree (role);


--
-- Name: idx_venue_staff_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_user_id ON public.venue_staff USING btree (user_id);


--
-- Name: idx_venue_staff_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_venue_id ON public.venue_staff USING btree (venue_id);


--
-- Name: idx_venues_city_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_city_country ON public.venues USING btree (city, country_code);


--
-- Name: idx_venues_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_created_by ON public.venues USING btree (created_by);


--
-- Name: idx_venues_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_deleted_at ON public.venues USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_venues_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_slug ON public.venues USING btree (slug);


--
-- Name: idx_venues_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_status ON public.venues USING btree (status);


--
-- Name: idx_venues_wallet_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_wallet_address ON public.venues USING btree (wallet_address) WHERE (wallet_address IS NOT NULL);


--
-- Name: uq_tickets_ticket_code_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_tickets_ticket_code_idx ON public.tickets USING btree (ticket_code) WHERE (ticket_code IS NOT NULL);


--
-- Name: marketplace_transactions trigger_calculate_royalties; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_calculate_royalties AFTER UPDATE ON public.marketplace_transactions FOR EACH ROW EXECUTE FUNCTION public.calculate_royalties();


--
-- Name: marketplace_transactions trigger_create_escrow; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_escrow AFTER INSERT ON public.marketplace_transactions FOR EACH ROW EXECUTE FUNCTION public.create_escrow_hold();


--
-- Name: events trigger_create_event_metadata; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_event_metadata AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.create_event_metadata();


--
-- Name: tickets trigger_create_ticket_metadata; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_ticket_metadata AFTER INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.create_ticket_metadata();


--
-- Name: venues trigger_create_venue_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_venue_settings AFTER INSERT ON public.venues FOR EACH ROW EXECUTE FUNCTION public.create_default_venue_settings();


--
-- Name: payment_methods trigger_ensure_one_default_payment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_ensure_one_default_payment BEFORE INSERT OR UPDATE OF is_default ON public.payment_methods FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_one_default_payment_method();


--
-- Name: events trigger_generate_event_slug; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_event_slug BEFORE INSERT OR UPDATE OF name ON public.events FOR EACH ROW EXECUTE FUNCTION public.generate_event_slug();


--
-- Name: invoices trigger_generate_invoice_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW WHEN ((new.invoice_number IS NULL)) EXECUTE FUNCTION public.generate_invoice_number();


--
-- Name: tickets trigger_generate_qr_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_qr_code BEFORE INSERT OR UPDATE OF ticket_code ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.generate_qr_code_data();


--
-- Name: users trigger_generate_referral_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.generate_user_referral_code();


--
-- Name: venues trigger_generate_venue_slug; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_venue_slug BEFORE INSERT OR UPDATE OF name ON public.venues FOR EACH ROW EXECUTE FUNCTION public.generate_venue_slug();


--
-- Name: users trigger_increment_referral_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_increment_referral_count AFTER UPDATE OF email_verified ON public.users FOR EACH ROW WHEN (((new.email_verified = true) AND (old.email_verified = false))) EXECUTE FUNCTION public.increment_referral_count();


--
-- Name: listings trigger_track_listing_price; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_track_listing_price AFTER INSERT OR UPDATE OF price ON public.listings FOR EACH ROW EXECUTE FUNCTION public.track_price_history();


--
-- Name: event_capacity trigger_update_available_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_available_capacity BEFORE INSERT OR UPDATE OF sold_count, pending_count, reserved_capacity, total_capacity ON public.event_capacity FOR EACH ROW EXECUTE FUNCTION public.update_available_capacity();


--
-- Name: events trigger_update_category_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_category_count AFTER INSERT OR DELETE OR UPDATE OF primary_category_id ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_category_event_count();


--
-- Name: dispute_resolution trigger_update_disputes_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_disputes_timestamp BEFORE UPDATE ON public.dispute_resolution FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: escrow trigger_update_escrow_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_escrow_timestamp BEFORE UPDATE ON public.escrow FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


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
-- Name: financial_reports trigger_update_financial_reports_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_financial_reports_timestamp BEFORE UPDATE ON public.financial_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fraud_prevention_rules trigger_update_fraud_rules_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_fraud_rules_timestamp BEFORE UPDATE ON public.fraud_prevention_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoices trigger_update_invoices_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_invoices_timestamp BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: listings trigger_update_listings_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_listings_timestamp BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: marketplace_transactions trigger_update_marketplace_tx_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_marketplace_tx_timestamp BEFORE UPDATE ON public.marketplace_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: offers trigger_update_offers_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_offers_timestamp BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_methods trigger_update_payment_methods_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_payment_methods_timestamp BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: refunds trigger_update_refunds_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_refunds_timestamp BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: royalties trigger_update_royalties_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_royalties_timestamp BEFORE UPDATE ON public.royalties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: settlements trigger_update_settlements_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_settlements_timestamp BEFORE UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions trigger_update_subscription_on_payment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_subscription_on_payment AFTER UPDATE OF status ON public.transactions FOR EACH ROW WHEN ((((new.status)::text = 'succeeded'::text) AND ((old.status)::text <> 'succeeded'::text))) EXECUTE FUNCTION public.update_subscription_on_payment();


--
-- Name: subscriptions trigger_update_subscriptions_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_subscriptions_timestamp BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ticket_metadata trigger_update_ticket_metadata_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_metadata_timestamp BEFORE UPDATE ON public.ticket_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ticket_redemptions trigger_update_ticket_on_redemption; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_on_redemption AFTER INSERT ON public.ticket_redemptions FOR EACH ROW EXECUTE FUNCTION public.update_ticket_on_redemption();


--
-- Name: ticket_refunds trigger_update_ticket_refunds_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_refunds_timestamp BEFORE UPDATE ON public.ticket_refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets trigger_update_ticket_supply; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_supply AFTER INSERT OR DELETE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_ticket_type_supply();


--
-- Name: ticket_transfers trigger_update_ticket_transfers_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_transfers_timestamp BEFORE UPDATE ON public.ticket_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ticket_types trigger_update_ticket_types_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_ticket_types_timestamp BEFORE UPDATE ON public.ticket_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets trigger_update_tickets_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_tickets_timestamp BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions trigger_update_transactions_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_transactions_timestamp BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users trigger_update_users_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: venue_compliance trigger_update_venue_compliance_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_venue_compliance_timestamp BEFORE UPDATE ON public.venue_compliance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


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
-- Name: dispute_resolution dispute_resolution_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow(id);


--
-- Name: dispute_resolution dispute_resolution_initiator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_initiator_id_fkey FOREIGN KEY (initiator_id) REFERENCES public.users(id);


--
-- Name: dispute_resolution dispute_resolution_marketplace_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_marketplace_transaction_id_fkey FOREIGN KEY (marketplace_transaction_id) REFERENCES public.marketplace_transactions(id);


--
-- Name: dispute_resolution dispute_resolution_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: dispute_resolution dispute_resolution_respondent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispute_resolution
    ADD CONSTRAINT dispute_resolution_respondent_id_fkey FOREIGN KEY (respondent_id) REFERENCES public.users(id);


--
-- Name: escrow escrow_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: escrow escrow_marketplace_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_marketplace_transaction_id_fkey FOREIGN KEY (marketplace_transaction_id) REFERENCES public.marketplace_transactions(id);


--
-- Name: escrow escrow_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: escrow escrow_release_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_release_transaction_id_fkey FOREIGN KEY (release_transaction_id) REFERENCES public.transactions(id);


--
-- Name: escrow escrow_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escrow
    ADD CONSTRAINT escrow_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id);


--
-- Name: event_capacity event_capacity_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_capacity event_capacity_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.event_categories(id) ON DELETE CASCADE;


--
-- Name: event_metadata event_metadata_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT event_metadata_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_capacity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_capacity_id_fkey FOREIGN KEY (capacity_id) REFERENCES public.event_capacity(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE CASCADE;


--
-- Name: event_schedules event_schedules_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_schedules
    ADD CONSTRAINT event_schedules_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: events events_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: events events_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: events events_venue_layout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_layout_id_fkey FOREIGN KEY (venue_layout_id) REFERENCES public.venue_layouts(id);


--
-- Name: events fk_primary_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT fk_primary_category FOREIGN KEY (primary_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;


--
-- Name: tickets fk_tickets_original_purchaser; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);


--
-- Name: invoices invoices_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: invoices invoices_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: invoices invoices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: listings listings_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id);


--
-- Name: listings listings_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: marketplace_transactions marketplace_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: marketplace_transactions marketplace_transactions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: marketplace_transactions marketplace_transactions_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id);


--
-- Name: marketplace_transactions marketplace_transactions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id);


--
-- Name: marketplace_transactions marketplace_transactions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_transactions
    ADD CONSTRAINT marketplace_transactions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: offers offers_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: offers offers_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: offers offers_previous_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_previous_offer_id_fkey FOREIGN KEY (previous_offer_id) REFERENCES public.offers(id);


--
-- Name: payment_methods payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: price_history price_history_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: price_history price_history_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: price_history price_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: refunds refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: refunds refunds_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: refunds refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: royalties royalties_marketplace_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalties
    ADD CONSTRAINT royalties_marketplace_transaction_id_fkey FOREIGN KEY (marketplace_transaction_id) REFERENCES public.marketplace_transactions(id);


--
-- Name: royalties royalties_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalties
    ADD CONSTRAINT royalties_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: royalties royalties_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalties
    ADD CONSTRAINT royalties_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: royalties royalties_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.royalties
    ADD CONSTRAINT royalties_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: settlements settlements_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.payment_methods(id);


--
-- Name: subscriptions subscriptions_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ticket_metadata ticket_metadata_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_metadata
    ADD CONSTRAINT ticket_metadata_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_redemptions ticket_redemptions_event_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_redemptions
    ADD CONSTRAINT ticket_redemptions_event_schedule_id_fkey FOREIGN KEY (event_schedule_id) REFERENCES public.event_schedules(id);


--
-- Name: ticket_redemptions ticket_redemptions_redeemed_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_redemptions
    ADD CONSTRAINT ticket_redemptions_redeemed_by_staff_id_fkey FOREIGN KEY (redeemed_by_staff_id) REFERENCES public.users(id);


--
-- Name: ticket_redemptions ticket_redemptions_redeemed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_redemptions
    ADD CONSTRAINT ticket_redemptions_redeemed_by_user_id_fkey FOREIGN KEY (redeemed_by_user_id) REFERENCES public.users(id);


--
-- Name: ticket_redemptions ticket_redemptions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_redemptions
    ADD CONSTRAINT ticket_redemptions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_refunds ticket_refunds_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_refunds
    ADD CONSTRAINT ticket_refunds_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id);


--
-- Name: ticket_refunds ticket_refunds_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_refunds
    ADD CONSTRAINT ticket_refunds_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id);


--
-- Name: ticket_refunds ticket_refunds_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_refunds
    ADD CONSTRAINT ticket_refunds_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_refunds ticket_refunds_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_refunds
    ADD CONSTRAINT ticket_refunds_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.ticket_transactions(id);


--
-- Name: ticket_transactions ticket_transactions_blockchain_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_blockchain_transaction_id_fkey FOREIGN KEY (blockchain_transaction_id) REFERENCES public.blockchain_transactions(id);


--
-- Name: ticket_transactions ticket_transactions_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);


--
-- Name: ticket_transactions ticket_transactions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_transactions ticket_transactions_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transactions
    ADD CONSTRAINT ticket_transactions_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id);


--
-- Name: ticket_transfers ticket_transfers_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);


--
-- Name: ticket_transfers ticket_transfers_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_transfers ticket_transfers_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id);


--
-- Name: ticket_transfers ticket_transfers_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.ticket_transactions(id);


--
-- Name: ticket_types ticket_types_capacity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_capacity_id_fkey FOREIGN KEY (capacity_id) REFERENCES public.event_capacity(id) ON DELETE SET NULL;


--
-- Name: ticket_types ticket_types_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ticket_types ticket_types_pricing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.event_pricing(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: venue_compliance venue_compliance_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance venue_compliance_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: venue_integrations venue_integrations_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_layouts venue_layouts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: venue_layouts venue_layouts_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_settings venue_settings_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_staff venue_staff_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: venue_staff venue_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: venue_staff venue_staff_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venues venues_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: venues venues_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: event_categories categories_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY categories_select_all ON public.event_categories FOR SELECT USING ((is_active = true));


--
-- Name: dispute_resolution; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dispute_resolution ENABLE ROW LEVEL SECURITY;

--
-- Name: escrow; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.escrow ENABLE ROW LEVEL SECURITY;

--
-- Name: event_capacity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_capacity ENABLE ROW LEVEL SECURITY;

--
-- Name: event_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_metadata; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: event_pricing; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: event_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_prevention_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fraud_prevention_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: market_analytics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.market_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.marketplace_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: offers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: price_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: royalties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;

--
-- Name: settlements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_metadata; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_redemptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_refunds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_transfers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_compliance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venue_compliance ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_integrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venue_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_layouts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venue_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_staff; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venue_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: venues venues_select_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY venues_select_public ON public.venues FOR SELECT USING (((deleted_at IS NULL) AND ((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'VERIFIED'::character varying])::text[]))));


--
-- Name: SCHEMA analytics; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA analytics TO tickettoken_app;


--
-- Name: SCHEMA audit; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA audit TO tickettoken_app;


--
-- Name: SCHEMA blockchain; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA blockchain TO tickettoken_app;


--
-- Name: SCHEMA cache; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA cache TO tickettoken_app;


--
-- Name: SCHEMA compliance; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA compliance TO tickettoken_app;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO tickettoken_app;


--
-- Name: TABLE dispute_resolution; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.dispute_resolution TO tickettoken_app;


--
-- Name: TABLE escrow; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,UPDATE ON TABLE public.escrow TO tickettoken_app;


--
-- Name: TABLE event_capacity; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.event_capacity TO tickettoken_app;


--
-- Name: TABLE event_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.event_categories TO tickettoken_app;


--
-- Name: TABLE event_metadata; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.event_metadata TO tickettoken_app;


--
-- Name: TABLE event_pricing; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.event_pricing TO tickettoken_app;


--
-- Name: TABLE event_schedules; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.event_schedules TO tickettoken_app;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.events TO tickettoken_app;


--
-- Name: TABLE financial_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.financial_reports TO tickettoken_app;


--
-- Name: TABLE fraud_prevention_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.fraud_prevention_rules TO tickettoken_app;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.invoices TO tickettoken_app;


--
-- Name: TABLE listings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.listings TO tickettoken_app;


--
-- Name: TABLE market_analytics; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.market_analytics TO tickettoken_app;


--
-- Name: TABLE marketplace_transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.marketplace_transactions TO tickettoken_app;


--
-- Name: TABLE offers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.offers TO tickettoken_app;


--
-- Name: TABLE payment_methods; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.payment_methods TO tickettoken_app;


--
-- Name: TABLE price_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE public.price_history TO tickettoken_app;


--
-- Name: TABLE refunds; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.refunds TO tickettoken_app;


--
-- Name: TABLE royalties; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.royalties TO tickettoken_app;


--
-- Name: TABLE settlements; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.settlements TO tickettoken_app;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.subscriptions TO tickettoken_app;


--
-- Name: TABLE ticket_metadata; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ticket_metadata TO tickettoken_app;


--
-- Name: TABLE ticket_redemptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE public.ticket_redemptions TO tickettoken_app;


--
-- Name: TABLE ticket_refunds; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ticket_refunds TO tickettoken_app;


--
-- Name: TABLE ticket_transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ticket_transactions TO tickettoken_app;


--
-- Name: TABLE ticket_transfers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ticket_transfers TO tickettoken_app;


--
-- Name: TABLE ticket_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ticket_types TO tickettoken_app;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tickets TO tickettoken_app;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.transactions TO tickettoken_app;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.users TO tickettoken_app;


--
-- Name: TABLE venue_compliance; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.venue_compliance TO tickettoken_app;


--
-- Name: TABLE venue_integrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.venue_integrations TO tickettoken_app;


--
-- Name: TABLE venue_layouts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.venue_layouts TO tickettoken_app;


--
-- Name: TABLE venue_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.venue_settings TO tickettoken_app;


--
-- Name: TABLE venue_staff; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.venue_staff TO tickettoken_app;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.venues TO tickettoken_app;


--
-- PostgreSQL database dump complete
--

\unrestrict PLxv5U5jQYiC5lfHciB6RkNbtenR842NXVbDFAS3czdpFOeQXincrQPSGLKLgQE

