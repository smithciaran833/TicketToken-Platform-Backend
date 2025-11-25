--
-- PostgreSQL database dump
--

\restrict SL10RdmNdFLgJUPDapMtIFDaIzc2bkiTVdUOrtDI9EVpD0EWmoXtcf5zv5xo56B

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
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at) FROM stdin;
7dac5649-3455-43f3-8d61-e6be4574a132	efbcc07e-a950-11f0-965b-0242ac130003	email_verified	\N	\N	{}	\N	\N	2025-10-14 22:55:53.929+00
\.


--
-- Data for Name: biometric_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_credentials (id, user_id, device_id, public_key, credential_type, created_at) FROM stdin;
\.


--
-- Data for Name: event_capacity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_capacity (id, tenant_id, event_id, schedule_id, section_name, section_code, tier, total_capacity, available_capacity, reserved_capacity, buffer_capacity, sold_count, pending_count, reserved_at, reserved_expires_at, row_config, seat_map, is_active, is_visible, minimum_purchase, maximum_purchase, created_at, updated_at, locked_price_data) FROM stdin;
178c1d38-a47f-11f0-a0d2-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	VIP Section	VIP	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 19:43:41.131781+00	2025-10-08 19:43:41.131781+00	\N
4fcd87cc-a47f-11f0-b89f-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	VIP Section	VIP	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 19:45:15.513173+00	2025-10-08 19:55:43.810074+00	\N
41a58bd4-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	41952da2-a481-11f0-a8b2-0242ac130002	\N	Test Section	TEST	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 19:59:10.758694+00	2025-10-08 20:00:34.217613+00	\N
80131d14-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	800892c2-a481-11f0-a8b2-0242ac130002	\N	Test Section	TEST	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:00:55.495524+00	2025-10-08 20:02:07.530497+00	\N
aea5bbb4-a481-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	ae971a78-a481-11f0-a5d5-0242ac130002	\N	Test Section	TEST	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:02:13.631606+00	2025-10-08 20:04:04.180054+00	\N
1a084516-a482-11f0-9e85-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	\N	Boundary Test	BOUND	\N	10	10	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:05:13.791953+00	2025-10-08 20:05:13.791953+00	\N
19e34798-a482-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	\N	Test Section	TEST	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:05:13.551103+00	2025-10-08 20:06:57.280464+00	\N
1a10b8f4-a482-11f0-9e85-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	\N	Multi Reserve Test	MULTI	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:05:13.848964+00	2025-10-08 20:06:57.283863+00	\N
355c986e-a485-11f0-b8aa-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	Valid Section	VALID	\N	1000	1000	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:27:28.133247+00	2025-10-08 20:27:28.133247+00	\N
0a184724-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	\N	Boundary Test	BOUND	\N	10	10	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:25.040707+00	2025-10-08 20:33:25.040707+00	\N
0a40d78e-a486-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	0a31a11a-a486-11f0-b7d0-0242ac130002	\N	Test Section	TEST	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:25.307741+00	2025-10-08 20:34:48.329956+00	\N
09f27d3c-a486-11f0-b7d1-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	\N	Test Section	TEST	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:24.794195+00	2025-10-08 20:34:48.331611+00	\N
0a23db3e-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	\N	Multi Reserve Test	MULTI	\N	100	100	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:25.117757+00	2025-10-08 20:34:48.333088+00	\N
1a0dbeb0-a482-11f0-9e85-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	\N	Reservation Test	RES	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:05:13.829465+00	2025-10-08 20:35:45.272111+00	\N
a2c81112-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	Test Price Lock Section	PRICE	\N	500	500	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:30:31.709405+00	2025-10-08 20:46:14.316155+00	\N
df3c8380-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	df32b454-a485-11f0-b7d0-0242ac130002	\N	Valid Section	VALID	\N	1000	1000	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:32:13.137364+00	2025-10-08 20:48:08.099433+00	\N
0ac2ce56-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	0abbcba6-a486-11f0-bb37-0242ac130002	\N	Valid Section	VALID	\N	1000	1000	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:26.159364+00	2025-10-08 20:49:06.533806+00	\N
0a1f85c0-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	\N	Reservation Test	RES	\N	50	50	0	0	0	0	\N	\N	\N	\N	t	t	1	\N	2025-10-08 20:33:25.089382+00	2025-10-08 21:04:20.715078+00	\N
\.


