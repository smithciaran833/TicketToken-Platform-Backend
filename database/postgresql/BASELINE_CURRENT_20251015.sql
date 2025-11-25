--
-- PostgreSQL database dump
--

\restrict M9iCaY5PMzfDrZn41JRxNiqn5e0jhzfST5YBtjNAmrtdsLeLCnYXFSOIdIqNKzm

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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
-- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'SUSPENDED',
    'DELETED'
);


ALTER TYPE public.user_status OWNER TO postgres;

--
-- Name: create_default_venue_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_default_venue_settings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO venue_settings (venue_id) VALUES (NEW.id) ON CONFLICT (venue_id) DO NOTHING;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.create_default_venue_settings() OWNER TO postgres;

--
-- Name: create_event_metadata(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_event_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO event_metadata (event_id, tenant_id) VALUES (NEW.id, NEW.tenant_id) ON CONFLICT (event_id) DO NOTHING;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.create_event_metadata() OWNER TO postgres;

--
-- Name: generate_event_slug(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_event_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.slug := (SELECT slug FROM venues WHERE id = NEW.venue_id) || '-' || NEW.slug;
        WHILE EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug AND id != NEW.id) LOOP
          NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.generate_event_slug() OWNER TO postgres;

--
-- Name: generate_user_referral_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_user_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(md5(random()::text), 1, 8));
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
        WHILE EXISTS (SELECT 1 FROM venues WHERE slug = NEW.slug AND id != NEW.id) LOOP
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
  IF NEW.referred_by IS NOT NULL THEN
    UPDATE users SET referral_count = referral_count + 1 WHERE id = NEW.referred_by;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.increment_referral_count() OWNER TO postgres;

--
-- Name: update_available_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_available_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.available_capacity := NEW.total_capacity - NEW.sold_count - NEW.pending_count - NEW.reserved_capacity;
      IF NEW.available_capacity < 0 THEN NEW.available_capacity := 0; END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.update_available_capacity() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO postgres;

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
-- Name: event_capacity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_capacity (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
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
    row_config jsonb,
    seat_map jsonb,
    is_active boolean DEFAULT true,
    is_visible boolean DEFAULT true,
    minimum_purchase integer DEFAULT 1,
    maximum_purchase integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    locked_price_data jsonb
);


ALTER TABLE public.event_capacity OWNER TO postgres;

--
-- Name: COLUMN event_capacity.locked_price_data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.event_capacity.locked_price_data IS 'Stores locked pricing at reservation time: {pricing_id, locked_price, locked_at, fees}';


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
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_pricing OWNER TO postgres;

--
-- Name: event_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_schedules (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_schedules OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
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
    deleted_at timestamp with time zone
);


ALTER TABLE public.events OWNER TO postgres;

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
    permissions jsonb DEFAULT '[]'::jsonb,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    CONSTRAINT check_age_minimum CHECK (((date_of_birth IS NULL) OR (date_of_birth <= (CURRENT_DATE - '13 years'::interval)))),
    CONSTRAINT check_email_lowercase CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT check_referral_not_self CHECK (((referred_by IS NULL) OR (referred_by <> id))),
    CONSTRAINT check_username_format CHECK (((username)::text ~ '^[a-zA-Z0-9_]{3,30}$'::text)),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'DELETED'::text])))
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_compliance OWNER TO postgres;

