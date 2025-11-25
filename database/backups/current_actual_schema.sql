--
-- PostgreSQL database dump
--

\restrict RBpsKIJFwRRaCZSh0vOrov0OmqECdHG478HBlcwudvctrHVuiINvZ0AuKLCqFRp

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
    ip_address character varying(45),
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'success'::character varying,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
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
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.biometric_credentials OWNER TO postgres;

--
-- Name: event_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_tiers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    event_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price_cents bigint NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    total_qty integer NOT NULL,
    sold_qty integer DEFAULT 0,
    reserved_qty integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_tiers OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    category character varying(100),
    image_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
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
    invalidated_at timestamp with time zone DEFAULT now(),
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
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.oauth_connections OWNER TO postgres;

--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pricing_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tier_id uuid NOT NULL,
    rule_type character varying(50) NOT NULL,
    conditions jsonb NOT NULL,
    adjustment jsonb NOT NULL,
    priority integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pricing_rules OWNER TO postgres;

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
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.trusted_devices OWNER TO postgres;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
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
    created_at timestamp with time zone DEFAULT now()
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
    password_changed_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    is_active boolean DEFAULT true,
    verification_token character varying(255),
    profile_data jsonb DEFAULT '{}'::jsonb,
    provider character varying(50),
    provider_user_id character varying(255),
    wallet_address character varying(255),
    network character varying(50),
    verified boolean DEFAULT false,
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
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venue_compliance OWNER TO postgres;

--
-- Name: venue_compliance_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance_reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    report jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venue_compliance_reports OWNER TO postgres;

--
-- Name: venue_compliance_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_compliance_reviews (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    scheduled_date timestamp with time zone NOT NULL,
    status character varying(50) DEFAULT 'scheduled'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venue_compliance_reviews OWNER TO postgres;

--
-- Name: venue_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    document_type character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    submitted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venue_documents OWNER TO postgres;

--
-- Name: venue_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_integrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    integration_type character varying(50) NOT NULL,
    integration_name character varying(255),
    config_data jsonb DEFAULT '{}'::jsonb,
    encrypted_credentials text,
    api_key_encrypted text,
    api_secret_encrypted text,
    status character varying(50) DEFAULT 'active'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venue_integrations OWNER TO postgres;

--
-- Name: venue_layouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_layouts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb,
    capacity integer NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT venue_layouts_type_check CHECK (((type)::text = ANY ((ARRAY['fixed'::character varying, 'general_admission'::character varying, 'mixed'::character varying])::text[])))
);


ALTER TABLE public.venue_layouts OWNER TO postgres;

--
-- Name: venue_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venue_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    accepted_currencies text[] DEFAULT ARRAY['USD'::text],
    payment_methods jsonb DEFAULT '["card"]'::jsonb,
    ticket_resale_allowed boolean DEFAULT true,
    max_tickets_per_order integer DEFAULT 10,
    allow_print_at_home boolean DEFAULT true,
    allow_mobile_tickets boolean DEFAULT true,
    require_id_verification boolean DEFAULT false,
    ticket_transfer_allowed boolean DEFAULT true,
    service_fee_percentage numeric(5,2) DEFAULT 10.00,
    facility_fee_amount numeric(10,2) DEFAULT 0.00,
    processing_fee_percentage numeric(5,2) DEFAULT 2.90,
    payout_frequency character varying(50) DEFAULT 'weekly'::character varying,
    minimum_payout_amount numeric(10,2) DEFAULT 50.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
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
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT venue_staff_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'box_office'::character varying, 'door_staff'::character varying, 'viewer'::character varying])::text[])))
);