--
-- Data for Name: event_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_categories (id, parent_id, name, slug, description, icon, color, display_order, is_active, is_featured, meta_title, meta_description, event_count, created_at, updated_at) FROM stdin;
308a6dac-a47b-11f0-a320-0242ac130002	\N	Music	music	Concerts, festivals, and musical performances	music	#FF6B6B	1	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a8a76-a47b-11f0-a320-0242ac130002	\N	Sports	sports	Sporting events and competitions	sports	#4ECDC4	2	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a8c88-a47b-11f0-a320-0242ac130002	\N	Theater	theater	Plays, musicals, and theatrical performances	theater	#45B7D1	3	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a8dd2-a47b-11f0-a320-0242ac130002	\N	Comedy	comedy	Stand-up comedy and humor shows	comedy	#F7DC6F	4	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a9066-a47b-11f0-a320-0242ac130002	\N	Arts	arts	Art exhibitions, galleries, and cultural events	arts	#BB8FCE	5	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a9228-a47b-11f0-a320-0242ac130002	\N	Conference	conference	Business conferences and professional events	conference	#85C1E2	6	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a9372-a47b-11f0-a320-0242ac130002	\N	Workshop	workshop	Educational workshops and training sessions	workshop	#73C6B6	7	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a94a8-a47b-11f0-a320-0242ac130002	\N	Festival	festival	Multi-day festivals and celebrations	festival	#F8B739	8	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a95e8-a47b-11f0-a320-0242ac130002	\N	Family	family	Family-friendly events and activities	family	#82E0AA	9	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
308a9728-a47b-11f0-a320-0242ac130002	\N	Nightlife	nightlife	Clubs, parties, and late-night events	nightlife	#D68910	10	t	f	\N	\N	0	2025-10-08 19:15:44.792487+00	2025-10-08 19:15:44.792487+00
\.


--
-- Data for Name: event_metadata; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_metadata (id, tenant_id, event_id, performers, headliner, supporting_acts, production_company, technical_requirements, stage_setup_time_hours, sponsors, primary_sponsor, performance_rights_org, licensing_requirements, insurance_requirements, press_release, marketing_copy, social_media_copy, sound_requirements, lighting_requirements, video_requirements, catering_requirements, rider_requirements, production_budget, marketing_budget, projected_revenue, break_even_capacity, previous_events, custom_fields, created_at, updated_at) FROM stdin;
306d9594-a47e-11f0-bd4f-0242ac130002	00000000-0000-0000-0000-000000000001	306b109e-a47e-11f0-bd4f-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 19:37:13.357643+00	2025-10-08 19:37:13.357643+00
94fa77fc-a47e-11f0-bd67-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 19:40:02.057041+00	2025-10-08 19:40:02.057041+00
41973534-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	41952da2-a481-11f0-a8b2-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 19:59:10.647253+00	2025-10-08 19:59:10.647253+00
8008b07c-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	800892c2-a481-11f0-a8b2-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:00:55.42545+00	2025-10-08 20:00:55.42545+00
ae98dc32-a481-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	ae971a78-a481-11f0-a5d5-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:02:13.52831+00	2025-10-08 20:02:13.52831+00
19e15b54-a482-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:05:13.536161+00	2025-10-08 20:05:13.536161+00
1a1a1e08-a482-11f0-9e85-0242ac130002	00000000-0000-0000-0000-000000000001	1a182454-a482-11f0-9e85-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:05:13.896343+00	2025-10-08 20:05:13.896343+00
df34488c-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	df32b454-a485-11f0-b7d0-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:32:13.071217+00	2025-10-08 20:32:13.071217+00
0a31c62c-a486-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	0a31a11a-a486-11f0-b7d0-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:33:25.206927+00	2025-10-08 20:33:25.206927+00
09ef6200-a486-11f0-b7d1-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:33:24.772539+00	2025-10-08 20:33:24.772539+00
0a2caffc-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	0a2aaa40-a486-11f0-bb37-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:33:25.161336+00	2025-10-08 20:33:25.161336+00
0abbde16-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	0abbcba6-a486-11f0-bb37-0242ac130002	[]	\N	\N	\N	{}	\N	[]	\N	\N	\N	{}	\N	{}	{}	{}	{}	{}	{}	{}	\N	\N	\N	\N	[]	{}	2025-10-08 20:33:26.112479+00	2025-10-08 20:33:26.112479+00
\.


