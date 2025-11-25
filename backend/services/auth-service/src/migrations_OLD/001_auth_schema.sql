--
-- PostgreSQL database dump
--

\restrict El0T3NlgGm4S5I8hUymRLafqXN5UDuXZhvhKyEV7KNpQeTLmD4N2YSxP6KDeM9T

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: biometric_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biometric_credentials (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    device_id character varying(255) NOT NULL,
    public_key text NOT NULL,
    credential_type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invalidated_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invalidated_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    invalidated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: oauth_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_connections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: trusted_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trusted_devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    device_fingerprint character varying(255) NOT NULL,
    trust_score integer DEFAULT 0,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: user_venue_roles; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: wallet_connections; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: biometric_credentials biometric_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_pkey PRIMARY KEY (id);


--
-- Name: invalidated_tokens invalidated_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_pkey PRIMARY KEY (token);


--
-- Name: oauth_connections oauth_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);


--
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_venue_roles user_venue_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: wallet_connections wallet_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_biometric_credentials_device; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_biometric_credentials_device ON public.biometric_credentials USING btree (user_id, device_id);


--
-- Name: idx_biometric_credentials_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_biometric_credentials_user_id ON public.biometric_credentials USING btree (user_id);


--
-- Name: idx_invalidated_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invalidated_tokens_expires_at ON public.invalidated_tokens USING btree (expires_at);


--
-- Name: idx_invalidated_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invalidated_tokens_user_id ON public.invalidated_tokens USING btree (user_id);


--
-- Name: idx_oauth_connections_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_oauth_connections_provider ON public.oauth_connections USING btree (provider, provider_user_id);


--
-- Name: idx_oauth_connections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_connections_user_id ON public.oauth_connections USING btree (user_id);


--
-- Name: idx_trusted_devices_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_trusted_devices_fingerprint ON public.trusted_devices USING btree (user_id, device_fingerprint);


--
-- Name: idx_trusted_devices_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices USING btree (user_id);


--
-- Name: idx_user_sessions_ended_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at) WHERE (ended_at IS NULL);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_user_venue_roles_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_venue_roles_unique ON public.user_venue_roles USING btree (user_id, venue_id, role) WHERE (is_active = true);


--
-- Name: idx_user_venue_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_venue_roles_user_id ON public.user_venue_roles USING btree (user_id);


--
-- Name: idx_user_venue_roles_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_venue_roles_venue_id ON public.user_venue_roles USING btree (venue_id);


--
-- Name: idx_users_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_country_code ON public.users USING btree (country_code) WHERE (country_code IS NOT NULL);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_display_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_display_name ON public.users USING btree (display_name) WHERE (display_name IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_email_verification_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_verification_token ON public.users USING btree (email_verification_token) WHERE (email_verification_token IS NOT NULL);


--
-- Name: idx_users_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_metadata_gin ON public.users USING gin (metadata);


--
-- Name: idx_users_password_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_password_reset_token ON public.users USING btree (password_reset_token) WHERE (password_reset_token IS NOT NULL);


--
-- Name: idx_users_permissions_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_permissions_gin ON public.users USING gin (permissions);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_users_preferences_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_preferences_gin ON public.users USING gin (preferences);


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code) WHERE (referral_code IS NOT NULL);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by) WHERE (referred_by IS NOT NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_role_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role_status ON public.users USING btree (role, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_search ON public.users USING gin (to_tsvector('english'::regconfig, (((((((((COALESCE(username, ''::character varying))::text || ' '::text) || (COALESCE(display_name, ''::character varying))::text) || ' '::text) || (COALESCE(first_name, ''::character varying))::text) || ' '::text) || (COALESCE(last_name, ''::character varying))::text) || ' '::text) || (COALESCE(email, ''::character varying))::text)));


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status_created_at ON public.users USING btree (status, created_at);


--
-- Name: idx_users_timezone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_timezone ON public.users USING btree (timezone);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: idx_wallet_connections_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_wallet_connections_address ON public.wallet_connections USING btree (wallet_address, network);


--
-- Name: idx_wallet_connections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_connections_user_id ON public.wallet_connections USING btree (user_id);


--
-- Name: users trigger_generate_referral_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.generate_user_referral_code();


--
-- Name: users trigger_increment_referral_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_increment_referral_count AFTER UPDATE OF email_verified ON public.users FOR EACH ROW WHEN (((new.email_verified = true) AND (old.email_verified = false))) EXECUTE FUNCTION public.increment_referral_count();


--
-- Name: users trigger_update_users_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: biometric_credentials biometric_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biometric_credentials
    ADD CONSTRAINT biometric_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invalidated_tokens invalidated_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invalidated_tokens
    ADD CONSTRAINT invalidated_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trusted_devices trusted_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_venue_roles user_venue_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_venue_roles user_venue_roles_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_venue_roles
    ADD CONSTRAINT user_venue_roles_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: wallet_connections wallet_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_connections
    ADD CONSTRAINT wallet_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict El0T3NlgGm4S5I8hUymRLafqXN5UDuXZhvhKyEV7KNpQeTLmD4N2YSxP6KDeM9T

