--
-- PostgreSQL database dump
--

\restrict vdHWpPlV2I78CZACWDNM01LsouuqrzB6auAX192ISnC7YgFL23o8B5mIoBwo02O

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bank_verifications; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: bank_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_verifications_id_seq OWNED BY public.bank_verifications.id;


--
-- Name: bot_detections; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: compliance_audit_log; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: compliance_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_audit_log_id_seq OWNED BY public.compliance_audit_log.id;


--
-- Name: compliance_batch_jobs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: compliance_batch_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_batch_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_batch_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_batch_jobs_id_seq OWNED BY public.compliance_batch_jobs.id;


--
-- Name: compliance_documents; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: compliance_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_documents_id_seq OWNED BY public.compliance_documents.id;


--
-- Name: device_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_fingerprint character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    activity_type character varying(100) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: external_verifications; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: file_access_logs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: file_versions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: index_queue; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: index_versions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: known_scalpers; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: manual_review_queue; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: notification_delivery_stats; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: notification_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_log_id_seq OWNED BY public.notification_log.id;


--
-- Name: ofac_checks; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: ofac_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ofac_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ofac_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ofac_checks_id_seq OWNED BY public.ofac_checks.id;


--
-- Name: ofac_sdn_list; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: ofac_sdn_list_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ofac_sdn_list_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ofac_sdn_list_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ofac_sdn_list_id_seq OWNED BY public.ofac_sdn_list.id;