--
-- Data for Name: event_pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_pricing (id, tenant_id, event_id, schedule_id, capacity_id, name, description, tier, base_price, service_fee, facility_fee, tax_rate, is_dynamic, min_price, max_price, price_adjustment_rules, current_price, early_bird_price, early_bird_ends_at, last_minute_price, last_minute_starts_at, group_size_min, group_discount_percentage, currency, sales_start_at, sales_end_at, max_per_order, max_per_customer, is_active, is_visible, display_order, created_at, updated_at) FROM stdin;
dfbb41a8-a47f-11f0-8047-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	4fcd87cc-a47f-11f0-b89f-0242ac130002	General Admission	\N	\N	50.00	5.00	2.50	0.0800	f	\N	\N	{}	50.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 19:49:16.98485+00	2025-10-08 19:49:16.98485+00
41a98a68-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	41952da2-a481-11f0-a8b2-0242ac130002	\N	41a58bd4-a481-11f0-a8b2-0242ac130002	Test Pricing	\N	\N	25.00	2.50	1.00	0.0800	f	\N	\N	{}	25.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 19:59:10.784421+00	2025-10-08 19:59:10.784421+00
801643ea-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	800892c2-a481-11f0-a8b2-0242ac130002	\N	80131d14-a481-11f0-a8b2-0242ac130002	Test Pricing	\N	\N	25.00	2.50	1.00	0.0800	f	\N	\N	{}	25.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:00:55.516135+00	2025-10-08 20:00:55.516135+00
aea94c7a-a481-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	ae971a78-a481-11f0-a5d5-0242ac130002	\N	aea5bbb4-a481-11f0-a5d5-0242ac130002	Test Pricing	\N	\N	25.00	2.50	1.00	0.0800	f	\N	\N	{}	25.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:02:13.654573+00	2025-10-08 20:02:13.654573+00
19e49bca-a482-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	19e14010-a482-11f0-a5d5-0242ac130002	\N	19e34798-a482-11f0-a5d5-0242ac130002	Test Pricing	\N	\N	50.00	5.00	0.00	0.0000	f	\N	\N	{}	50.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:05:13.559756+00	2025-10-08 20:05:13.559756+00
b819dc58-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	94f86f84-a47e-11f0-bd67-0242ac130002	\N	a2c81112-a485-11f0-b7d0-0242ac130002	Standard Ticket	\N	\N	150.00	7.50	3.00	0.0800	f	\N	\N	{}	75.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:31:07.478534+00	2025-10-08 20:31:07.54041+00
df4033d6-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	df32b454-a485-11f0-b7d0-0242ac130002	\N	df3c8380-a485-11f0-b7d0-0242ac130002	Test Pricing	\N	\N	100.00	5.00	2.50	0.0800	f	\N	\N	{}	50.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:32:13.161436+00	2025-10-08 20:32:13.181947+00
0a447042-a486-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	0a31a11a-a486-11f0-b7d0-0242ac130002	\N	0a40d78e-a486-11f0-b7d0-0242ac130002	Test Pricing	\N	\N	25.00	2.50	1.00	0.0800	f	\N	\N	{}	25.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:33:25.331109+00	2025-10-08 20:33:25.331109+00
09f396fe-a486-11f0-b7d1-0242ac130002	00000000-0000-0000-0000-000000000001	09ef52d8-a486-11f0-b7d1-0242ac130002	\N	09f27d3c-a486-11f0-b7d1-0242ac130002	Test Pricing	\N	\N	50.00	5.00	0.00	0.0000	f	\N	\N	{}	50.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:33:24.801369+00	2025-10-08 20:33:24.801369+00
0ac6af76-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	0abbcba6-a486-11f0-bb37-0242ac130002	\N	0ac2ce56-a486-11f0-bb37-0242ac130002	Test Pricing	\N	\N	100.00	5.00	2.50	0.0800	f	\N	\N	{}	50.00	\N	\N	\N	\N	\N	\N	USD	\N	\N	\N	\N	t	t	0	2025-10-08 20:33:26.184641+00	2025-10-08 20:33:26.207562+00
\.