--
-- Name: venue_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_documents (
    id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    venue_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    document_type character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    submitted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venue_documents OWNER TO postgres;

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
    service_fee_percentage numeric(5,2) DEFAULT 2.5,
    facility_fee_amount numeric(10,2) DEFAULT '0'::numeric,
    processing_fee_percentage numeric(5,2) DEFAULT 2.95,
    payment_methods jsonb DEFAULT '["credit_card", "crypto"]'::jsonb,
    accepted_currencies text[] DEFAULT ARRAY['USD'::text, 'SOL'::text],
    payout_frequency character varying(20) DEFAULT 'weekly'::character varying,
    minimum_payout_amount numeric(10,2) DEFAULT '100'::numeric,
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
    start_date date DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    royalty_percentage numeric(5,2) DEFAULT 2.5,
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
    average_rating numeric(3,2) DEFAULT '0'::numeric,
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
-- Name: knex_migrations_auth id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_auth_id_seq'::regclass);


--
-- Name: knex_migrations_auth_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_auth_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_auth_lock_index_seq'::regclass);


--
-- Name: knex_migrations_event id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_event_id_seq'::regclass);


--
-- Name: knex_migrations_event_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_event_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_event_lock_index_seq'::regclass);


--
-- Name: knex_migrations_venue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_venue_id_seq'::regclass);


--
-- Name: knex_migrations_venue_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_venue_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_venue_lock_index_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: biometric_credentials biometric_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_pkey PRIMARY KEY (id);


--
-- Name: event_capacity event_capacity_event_id_section_name_schedule_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_event_id_section_name_schedule_id_unique UNIQUE (event_id, section_name, schedule_id);


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
-- Name: biometric_credentials idx_biometric_credentials_device; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT idx_biometric_credentials_device UNIQUE (user_id, device_id);


--
-- Name: oauth_connections idx_oauth_connections_provider; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT idx_oauth_connections_provider UNIQUE (provider, provider_user_id);


--
-- Name: trusted_devices idx_trusted_devices_fingerprint; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT idx_trusted_devices_fingerprint UNIQUE (user_id, device_fingerprint);


--
-- Name: wallet_connections idx_wallet_connections_address; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT idx_wallet_connections_address UNIQUE (wallet_address, network);


--
-- Name: invalidated_tokens invalidated_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_pkey PRIMARY KEY (token);


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
-- Name: oauth_connections oauth_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);


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
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);


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
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


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
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: users users_referral_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: venue_compliance venue_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_pkey PRIMARY KEY (id);


--
-- Name: venue_documents venue_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_documents
    ADD CONSTRAINT venue_documents_pkey PRIMARY KEY (id);


--
-- Name: venue_integrations venue_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_pkey PRIMARY KEY (id);


--
-- Name: venue_integrations venue_integrations_venue_id_integration_type_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_venue_id_integration_type_unique UNIQUE (venue_id, integration_type);


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
-- Name: venue_staff venue_staff_venue_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_venue_id_user_id_unique UNIQUE (venue_id, user_id);


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
-- Name: wallet_connections wallet_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_pkey PRIMARY KEY (id);


--
-- Name: event_capacity_available_capacity_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_capacity_available_capacity_index ON public.event_capacity USING btree (available_capacity);


--
-- Name: event_capacity_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_capacity_event_id_index ON public.event_capacity USING btree (event_id);


--
-- Name: event_capacity_reserved_expires_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_capacity_reserved_expires_at_index ON public.event_capacity USING btree (reserved_expires_at);


--
-- Name: event_capacity_schedule_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_capacity_schedule_id_index ON public.event_capacity USING btree (schedule_id);


--
-- Name: event_capacity_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_capacity_tenant_id_index ON public.event_capacity USING btree (tenant_id);


--
-- Name: event_categories_is_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_categories_is_active_index ON public.event_categories USING btree (is_active);


--
-- Name: event_categories_parent_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_categories_parent_id_index ON public.event_categories USING btree (parent_id);


--
-- Name: event_categories_slug_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_categories_slug_index ON public.event_categories USING btree (slug);


--
-- Name: event_metadata_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_metadata_event_id_index ON public.event_metadata USING btree (event_id);


--
-- Name: event_metadata_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_metadata_tenant_id_index ON public.event_metadata USING btree (tenant_id);


--
-- Name: event_pricing_capacity_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_pricing_capacity_id_index ON public.event_pricing USING btree (capacity_id);