ALTER TABLE public.venue_staff OWNER TO postgres;

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venues (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    email character varying(255),
    address_line1 character varying(255),
    city character varying(100),
    state_province character varying(100),
    country_code character varying(2),
    max_capacity integer,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    type character varying(50),
    capacity integer,
    address jsonb DEFAULT '{}'::jsonb,
    zip_code character varying(20),
    state character varying(100),
    country character varying(2) DEFAULT 'US'::character varying,
    settings jsonb DEFAULT '{}'::jsonb,
    onboarding jsonb DEFAULT '{}'::jsonb,
    onboarding_status character varying(50) DEFAULT 'pending'::character varying,
    is_active boolean DEFAULT true,
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
    created_at timestamp with time zone DEFAULT now()
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
-- Name: event_tiers event_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tiers
    ADD CONSTRAINT event_tiers_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_slug_unique UNIQUE (slug);


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
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


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
-- Name: venue_compliance venue_compliance_venue_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_key UNIQUE (venue_id);


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
-- Name: venue_settings venue_settings_venue_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_settings
    ADD CONSTRAINT venue_settings_venue_id_key UNIQUE (venue_id);


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
-- Name: wallet_connections wallet_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_pkey PRIMARY KEY (id);


--
-- Name: event_tiers_event_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_tiers_event_id_index ON public.event_tiers USING btree (event_id);


--
-- Name: event_tiers_tenant_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX event_tiers_tenant_id_index ON public.event_tiers USING btree (tenant_id);


--
-- Name: events_starts_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_starts_at_index ON public.events USING btree (starts_at);


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
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_biometric_credentials_device; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_biometric_credentials_device ON public.biometric_credentials USING btree (user_id, device_id);


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
-- Name: idx_oauth_connections_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_oauth_connections_provider ON public.oauth_connections USING btree (provider, provider_user_id);


--
-- Name: idx_oauth_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oauth_connections_user_id ON public.oauth_connections USING btree (user_id);


--
-- Name: idx_trusted_devices_fingerprint; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_trusted_devices_fingerprint ON public.trusted_devices USING btree (user_id, device_fingerprint);


--
-- Name: idx_trusted_devices_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices USING btree (user_id);


--
-- Name: idx_user_sessions_ended_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at) WHERE (ended_at IS NULL);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_user_venue_roles_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_venue_roles_unique ON public.user_venue_roles USING btree (user_id, venue_id, role) WHERE (is_active = true);


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
-- Name: idx_venue_documents_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_documents_venue_id ON public.venue_documents USING btree (venue_id);


--
-- Name: idx_venue_integrations_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_integrations_venue_id ON public.venue_integrations USING btree (venue_id);


--
-- Name: idx_venue_layouts_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_layouts_venue_id ON public.venue_layouts USING btree (venue_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_venue_staff_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_user_id ON public.venue_staff USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_venue_staff_venue_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venue_staff_venue_id ON public.venue_staff USING btree (venue_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_wallet_connections_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_wallet_connections_address ON public.wallet_connections USING btree (wallet_address, network);


--
-- Name: idx_wallet_connections_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_connections_user_id ON public.wallet_connections USING btree (user_id);


--
-- Name: pricing_rules_tier_id_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pricing_rules_tier_id_active_index ON public.pricing_rules USING btree (tier_id, active);


--
-- Name: pricing_rules_tier_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pricing_rules_tier_id_index ON public.pricing_rules USING btree (tier_id);


--
-- Name: users trigger_generate_referral_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.generate_user_referral_code();


--
-- Name: users trigger_increment_referral_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_increment_referral_count AFTER UPDATE OF email_verified ON public.users FOR EACH ROW WHEN (((new.email_verified = true) AND (old.email_verified = false))) EXECUTE FUNCTION public.increment_referral_count();


--
-- Name: users trigger_update_users_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: biometric_credentials biometric_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_tiers event_tiers_event_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tiers
    ADD CONSTRAINT event_tiers_event_id_foreign FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_tiers event_tiers_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tiers
    ADD CONSTRAINT event_tiers_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: events events_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: events events_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: events events_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: invalidated_tokens invalidated_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_tier_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_tier_id_foreign FOREIGN KEY (tier_id) REFERENCES public.event_tiers(id) ON DELETE CASCADE;


--
-- Name: trusted_devices trusted_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: venue_compliance_reports venue_compliance_reports_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reports
    ADD CONSTRAINT venue_compliance_reports_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance_reviews venue_compliance_reviews_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_compliance venue_compliance_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_compliance
    ADD CONSTRAINT venue_compliance_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_documents venue_documents_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_documents
    ADD CONSTRAINT venue_documents_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: venue_integrations venue_integrations_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venue_integrations
    ADD CONSTRAINT venue_integrations_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


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
-- Name: wallet_connections wallet_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict RBpsKIJFwRRaCZSh0vOrov0OmqECdHG478HBlcwudvctrHVuiINvZ0AuKLCqFRp