--
-- Data for Name: event_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_schedules (id, tenant_id, event_id, starts_at, ends_at, doors_open_at, is_recurring, recurrence_rule, recurrence_end_date, occurrence_number, timezone, utc_offset, status, status_reason, capacity_override, check_in_opens_at, check_in_closes_at, notes, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (id, tenant_id, venue_id, venue_layout_id, name, slug, description, short_description, event_type, primary_category_id, secondary_category_ids, tags, status, visibility, is_featured, priority_score, banner_image_url, thumbnail_image_url, image_gallery, video_url, virtual_event_url, age_restriction, dress_code, special_requirements, accessibility_info, collection_address, mint_authority, royalty_percentage, is_virtual, is_hybrid, streaming_platform, streaming_config, cancellation_policy, refund_policy, cancellation_deadline_hours, meta_title, meta_description, meta_keywords, view_count, interest_count, share_count, external_id, metadata, created_by, updated_by, created_at, updated_at, deleted_at) FROM stdin;
306b109e-a47e-11f0-bd4f-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Test Event with Tenant Isolation	test-event-with-tenant-isolation	Testing tenant filtering	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 19:37:13.357643+00	2025-10-08 19:37:13.357643+00	\N
94f86f84-a47e-11f0-bd67-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Test Event with Tenant Isolation	test-event-with-tenant-isolation	Testing tenant filtering	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 19:40:02.057041+00	2025-10-08 19:40:02.057041+00	\N
41952da2-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Integration Test Event	integration-test-event	Updated by test	\N	single	\N	\N	\N	PUBLISHED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	377ccf42-a476-11f0-b372-0242ac130002	2025-10-08 19:59:10.647253+00	2025-10-08 19:59:10.747389+00	\N
800892c2-a481-11f0-a8b2-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Integration Test Event	integration-test-event	Updated by test	\N	single	\N	\N	\N	PUBLISHED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	377ccf42-a476-11f0-b372-0242ac130002	2025-10-08 20:00:55.42545+00	2025-10-08 20:00:55.484311+00	\N
ae971a78-a481-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Integration Test Event	integration-test-event	Updated by test	\N	single	\N	\N	\N	PUBLISHED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	377ccf42-a476-11f0-b372-0242ac130002	2025-10-08 20:02:13.52831+00	2025-10-08 20:02:13.620724+00	\N
19e14010-a482-11f0-a5d5-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Comprehensive Test Event	comprehensive-test-event	For comprehensive testing	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:05:13.536161+00	2025-10-08 20:05:13.536161+00	\N
1a182454-a482-11f0-9e85-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Event To Delete	event-to-delete	\N	\N	single	\N	\N	\N	CANCELLED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:05:13.896343+00	2025-10-08 20:05:13.932753+00	2025-10-08 20:05:13.933+00
df32b454-a485-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Price Lock Test Event	price-lock-test-event	Testing price locking	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:32:13.071217+00	2025-10-08 20:32:13.071217+00	\N
0a31a11a-a486-11f0-b7d0-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Integration Test Event	integration-test-event	Updated by test	\N	single	\N	\N	\N	PUBLISHED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	377ccf42-a476-11f0-b372-0242ac130002	2025-10-08 20:33:25.206927+00	2025-10-08 20:33:25.284771+00	\N
09ef52d8-a486-11f0-b7d1-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Comprehensive Test Event	comprehensive-test-event	For comprehensive testing	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:33:24.772539+00	2025-10-08 20:33:24.772539+00	\N
0a2aaa40-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Event To Delete	event-to-delete	\N	\N	single	\N	\N	\N	CANCELLED	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:33:25.161336+00	2025-10-08 20:33:25.196319+00	2025-10-08 20:33:25.196+00
0abbcba6-a486-11f0-bb37-0242ac130002	00000000-0000-0000-0000-000000000001	7025024b-7dab-4e9a-87d9-ea83caf1dc06	\N	Price Lock Test Event	price-lock-test-event	Testing price locking	\N	single	\N	\N	\N	DRAFT	PUBLIC	f	0	\N	\N	[]	\N	\N	0	\N	\N	{}	\N	\N	\N	f	f	\N	{}	\N	\N	24	\N	\N	\N	0	0	0	\N	{}	377ccf42-a476-11f0-b372-0242ac130002	\N	2025-10-08 20:33:26.112479+00	2025-10-08 20:33:26.112479+00	\N
\.


--
-- Data for Name: invalidated_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invalidated_tokens (token, user_id, invalidated_at, expires_at) FROM stdin;
\.


--
-- Data for Name: knex_migrations_auth; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_auth (id, name, batch, migration_time) FROM stdin;
1	001_auth_complete_schema.ts	1	2025-10-08 14:33:55.383+00
\.


--
-- Data for Name: knex_migrations_auth_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_auth_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_event; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_event (id, name, batch, migration_time) FROM stdin;
2	001_event_complete_schema.ts	1	2025-10-08 19:15:45.081+00
3	002_add_price_locking.ts	2	2025-10-08 20:20:12.329+00
\.


--
-- Data for Name: knex_migrations_event_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_event_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: knex_migrations_venue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_venue (id, name, batch, migration_time) FROM stdin;
1	001_venue_complete_schema.ts	1	2025-10-08 15:42:09.384+00
\.


--
-- Data for Name: knex_migrations_venue_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_venue_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: oauth_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.oauth_connections (id, user_id, provider, provider_user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, slug, status, settings, created_at, updated_at) FROM stdin;
00000000-0000-0000-0000-000000000001	Default Tenant	default	active	{}	2025-10-08 14:33:55.106861+00	2025-10-08 14:33:55.106861+00
\.


--
-- Data for Name: trusted_devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.trusted_devices (id, user_id, device_fingerprint, trust_score, last_seen, created_at) FROM stdin;
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_sessions (id, user_id, started_at, ended_at, ip_address, user_agent, revoked_at, metadata) FROM stdin;
\.


--
-- Data for Name: user_venue_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_venue_roles (id, user_id, venue_id, role, permissions, granted_by, granted_at, revoked_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, email_verified, email_verification_token, email_verification_expires, email_verified_at, username, display_name, bio, avatar_url, cover_image_url, first_name, last_name, date_of_birth, phone, phone_verified, country_code, city, state_province, postal_code, timezone, preferred_language, status, role, permissions, two_factor_enabled, two_factor_secret, backup_codes, mfa_enabled, mfa_secret, last_password_change, password_reset_token, password_reset_expires, password_changed_at, last_login_at, last_login_ip, last_login_device, login_count, failed_login_attempts, locked_until, preferences, notification_preferences, profile_data, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, marketing_consent, marketing_consent_date, referral_code, referred_by, referral_count, provider, provider_user_id, wallet_address, network, verified, metadata, tags, verification_token, is_active, created_at, updated_at, deleted_at, tenant_id) FROM stdin;
efbcc07e-a950-11f0-965b-0242ac130003	integration-test-1760482553@example.com	$2b$10$4uFMRwd0KjRxAvRqx70CheCanCVlZs3weVyeTYJbiEE6x26yXLMnO	t	\N	\N	2025-10-14 22:55:53.92+00	\N	\N	\N	\N	\N	Integration	Test	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-14 22:55:53.30632+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	20F599BC	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-14 22:55:53.305+00	2025-10-14 22:55:53.921789+00	\N	00000000-0000-0000-0000-000000000001
799c8fc8-a464-11f0-a857-0242ac130002	test@example.com	$2b$10$PHDS4osOM6qEW7a/ASF75.GWDuOTxexoaXnJhvGPinWXHo8.RQcsi	t	\N	\N	\N	\N	\N	\N	\N	\N	Test	User	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-08 16:33:09.239908+00	\N	\N	\N	2025-10-08 16:33:10.204818+00	::1	\N	1	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 16:33:09.239+00	2025-10-08 16:33:09.239908+00	\N	00000000-0000-0000-0000-000000000001
fbea46be-a950-11f0-891f-0242ac130003	manual-test@example.com	$2b$10$RzY4CSxTltSCuRCa.WODl.h6Jvn4Fu15nq1QPHR0HTclQaJ6pzb6S	f	\N	\N	\N	\N	\N	\N	\N	\N	Manual	Test	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-14 22:56:13.738649+00	\N	\N	\N	2025-10-14 22:56:14.275403+00	::ffff:172.19.0.1	\N	1	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	02AB4540	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-14 22:56:13.738+00	2025-10-14 22:56:14.275403+00	\N	00000000-0000-0000-0000-000000000001
b47affd0-a464-11f0-8f8c-0242ac130002	venue-test@example.com	$2b$10$j7DAdJSePVf45xH4UafXjOFZhizBIDUz.6W4wpvbIDD7VPSFE6f.e	t	\N	\N	\N	\N	\N	\N	\N	\N	Venue	Tester	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-08 16:34:48.011613+00	\N	\N	\N	2025-10-08 16:59:09.921398+00	::1	\N	17	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 16:34:48.011+00	2025-10-08 16:34:48.011613+00	\N	00000000-0000-0000-0000-000000000001
1bef5712-a468-11f0-b0d1-0242ac130002	staff-member-1759942750@example.com	$2b$10$ToB2A3Fz4bq1xaC6Z.AmmuEDrMdhprqnGjDQ4W/i7t3zInUtrwi12	f	\N	\N	\N	\N	\N	\N	\N	\N	Test	StaffMember	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-08 16:59:10.069993+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 16:59:10.069+00	2025-10-08 16:59:10.069993+00	\N	00000000-0000-0000-0000-000000000001
35fd0e42-a3f0-11f0-a02b-00155d9c6820	test@test.com	$2b$10$rQ9YhJzEf5LmxFZvKGZqKO7EKXj3qYJx8K9Y7Z8VqLmNxFPqWZ9sK	t	\N	\N	\N	\N	\N	\N	\N	\N	Test	User	\N	\N	f	\N	\N	\N	\N	UTC	en	ACTIVE	user	[]	f	\N	\N	f	\N	2025-10-08 18:37:37.631074+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 18:37:37.631074+00	2025-10-08 18:37:37.631074+00	\N	\N
4ed44d82-a467-11f0-bddf-0242ac130002	staff-member-1759942405@example.com	$2b$10$s.AwyUq1DO3DQLQR2jfzGe51rpZ92lPvFtb0XUzxeWxbvQ1M6Zfh6	f	\N	\N	\N	\N	\N	\N	\N	\N	Test	StaffMember	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-08 16:53:25.959873+00	\N	\N	\N	\N	\N	\N	0	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 16:53:25.959+00	2025-10-08 16:53:25.959873+00	\N	00000000-0000-0000-0000-000000000001
377ccf42-a476-11f0-b372-0242ac130002	test2@test.com	$2b$10$xotg76mrIuBEPa5QhBaokuzKhnRg0OpOkwxR2HFJF24qG4/NOP4Ge	f	\N	\N	\N	\N	\N	\N	\N	\N	Test	User	\N	\N	f	\N	\N	\N	\N	UTC	en	PENDING	user	[]	f	\N	\N	f	\N	2025-10-08 18:40:09.248915+00	\N	\N	\N	2025-10-08 20:33:26.079173+00	::ffff:127.0.0.1	\N	42	0	\N	{}	{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}	{}	\N	\N	\N	\N	f	\N	\N	\N	0	\N	\N	\N	\N	f	{}	\N	\N	t	2025-10-08 18:40:09.247+00	2025-10-08 18:40:09.248915+00	\N	00000000-0000-0000-0000-000000000001
\.


--
-- Data for Name: venue_compliance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_compliance (id, venue_id, license_type, license_number, issuing_authority, issue_date, expiry_date, is_verified, document_url, document_hash, status, compliance_level, insurance_provider, insurance_policy_number, insurance_coverage_amount, insurance_expiry, fire_safety_cert_date, health_inspection_date, security_assessment_date, approved_capacity, emergency_plan_approved, compliance_notes, outstanding_issues, verified_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_documents (id, venue_id, type, document_type, status, submitted_at, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_integrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_integrations (id, venue_id, integration_type, integration_name, is_active, api_key_encrypted, api_secret_encrypted, webhook_endpoint, config_data, sync_enabled, sync_frequency, last_sync_at, last_sync_status, last_sync_error, field_mappings, rate_limit, rate_limit_window, created_at, updated_at) FROM stdin;
1b71d97c-a468-11f0-b156-0242ac130002	1b6b5b74-a468-11f0-b156-0242ac130002	stripe	stripe Integration	f	sk_test_abc123	secret_xyz789	\N	{"environment": "production"}	f	\N	\N	\N	\N	{}	\N	\N	2025-10-08 16:59:09.248368+00	2025-10-08 16:59:09.335957+00
\.


--
-- Data for Name: venue_layouts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_layouts (id, venue_id, name, description, layout_type, is_default, is_active, total_capacity, seated_capacity, standing_capacity, accessible_capacity, svg_data, seat_map, sections, price_tiers, stage_location, stage_dimensions, entry_points, exit_points, emergency_exits, restroom_locations, concession_locations, merchandise_locations, metadata, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: venue_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_settings (id, venue_id, allow_print_at_home, allow_mobile_tickets, require_id_verification, ticket_transfer_allowed, ticket_resale_allowed, max_tickets_per_order, service_fee_percentage, facility_fee_amount, processing_fee_percentage, payment_methods, accepted_currencies, payout_frequency, minimum_payout_amount, email_notifications, webhook_url, webhook_secret, google_analytics_id, facebook_pixel_id, custom_tracking_code, require_2fa, ip_whitelist, api_rate_limit, primary_color, secondary_color, custom_css, custom_js, check_in_method, early_entry_minutes, late_entry_minutes, created_at, updated_at) FROM stdin;
1aa3d09a-a468-11f0-b156-0242ac130002	1aa2086e-a468-11f0-b156-0242ac130002	t	t	f	t	t	10	2.50	0.00	2.95	["credit_card", "crypto"]	{USD,SOL}	weekly	100.00	{"payout": true, "review": true, "new_order": true, "cancellation": true}	\N	\N	\N	\N	\N	f	\N	1000	\N	\N	\N	\N	qr_code	30	60	2025-10-08 16:59:07.882647+00	2025-10-08 16:59:07.882647+00
1b11eecc-a468-11f0-b156-0242ac130002	1b11ddc4-a468-11f0-b156-0242ac130002	t	t	f	t	t	20	2.50	0.00	2.95	["credit_card", "crypto"]	{EUR}	weekly	100.00	{"payout": true, "review": true, "new_order": true, "cancellation": true}	\N	\N	\N	\N	\N	f	\N	1000	\N	\N	\N	\N	qr_code	30	60	2025-10-08 16:59:08.618155+00	2025-10-08 16:59:08.664853+00
1b6b69de-a468-11f0-b156-0242ac130002	1b6b5b74-a468-11f0-b156-0242ac130002	t	t	f	t	t	10	2.50	0.00	2.95	["credit_card", "crypto"]	{USD,SOL}	weekly	100.00	{"payout": true, "review": true, "new_order": true, "cancellation": true}	\N	\N	\N	\N	\N	f	\N	1000	\N	\N	\N	\N	qr_code	30	60	2025-10-08 16:59:09.204833+00	2025-10-08 16:59:09.204833+00
1bdc76b0-a468-11f0-b156-0242ac130002	1bdc690e-a468-11f0-b156-0242ac130002	t	t	f	t	t	10	2.50	0.00	2.95	["credit_card", "crypto"]	{USD,SOL}	weekly	100.00	{"payout": true, "review": true, "new_order": true, "cancellation": true}	\N	\N	\N	\N	\N	f	\N	1000	\N	\N	\N	\N	qr_code	30	60	2025-10-08 16:59:09.945701+00	2025-10-08 16:59:09.945701+00
dd223e7e-a475-11f0-8807-0242ac130002	7025024b-7dab-4e9a-87d9-ea83caf1dc06	t	t	f	t	t	10	2.50	0.00	2.95	["credit_card", "crypto"]	{USD,SOL}	weekly	100.00	{"payout": true, "review": true, "new_order": true, "cancellation": true}	\N	\N	\N	\N	\N	f	\N	1000	\N	\N	\N	\N	qr_code	30	60	2025-10-08 18:37:37.631074+00	2025-10-08 18:37:37.631074+00
\.


--
-- Data for Name: venue_staff; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venue_staff (id, venue_id, user_id, role, permissions, department, job_title, employment_type, start_date, end_date, is_active, access_areas, shift_schedule, pin_code, contact_email, contact_phone, emergency_contact, hourly_rate, commission_percentage, added_by, created_at, updated_at) FROM stdin;
1aa50c3a-a468-11f0-b156-0242ac130002	1aa2086e-a468-11f0-b156-0242ac130002	b47affd0-a464-11f0-8f8c-0242ac130002	owner	["*"]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 16:59:07.882647+00	2025-10-08 16:59:07.882647+00
1b123d5a-a468-11f0-b156-0242ac130002	1b11ddc4-a468-11f0-b156-0242ac130002	b47affd0-a464-11f0-8f8c-0242ac130002	owner	["*"]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 16:59:08.618155+00	2025-10-08 16:59:08.618155+00
1b6bab4c-a468-11f0-b156-0242ac130002	1b6b5b74-a468-11f0-b156-0242ac130002	b47affd0-a464-11f0-8f8c-0242ac130002	owner	["*"]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 16:59:09.204833+00	2025-10-08 16:59:09.204833+00
1bdcb940-a468-11f0-b156-0242ac130002	1bdc690e-a468-11f0-b156-0242ac130002	b47affd0-a464-11f0-8f8c-0242ac130002	owner	["*"]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 16:59:09.945701+00	2025-10-08 16:59:09.945701+00
1bf53dee-a468-11f0-b156-0242ac130002	1bdc690e-a468-11f0-b156-0242ac130002	1bef5712-a468-11f0-b0d1-0242ac130002	manager	["events:create", "tickets:view"]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 16:59:10.10951+00	2025-10-08 16:59:10.10951+00
dd22ed88-a475-11f0-8807-0242ac130002	7025024b-7dab-4e9a-87d9-ea83caf1dc06	35fd0e42-a3f0-11f0-a02b-00155d9c6820	owner	[]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 18:37:37.631074+00	2025-10-08 18:37:37.631074+00
4a76cd3c-a476-11f0-92d1-0242ac130002	7025024b-7dab-4e9a-87d9-ea83caf1dc06	377ccf42-a476-11f0-b372-0242ac130002	owner	[]	\N	\N	\N	2025-10-08	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-08 18:40:41.086225+00	2025-10-08 18:40:41.086225+00
\.


--
-- Data for Name: venues; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venues (id, name, slug, description, venue_type, email, phone, website, address_line1, address_line2, city, state_province, postal_code, country_code, latitude, longitude, timezone, max_capacity, standing_capacity, seated_capacity, vip_capacity, logo_url, cover_image_url, image_gallery, virtual_tour_url, business_name, business_registration, tax_id, business_type, wallet_address, collection_address, royalty_percentage, status, is_verified, verified_at, verification_level, features, amenities, accessibility_features, age_restriction, dress_code, prohibited_items, cancellation_policy, refund_policy, social_media, average_rating, total_reviews, total_events, total_tickets_sold, metadata, tags, created_by, updated_by, created_at, updated_at, deleted_at) FROM stdin;
1aa2086e-a468-11f0-b156-0242ac130002	Updated CRUD Arena	test-crud-arena	\N	arena	crud-arena@example.com	\N	\N	100 Test St	\N	Boston	MA	02101	US	\N	\N	UTC	1500	\N	\N	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	2.50	ACTIVE	f	\N	\N	\N	{}	\N	0	\N	\N	\N	\N	{}	0.00	0	0	0	{}	\N	b47affd0-a464-11f0-8f8c-0242ac130002	\N	2025-10-08 16:59:07.882647+00	2025-10-08 16:59:08.080345+00	2025-10-08 16:59:08.079+00
1b11ddc4-a468-11f0-b156-0242ac130002	Settings Test Venue	settings-test-venue	\N	theater	settings-venue@example.com	\N	\N	200 Settings St	\N	Chicago	IL	60601	US	\N	\N	UTC	500	\N	\N	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	2.50	ACTIVE	f	\N	\N	\N	{}	\N	0	\N	\N	\N	\N	{}	0.00	0	0	0	{}	\N	b47affd0-a464-11f0-8f8c-0242ac130002	\N	2025-10-08 16:59:08.618155+00	2025-10-08 16:59:08.618155+00	\N
1b6b5b74-a468-11f0-b156-0242ac130002	Integration Test Venue	integration-test-venue	\N	arena	integrations-venue@example.com	\N	\N	300 Integration Ave	\N	Seattle	WA	98101	US	\N	\N	UTC	800	\N	\N	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	2.50	ACTIVE	f	\N	\N	\N	{}	\N	0	\N	\N	\N	\N	{}	0.00	0	0	0	{}	\N	b47affd0-a464-11f0-8f8c-0242ac130002	\N	2025-10-08 16:59:09.204833+00	2025-10-08 16:59:09.204833+00	\N
1bdc690e-a468-11f0-b156-0242ac130002	Access Test Venue	access-test-venue	\N	comedy_club	access-venue@example.com	\N	\N	400 Access St	\N	Austin	TX	73301	US	\N	\N	UTC	300	\N	\N	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	2.50	ACTIVE	f	\N	\N	\N	{}	\N	0	\N	\N	\N	\N	{}	0.00	0	0	0	{}	\N	b47affd0-a464-11f0-8f8c-0242ac130002	\N	2025-10-08 16:59:09.945701+00	2025-10-08 16:59:09.945701+00	\N
7025024b-7dab-4e9a-87d9-ea83caf1dc06	Test Venue	test-venue	\N	theater	venue@test.com	\N	\N	123 Test St	\N	Test City	TC	\N	US	\N	\N	UTC	5000	\N	\N	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	2.50	ACTIVE	f	\N	\N	\N	{}	\N	0	\N	\N	\N	\N	{}	0.00	0	0	0	{}	\N	\N	\N	2025-10-08 18:37:37.631074+00	2025-10-08 18:37:37.631074+00	\N
\.


--
-- Data for Name: wallet_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_connections (id, user_id, wallet_address, network, verified, last_login_at, created_at) FROM stdin;
\.


--
-- Name: knex_migrations_auth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_auth_id_seq', 1, true);


--
-- Name: knex_migrations_auth_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_auth_lock_index_seq', 1, true);


--
-- Name: knex_migrations_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_event_id_seq', 3, true);


--
-- Name: knex_migrations_event_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_event_lock_index_seq', 1, true);


--
-- Name: knex_migrations_venue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_venue_id_seq', 1, true);


--
-- Name: knex_migrations_venue_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_venue_lock_index_seq', 1, true);


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

\unrestrict SL10RdmNdFLgJUPDapMtIFDaIzc2bkiTVdUOrtDI9EVpD0EWmoXtcf5zv5xo56B