--
-- Name: event_pricing_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_pricing_event_id_index ON public.event_pricing USING btree (event_id);


--
-- Name: event_pricing_is_active_sales_start_at_sales_end_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_pricing_is_active_sales_start_at_sales_end_at_index ON public.event_pricing USING btree (is_active, sales_start_at, sales_end_at);


--
-- Name: event_pricing_schedule_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_pricing_schedule_id_index ON public.event_pricing USING btree (schedule_id);


--
-- Name: event_pricing_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_pricing_tenant_id_index ON public.event_pricing USING btree (tenant_id);


--
-- Name: event_schedules_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_schedules_event_id_index ON public.event_schedules USING btree (event_id);


--
-- Name: event_schedules_starts_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_schedules_starts_at_index ON public.event_schedules USING btree (starts_at);


--
-- Name: event_schedules_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_schedules_status_index ON public.event_schedules USING btree (status);


--
-- Name: event_schedules_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_schedules_tenant_id_index ON public.event_schedules USING btree (tenant_id);


--
-- Name: event_schedules_tenant_id_starts_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_schedules_tenant_id_starts_at_index ON public.event_schedules USING btree (tenant_id, starts_at);


--
-- Name: events_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_created_at_index ON public.events USING btree (created_at);


--
-- Name: events_deleted_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_deleted_at_index ON public.events USING btree (deleted_at);


--
-- Name: events_is_featured_priority_score_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_is_featured_priority_score_index ON public.events USING btree (is_featured, priority_score);


--
-- Name: events_primary_category_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_primary_category_id_index ON public.events USING btree (primary_category_id);


--
-- Name: events_slug_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_slug_index ON public.events USING btree (slug);


--
-- Name: events_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_status_index ON public.events USING btree (status);


--
-- Name: events_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_tenant_id_index ON public.events USING btree (tenant_id);


--
-- Name: events_tenant_id_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_tenant_id_status_index ON public.events USING btree (tenant_id, status);


--
-- Name: events_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_venue_id_index ON public.events USING btree (venue_id);


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
-- Name: idx_audit_logs_resource_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_resource_type ON public.audit_logs USING btree (resource_type);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_biometric_credentials_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_biometric_credentials_user_id ON public.biometric_credentials USING btree (user_id);


--
-- Name: idx_invalidated_tokens_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invalidated_tokens_expires_at ON public.invalidated_tokens USING btree (expires_at);


--
-- Name: idx_invalidated_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invalidated_tokens_user_id ON public.invalidated_tokens USING btree (user_id);


--
-- Name: idx_oauth_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oauth_connections_user_id ON public.oauth_connections USING btree (user_id);


--
-- Name: idx_trusted_devices_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices USING btree (user_id);


--
-- Name: idx_user_sessions_ended_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_user_venue_roles_composite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_venue_roles_composite ON public.user_venue_roles USING btree (user_id, venue_id);


--
-- Name: idx_user_venue_roles_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_venue_roles_user_id ON public.user_venue_roles USING btree (user_id);


--
-- Name: idx_user_venue_roles_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_venue_roles_venue_id ON public.user_venue_roles USING btree (venue_id);


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
-- Name: idx_wallet_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_connections_user_id ON public.wallet_connections USING btree (user_id);


--
-- Name: venue_compliance_expiry_date_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_expiry_date_index ON public.venue_compliance USING btree (expiry_date);


--
-- Name: venue_compliance_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_status_index ON public.venue_compliance USING btree (status);


--
-- Name: venue_compliance_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_compliance_venue_id_index ON public.venue_compliance USING btree (venue_id);


--
-- Name: venue_documents_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_documents_venue_id_index ON public.venue_documents USING btree (venue_id);


--
-- Name: venue_integrations_integration_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_integrations_integration_type_index ON public.venue_integrations USING btree (integration_type);


--
-- Name: venue_integrations_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_integrations_venue_id_index ON public.venue_integrations USING btree (venue_id);