--
-- Name: offline_validation_cache; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: payment_idempotency; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: payment_retries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_retries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    attempt_number integer,
    status character varying(50),
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payment_state_transitions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: payout_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_methods (
    id integer NOT NULL,
    venue_id character varying(255),
    payout_id character varying(255),
    provider character varying(50),
    status character varying(20),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payout_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payout_methods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payout_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payout_methods_id_seq OWNED BY public.payout_methods.id;


--
-- Name: queues; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: read_consistency_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.read_consistency_tokens (
    token character varying(255) NOT NULL,
    client_id character varying(255) NOT NULL,
    required_versions jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: reconciliation_reports; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: risk_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_assessments (
    id integer NOT NULL,
    venue_id character varying(255),
    risk_score integer,
    factors jsonb,
    recommendation character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: risk_assessments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.risk_assessments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_assessments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.risk_assessments_id_seq OWNED BY public.risk_assessments.id;


--
-- Name: risk_flags; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: risk_flags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.risk_flags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_flags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.risk_flags_id_seq OWNED BY public.risk_flags.id;


--
-- Name: scan_policy_templates; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: settlement_batches; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: tax_collections; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: tax_forms_1099da; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: venue_compliance_reviews; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: venue_marketplace_settings; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: venue_verifications; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: venue_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venue_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venue_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venue_verifications_id_seq OWNED BY public.venue_verifications.id;


--
-- Name: waiting_room_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waiting_room_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id integer NOT NULL,
    source character varying(50),
    type character varying(100),
    payload jsonb,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: webhook_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_logs_id_seq OWNED BY public.webhook_logs.id;


--
-- Name: bank_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_verifications ALTER COLUMN id SET DEFAULT nextval('public.bank_verifications_id_seq'::regclass);


--
-- Name: compliance_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_audit_log ALTER COLUMN id SET DEFAULT nextval('public.compliance_audit_log_id_seq'::regclass);


--
-- Name: compliance_batch_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_batch_jobs ALTER COLUMN id SET DEFAULT nextval('public.compliance_batch_jobs_id_seq'::regclass);


--
-- Name: compliance_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_documents ALTER COLUMN id SET DEFAULT nextval('public.compliance_documents_id_seq'::regclass);


--
-- Name: notification_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log ALTER COLUMN id SET DEFAULT nextval('public.notification_log_id_seq'::regclass);


--
-- Name: ofac_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofac_checks ALTER COLUMN id SET DEFAULT nextval('public.ofac_checks_id_seq'::regclass);


--
-- Name: ofac_sdn_list id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofac_sdn_list ALTER COLUMN id SET DEFAULT nextval('public.ofac_sdn_list_id_seq'::regclass);


--
-- Name: payout_methods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_methods ALTER COLUMN id SET DEFAULT nextval('public.payout_methods_id_seq'::regclass);


--
-- Name: risk_assessments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_assessments ALTER COLUMN id SET DEFAULT nextval('public.risk_assessments_id_seq'::regclass);


--
-- Name: risk_flags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_flags ALTER COLUMN id SET DEFAULT nextval('public.risk_flags_id_seq'::regclass);


--
-- Name: venue_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_verifications ALTER COLUMN id SET DEFAULT nextval('public.venue_verifications_id_seq'::regclass);


--
-- Name: webhook_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs ALTER COLUMN id SET DEFAULT nextval('public.webhook_logs_id_seq'::regclass);


--
-- Name: bank_verifications bank_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_verifications
    ADD CONSTRAINT bank_verifications_pkey PRIMARY KEY (id);


--
-- Name: bot_detections bot_detections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_detections
    ADD CONSTRAINT bot_detections_pkey PRIMARY KEY (id);


--
-- Name: compliance_audit_log compliance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_audit_log
    ADD CONSTRAINT compliance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: compliance_batch_jobs compliance_batch_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_batch_jobs
    ADD CONSTRAINT compliance_batch_jobs_pkey PRIMARY KEY (id);


--
-- Name: compliance_documents compliance_documents_document_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_documents
    ADD CONSTRAINT compliance_documents_document_id_unique UNIQUE (document_id);


--
-- Name: compliance_documents compliance_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_documents
    ADD CONSTRAINT compliance_documents_pkey PRIMARY KEY (id);


--
-- Name: device_activity device_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_activity
    ADD CONSTRAINT device_activity_pkey PRIMARY KEY (id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- Name: external_verifications external_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_verifications
    ADD CONSTRAINT external_verifications_pkey PRIMARY KEY (id);


--
-- Name: file_access_logs file_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_pkey PRIMARY KEY (id);


--
-- Name: file_versions file_versions_file_id_version_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_version_number_unique UNIQUE (file_id, version_number);


--
-- Name: file_versions file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_pkey PRIMARY KEY (id);


--
-- Name: index_queue index_queue_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.index_queue
    ADD CONSTRAINT index_queue_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: index_queue index_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.index_queue
    ADD CONSTRAINT index_queue_pkey PRIMARY KEY (id);


--
-- Name: index_versions index_versions_entity_type_entity_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.index_versions
    ADD CONSTRAINT index_versions_entity_type_entity_id_unique UNIQUE (entity_type, entity_id);


--
-- Name: index_versions index_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.index_versions
    ADD CONSTRAINT index_versions_pkey PRIMARY KEY (id);


--
-- Name: known_scalpers known_scalpers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.known_scalpers
    ADD CONSTRAINT known_scalpers_pkey PRIMARY KEY (id);


--
-- Name: manual_review_queue manual_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_stats notification_delivery_stats_date_channel_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_stats
    ADD CONSTRAINT notification_delivery_stats_date_channel_provider_unique UNIQUE (date, channel, provider);


--
-- Name: notification_delivery_stats notification_delivery_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_stats
    ADD CONSTRAINT notification_delivery_stats_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: ofac_checks ofac_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofac_checks
    ADD CONSTRAINT ofac_checks_pkey PRIMARY KEY (id);


--
-- Name: ofac_sdn_list ofac_sdn_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofac_sdn_list
    ADD CONSTRAINT ofac_sdn_list_pkey PRIMARY KEY (id);


--
-- Name: offline_validation_cache offline_validation_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_validation_cache
    ADD CONSTRAINT offline_validation_cache_pkey PRIMARY KEY (id);


--
-- Name: offline_validation_cache offline_validation_cache_ticket_id_valid_from_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_validation_cache
    ADD CONSTRAINT offline_validation_cache_ticket_id_valid_from_unique UNIQUE (ticket_id, valid_from);


--
-- Name: payment_idempotency payment_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_idempotency
    ADD CONSTRAINT payment_idempotency_pkey PRIMARY KEY (idempotency_key);


--
-- Name: payment_retries payment_retries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_retries
    ADD CONSTRAINT payment_retries_pkey PRIMARY KEY (id);


--
-- Name: payment_state_transitions payment_state_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_pkey PRIMARY KEY (id);


--
-- Name: payout_methods payout_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_methods
    ADD CONSTRAINT payout_methods_pkey PRIMARY KEY (id);


--
-- Name: queues queues_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_name_unique UNIQUE (name);


--
-- Name: queues queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_key_unique UNIQUE (key);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: read_consistency_tokens read_consistency_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.read_consistency_tokens
    ADD CONSTRAINT read_consistency_tokens_pkey PRIMARY KEY (token);


--
-- Name: reconciliation_reports reconciliation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_reports
    ADD CONSTRAINT reconciliation_reports_pkey PRIMARY KEY (id);


--
-- Name: risk_assessments risk_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_assessments
    ADD CONSTRAINT risk_assessments_pkey PRIMARY KEY (id);


--
-- Name: risk_flags risk_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT risk_flags_pkey PRIMARY KEY (id);


--
-- Name: scan_policy_templates scan_policy_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_policy_templates
    ADD CONSTRAINT scan_policy_templates_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_name_unique UNIQUE (name);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: settlement_batches settlement_batches_batch_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_batches
    ADD CONSTRAINT settlement_batches_batch_number_unique UNIQUE (batch_number);


--
-- Name: settlement_batches settlement_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_batches
    ADD CONSTRAINT settlement_batches_pkey PRIMARY KEY (id);


--
-- Name: tax_collections tax_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_collections
    ADD CONSTRAINT tax_collections_pkey PRIMARY KEY (id);


--
-- Name: tax_forms_1099da tax_forms_1099da_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_forms_1099da
    ADD CONSTRAINT tax_forms_1099da_pkey PRIMARY KEY (id);


--
-- Name: tax_forms_1099da tax_forms_1099da_user_id_tax_year_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_forms_1099da
    ADD CONSTRAINT tax_forms_1099da_user_id_tax_year_unique UNIQUE (user_id, tax_year);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: upload_sessions upload_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: venue_compliance_reviews venue_compliance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_pkey PRIMARY KEY (id);


--
-- Name: venue_marketplace_settings venue_marketplace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_marketplace_settings
    ADD CONSTRAINT venue_marketplace_settings_pkey PRIMARY KEY (venue_id);


--
-- Name: venue_verifications venue_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_pkey PRIMARY KEY (id);


--
-- Name: venue_verifications venue_verifications_venue_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_venue_id_unique UNIQUE (venue_id);


--
-- Name: venue_verifications venue_verifications_verification_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_verifications
    ADD CONSTRAINT venue_verifications_verification_id_unique UNIQUE (verification_id);


--
-- Name: waiting_room_activity waiting_room_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiting_room_activity
    ADD CONSTRAINT waiting_room_activity_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_verifications_venue_id_index ON public.bank_verifications USING btree (venue_id);


--
-- Name: compliance_audit_log_entity_type_entity_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_audit_log_entity_type_entity_id_index ON public.compliance_audit_log USING btree (entity_type, entity_id);


--
-- Name: compliance_documents_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_documents_venue_id_index ON public.compliance_documents USING btree (venue_id);


--
-- Name: device_activity_device_fingerprint_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_activity_device_fingerprint_index ON public.device_activity USING btree (device_fingerprint);


--
-- Name: device_activity_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_activity_user_id_index ON public.device_activity USING btree (user_id);


--
-- Name: email_queue_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_queue_created_at_index ON public.email_queue USING btree (created_at);


--
-- Name: email_queue_status_priority_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_queue_status_priority_index ON public.email_queue USING btree (status, priority);


--
-- Name: external_verifications_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_verifications_created_at_index ON public.external_verifications USING btree (created_at);


--
-- Name: external_verifications_external_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_verifications_external_id_index ON public.external_verifications USING btree (external_id);


--
-- Name: external_verifications_provider_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_verifications_provider_status_index ON public.external_verifications USING btree (provider, status);


--
-- Name: external_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_verifications_venue_id_index ON public.external_verifications USING btree (venue_id);


--
-- Name: file_access_logs_accessed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_access_logs_accessed_at_index ON public.file_access_logs USING btree (accessed_at);


--
-- Name: file_access_logs_accessed_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_access_logs_accessed_by_index ON public.file_access_logs USING btree (accessed_by);


--
-- Name: file_access_logs_file_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_access_logs_file_id_index ON public.file_access_logs USING btree (file_id);


--
-- Name: file_versions_file_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_versions_file_id_index ON public.file_versions USING btree (file_id);


--
-- Name: file_versions_file_id_version_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_versions_file_id_version_number_index ON public.file_versions USING btree (file_id, version_number);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity ON public.compliance_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_compliance_documents_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_documents_venue_id ON public.compliance_documents USING btree (venue_id);


--
-- Name: idx_index_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_index_queue_priority ON public.index_queue USING btree (priority, created_at);


--
-- Name: idx_index_queue_unprocessed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_index_queue_unprocessed ON public.index_queue USING btree (processed_at);


--
-- Name: idx_index_versions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_index_versions_entity ON public.index_versions USING btree (entity_type, entity_id);


--
-- Name: idx_index_versions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_index_versions_status ON public.index_versions USING btree (index_status, created_at);


--
-- Name: idx_ofac_checks_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofac_checks_venue_id ON public.ofac_checks USING btree (venue_id);


--
-- Name: idx_ofac_sdn_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofac_sdn_name ON public.ofac_sdn_list USING btree (full_name);


--
-- Name: idx_read_consistency_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_read_consistency_expires ON public.read_consistency_tokens USING btree (expires_at);


--
-- Name: idx_risk_flags_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_flags_venue_id ON public.risk_flags USING btree (venue_id);


--
-- Name: idx_venue_verifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_verifications_status ON public.venue_verifications USING btree (status);


--
-- Name: idx_venue_verifications_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_verifications_venue_id ON public.venue_verifications USING btree (venue_id);


--
-- Name: idx_webhook_logs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_source ON public.webhook_logs USING btree (source);


--
-- Name: manual_review_queue_assigned_to_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_review_queue_assigned_to_index ON public.manual_review_queue USING btree (assigned_to);


--
-- Name: manual_review_queue_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_review_queue_created_at_index ON public.manual_review_queue USING btree (created_at);


--
-- Name: manual_review_queue_status_priority_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_review_queue_status_priority_index ON public.manual_review_queue USING btree (status, priority);


--
-- Name: manual_review_queue_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_review_queue_venue_id_index ON public.manual_review_queue USING btree (venue_id);


--
-- Name: ofac_checks_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ofac_checks_venue_id_index ON public.ofac_checks USING btree (venue_id);


--
-- Name: ofac_sdn_list_full_name_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ofac_sdn_list_full_name_index ON public.ofac_sdn_list USING btree (full_name);


--
-- Name: offline_validation_cache_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_validation_cache_event_id_index ON public.offline_validation_cache USING btree (event_id);


--
-- Name: offline_validation_cache_event_id_valid_until_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_validation_cache_event_id_valid_until_index ON public.offline_validation_cache USING btree (event_id, valid_until);


--
-- Name: offline_validation_cache_ticket_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_validation_cache_ticket_id_index ON public.offline_validation_cache USING btree (ticket_id);


--
-- Name: offline_validation_cache_valid_until_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_validation_cache_valid_until_index ON public.offline_validation_cache USING btree (valid_until);


--
-- Name: payment_idempotency_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_idempotency_expires_at_index ON public.payment_idempotency USING btree (expires_at);


--
-- Name: payment_retries_payment_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_retries_payment_id_index ON public.payment_retries USING btree (payment_id);


--
-- Name: payment_state_transitions_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_state_transitions_created_at_index ON public.payment_state_transitions USING btree (created_at);


--
-- Name: payment_state_transitions_order_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_state_transitions_order_id_index ON public.payment_state_transitions USING btree (order_id);


--
-- Name: payment_state_transitions_payment_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_state_transitions_payment_id_index ON public.payment_state_transitions USING btree (payment_id);


--
-- Name: payout_methods_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payout_methods_venue_id_index ON public.payout_methods USING btree (venue_id);


--
-- Name: queues_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX queues_active_index ON public.queues USING btree (active);


--
-- Name: queues_name_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX queues_name_index ON public.queues USING btree (name);


--
-- Name: queues_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX queues_type_index ON public.queues USING btree (type);


--
-- Name: rate_limits_key_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_key_index ON public.rate_limits USING btree (key);


--
-- Name: rate_limits_reset_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_reset_at_index ON public.rate_limits USING btree (reset_at);


--
-- Name: reconciliation_reports_report_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_reports_report_date_index ON public.reconciliation_reports USING btree (report_date);


--
-- Name: risk_assessments_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX risk_assessments_venue_id_index ON public.risk_assessments USING btree (venue_id);


--
-- Name: risk_flags_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX risk_flags_venue_id_index ON public.risk_flags USING btree (venue_id);


--
-- Name: scan_policy_templates_is_default_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scan_policy_templates_is_default_index ON public.scan_policy_templates USING btree (is_default);


--
-- Name: scan_policy_templates_name_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scan_policy_templates_name_index ON public.scan_policy_templates USING btree (name);


--
-- Name: schedules_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedules_active_index ON public.schedules USING btree (active);


--
-- Name: schedules_name_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedules_name_index ON public.schedules USING btree (name);


--
-- Name: schedules_next_run_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedules_next_run_index ON public.schedules USING btree (next_run);


--
-- Name: settlement_batches_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_batches_status_index ON public.settlement_batches USING btree (status);


--
-- Name: settlement_batches_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_batches_venue_id_index ON public.settlement_batches USING btree (venue_id);


--
-- Name: upload_sessions_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upload_sessions_expires_at_index ON public.upload_sessions USING btree (expires_at);


--
-- Name: upload_sessions_session_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upload_sessions_session_token_index ON public.upload_sessions USING btree (session_token);


--
-- Name: upload_sessions_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upload_sessions_status_index ON public.upload_sessions USING btree (status);


--
-- Name: upload_sessions_uploaded_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upload_sessions_uploaded_by_index ON public.upload_sessions USING btree (uploaded_by);


--
-- Name: venue_compliance_reviews_reviewer_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_compliance_reviews_reviewer_id_index ON public.venue_compliance_reviews USING btree (reviewer_id);


--
-- Name: venue_compliance_reviews_status_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_compliance_reviews_status_scheduled_date_index ON public.venue_compliance_reviews USING btree (status, scheduled_date);


--
-- Name: venue_compliance_reviews_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_compliance_reviews_venue_id_index ON public.venue_compliance_reviews USING btree (venue_id);


--
-- Name: venue_verifications_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_verifications_status_index ON public.venue_verifications USING btree (status);


--
-- Name: venue_verifications_venue_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_verifications_venue_id_index ON public.venue_verifications USING btree (venue_id);


--
-- Name: webhook_events_event_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_event_type_index ON public.webhook_events USING btree (event_type);


--
-- Name: webhook_events_processor_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_processor_index ON public.webhook_events USING btree (processor);


--
-- Name: webhook_logs_source_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_logs_source_index ON public.webhook_logs USING btree (source);


--
-- Name: external_verifications external_verifications_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_verifications
    ADD CONSTRAINT external_verifications_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: file_access_logs file_access_logs_file_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_file_id_foreign FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: file_versions file_versions_file_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_foreign FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: manual_review_queue manual_review_queue_assigned_to_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_assigned_to_foreign FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: manual_review_queue manual_review_queue_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: manual_review_queue manual_review_queue_verification_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_review_queue
    ADD CONSTRAINT manual_review_queue_verification_id_foreign FOREIGN KEY (verification_id) REFERENCES public.external_verifications(id) ON DELETE SET NULL;


--
-- Name: payment_state_transitions payment_state_transitions_payment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_payment_id_foreign FOREIGN KEY (payment_id) REFERENCES public.payment_intents(id);


--
-- Name: tax_collections tax_collections_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_collections
    ADD CONSTRAINT tax_collections_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id);


--
-- Name: venue_compliance_reviews venue_compliance_reviews_reviewer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_reviewer_id_foreign FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: venue_compliance_reviews venue_compliance_reviews_venue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_compliance_reviews
    ADD CONSTRAINT venue_compliance_reviews_venue_id_foreign FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict vdHWpPlV2I78CZACWDNM01LsouuqrzB6auAX192ISnC7YgFL23o8B5mIoBwo02O