--
-- Name: venue_layouts_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_layouts_venue_id_index ON public.venue_layouts USING btree (venue_id);


--
-- Name: venue_settings_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_settings_venue_id_index ON public.venue_settings USING btree (venue_id);


--
-- Name: venue_staff_role_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_staff_role_index ON public.venue_staff USING btree (role);


--
-- Name: venue_staff_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_staff_user_id_index ON public.venue_staff USING btree (user_id);


--
-- Name: venue_staff_venue_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venue_staff_venue_id_index ON public.venue_staff USING btree (venue_id);


--
-- Name: venues_city_country_code_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venues_city_country_code_index ON public.venues USING btree (city, country_code);


--
-- Name: venues_created_by_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venues_created_by_index ON public.venues USING btree (created_by);


--
-- Name: venues_deleted_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venues_deleted_at_index ON public.venues USING btree (deleted_at);


--
-- Name: venues_slug_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venues_slug_index ON public.venues USING btree (slug);


--
-- Name: venues_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX venues_status_index ON public.venues USING btree (status);


--
-- Name: events trigger_create_event_metadata; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_event_metadata AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.create_event_metadata();


--
-- Name: venues trigger_create_venue_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_venue_settings AFTER INSERT ON public.venues FOR EACH ROW EXECUTE FUNCTION public.create_default_venue_settings();


--
-- Name: events trigger_generate_event_slug; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_event_slug BEFORE INSERT OR UPDATE OF name ON public.events FOR EACH ROW EXECUTE FUNCTION public.generate_event_slug();


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
-- Name: event_capacity trigger_update_available_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_available_capacity BEFORE INSERT OR UPDATE OF sold_count, pending_count, reserved_capacity, total_capacity ON public.event_capacity FOR EACH ROW EXECUTE FUNCTION public.update_available_capacity();


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
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: biometric_credentials biometric_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: biometric_credentials biometric_credentials_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_capacity event_capacity_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_capacity event_capacity_schedule_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_capacity
    ADD CONSTRAINT event_capacity_schedule_id_foreign FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.event_categories(id) ON DELETE CASCADE;


--
-- Name: event_metadata event_metadata_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_metadata
    ADD CONSTRAINT event_metadata_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_capacity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_capacity_id_foreign FOREIGN KEY (capacity_id) REFERENCES public.event_capacity(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_pricing event_pricing_schedule_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_pricing
    ADD CONSTRAINT event_pricing_schedule_id_foreign FOREIGN KEY (schedule_id) REFERENCES public.event_schedules(id) ON DELETE CASCADE;


--
-- Name: event_schedules event_schedules_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_schedules
    ADD CONSTRAINT event_schedules_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: events events_primary_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_primary_category_id_foreign FOREIGN KEY (primary_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;


--
-- Name: events events_updated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: events events_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: events events_venue_layout_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_layout_id_foreign FOREIGN KEY (venue_layout_id) REFERENCES public.venue_layouts(id);


--
-- Name: invalidated_tokens invalidated_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invalidated_tokens invalidated_tokens_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trusted_devices trusted_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trusted_devices trusted_devices_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_granted_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_granted_by_foreign FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: users users_referred_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_foreign FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: venue_compliance venue_compliance_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance venue_compliance_verified_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_verified_by_foreign FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: venue_documents venue_documents_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_documents
    ADD CONSTRAINT venue_documents_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_integrations venue_integrations_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_layouts venue_layouts_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


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
-- Name: venue_staff venue_staff_added_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_added_by_foreign FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: venue_staff venue_staff_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: venue_staff venue_staff_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_staff
    ADD CONSTRAINT venue_staff_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venues venues_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: venues venues_updated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: wallet_connections wallet_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallet_connections wallet_connections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict M9iCaY5PMzfDrZn41JRxNiqn5e0jhzfST5YBtjNAmrtdsLeLCnYXFSOIdIqNKzm

