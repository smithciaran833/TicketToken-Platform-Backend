-- =============================================
-- Migration: 001_initial_schema.sql
-- =============================================
-- Initial database setup for TicketToken platform
-- Creates schemas, extensions, types, and base configuration
-- 
-- To apply: psql -d tickettoken_db -f 001_initial_schema.sql
-- To rollback: psql -d tickettoken_db -f rollback_001_initial_schema.sql
-- =============================================

-- Start transaction for atomic execution

-- =============================================
-- Create Schemas
-- =============================================
-- Organize database objects into logical namespaces

-- Public schema (default, for core application tables)
-- Already exists by default, but ensure it's there
CREATE SCHEMA IF NOT EXISTS public;
COMMENT ON SCHEMA public IS 'Core application tables and data';

-- Blockchain schema for all blockchain-related tables
CREATE SCHEMA IF NOT EXISTS blockchain;
COMMENT ON SCHEMA blockchain IS 'Blockchain transactions, NFTs, and smart contract data';

-- Compliance schema for regulatory and compliance data
CREATE SCHEMA IF NOT EXISTS compliance;
COMMENT ON SCHEMA compliance IS 'KYC, AML, and regulatory compliance data';

-- Analytics schema for reporting and analytics
CREATE SCHEMA IF NOT EXISTS analytics;
COMMENT ON SCHEMA analytics IS 'Materialized views and analytics data';

-- Audit schema for audit logs and history
CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS 'Audit logs and data change history';

-- Cache schema for temporary and cached data
CREATE SCHEMA IF NOT EXISTS cache;
COMMENT ON SCHEMA cache IS 'Temporary tables and cached data';

-- =============================================
-- Install Extensions
-- =============================================
-- Add required PostgreSQL extensions

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create email domain type
CREATE DOMAIN email AS varchar(255)
  CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

COMMENT ON EXTENSION "uuid-ossp" IS 'Functions for generating UUIDs';

-- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
COMMENT ON EXTENSION "pgcrypto" IS 'Cryptographic functions for hashing and encryption';

-- Key-value store
CREATE EXTENSION IF NOT EXISTS "hstore";
COMMENT ON EXTENSION "hstore" IS 'Key-value store for flexible data';

-- Trigram similarity search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
COMMENT ON EXTENSION "pg_trgm" IS 'Text similarity search using trigrams';

-- Additional useful extensions
CREATE EXTENSION IF NOT EXISTS "btree_gist";
COMMENT ON EXTENSION "btree_gist" IS 'GiST index support for common data types';

CREATE EXTENSION IF NOT EXISTS "citext";
COMMENT ON EXTENSION "citext" IS 'Case-insensitive text type';

-- =============================================
-- Create Custom Domains
-- =============================================
-- Define reusable data types with constraints

-- Email domain with validation
CREATE DOMAIN email AS citext
   CHECK (VALUE ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$');
COMMENT ON DOMAIN email IS 'Email address with format validation';

-- Phone number domain
CREATE DOMAIN VARCHAR(20) AS VARCHAR(20)
   CHECK (VALUE ~ '^\+?[1-9]\d{1,14}$');
COMMENT ON DOMAIN VARCHAR(20) IS 'International phone number (E.164 format)';

-- Blockchain address domain (Solana)
CREATE DOMAIN VARCHAR(44) AS VARCHAR(44)
   CHECK (LENGTH(VALUE) BETWEEN 32 AND 44);
COMMENT ON DOMAIN VARCHAR(44) IS 'Blockchain address (base58 for Solana)';

-- Positive numeric domain
CREATE DOMAIN positive_numeric AS NUMERIC
   CHECK (VALUE > 0);
COMMENT ON DOMAIN positive_numeric IS 'Positive numeric values only';

-- URL domain
CREATE DOMAIN TEXT AS VARCHAR(2048)
   CHECK (VALUE ~ '^https?://');
COMMENT ON DOMAIN TEXT IS 'Valid HTTP/HTTPS URL';

-- =============================================
-- Create Enum Types
-- =============================================
-- Define enumerated types used across tables

-- User status
CREATE TYPE user_status AS ENUM (
   'PENDING',      -- Awaiting email verification
   'ACTIVE',       -- Active user
   'INACTIVE',     -- Temporarily inactive
   'SUSPENDED',    -- Suspended by admin
   'DELETED'       -- Soft deleted
);
COMMENT ON TYPE user_status IS 'User account status';

-- Ticket status
CREATE TYPE ticket_status AS ENUM (
   'DRAFT',        -- Not yet minted
   'MINTING',      -- Being minted on blockchain
   'ACTIVE',       -- Minted and active
   'LISTED',       -- Listed for sale
   'TRANSFERRED',  -- Ownership transferred
   'REDEEMED',     -- Used for event entry
   'EXPIRED',      -- Past event date
   'CANCELLED',    -- Cancelled by issuer
   'BURNED'        -- Burned on blockchain
);
COMMENT ON TYPE ticket_status IS 'Ticket lifecycle status';

-- Transaction status
CREATE TYPE transaction_status AS ENUM (
   'PENDING',      -- Submitted to blockchain
   'CONFIRMED',    -- Confirmed on blockchain
   'FAILED',       -- Transaction failed
   'EXPIRED',      -- Expired without confirmation
   'CANCELLED'     -- Cancelled before submission
);
COMMENT ON TYPE transaction_status IS 'Blockchain transaction status';

-- KYC status
CREATE TYPE kyc_status AS ENUM (
   'NOT_STARTED',  -- KYC not initiated
   'PENDING',      -- Documents submitted
   'IN_REVIEW',    -- Under review
   'APPROVED',     -- KYC approved
   'REJECTED',     -- KYC rejected
   'EXPIRED'       -- KYC expired
);
COMMENT ON TYPE kyc_status IS 'Know Your Customer verification status';

-- Event status
CREATE TYPE event_status AS ENUM (
   'DRAFT',        -- Event being planned
   'PUBLISHED',    -- Event published
   'ON_SALE',      -- Tickets on sale
   'SOLD_OUT',     -- All tickets sold
   'IN_PROGRESS',  -- Event happening now
   'COMPLETED',    -- Event finished
   'CANCELLED'     -- Event cancelled
);
COMMENT ON TYPE event_status IS 'Event lifecycle status';

-- Priority level
CREATE TYPE priority_level AS ENUM (
   'LOW',
   'MEDIUM',
   'HIGH',
   'CRITICAL'
);
COMMENT ON TYPE priority_level IS 'Priority levels for various operations';

-- =============================================
-- Utility Functions
-- =============================================
-- Reusable functions used across the database

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION update_updated_at_column() IS 'Trigger function to update updated_at timestamp';

-- Function to generate random codes
CREATE OR REPLACE FUNCTION generate_random_code(length INTEGER DEFAULT 6)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION generate_random_code(INTEGER) IS 'Generate random alphanumeric code';

-- Function to calculate age in years
CREATE OR REPLACE FUNCTION calculate_age(birth_date DATE)
RETURNS INTEGER AS $$
BEGIN
   RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, birth_date));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
COMMENT ON FUNCTION calculate_age(DATE) IS 'Calculate age in years from birth date';

-- Function to validate JSON schema
CREATE OR REPLACE FUNCTION validate_json_schema(data JSONB, schema JSONB)
RETURNS BOOLEAN AS $$
BEGIN
   -- Simplified validation - extend as needed
   RETURN data IS NOT NULL AND jsonb_typeof(data) = 'object';
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION validate_json_schema(JSONB, JSONB) IS 'Validate JSON data against schema';

-- Function to anonymize email
CREATE OR REPLACE FUNCTION anonymize_email(email_address TEXT)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION anonymize_email(TEXT) IS 'Anonymize email address for privacy';

-- =============================================
-- Database Configuration
-- =============================================
-- Set database-wide configuration parameters

-- Set default search path
ALTER DATABASE tickettoken_db SET search_path TO public, blockchain, compliance;

-- Enable row-level security by default for new tables
ALTER DATABASE tickettoken_db SET row_security TO on;

-- Set statement timeout to prevent long-running queries
ALTER DATABASE tickettoken_db SET statement_timeout TO '30s';

-- Set lock timeout
ALTER DATABASE tickettoken_db SET lock_timeout TO '10s';

-- Enable query tracking for performance monitoring
ALTER DATABASE tickettoken_db SET track_activities TO on;
ALTER DATABASE tickettoken_db SET track_counts TO on;
ALTER DATABASE tickettoken_db SET track_functions TO 'all';

-- Set timezone to UTC
ALTER DATABASE tickettoken_db SET timezone TO 'UTC';

-- =============================================
-- Create Base Tables for References
-- =============================================
-- These tables are referenced by many others

-- Create users table if not exists (minimal structure)
CREATE TABLE IF NOT EXISTS public.users (
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   email VARCHAR(255) UNIQUE NOT NULL,
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tickets table if not exists (minimal structure)
CREATE TABLE IF NOT EXISTS public.tickets (
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Row Level Security (RLS) Policies Framework
-- =============================================
-- Set up framework for row-level security

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create a function to get current user id from JWT
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID AS $$
BEGIN
   -- This would normally extract from JWT
   -- Placeholder implementation
   RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION auth.user_id() IS 'Get current authenticated user ID';

-- =============================================
-- Audit Framework
-- =============================================
-- Set up audit logging framework

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit.audit_log (
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   table_name TEXT NOT NULL,
   operation TEXT NOT NULL,
   user_id UUID,
   changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   old_data JSONB,
   new_data JSONB,
   query TEXT,
   ip_address INET
);

CREATE INDEX idx_audit_log_table_name ON audit.audit_log(table_name);
CREATE INDEX idx_audit_log_user_id ON audit.audit_log(user_id);
CREATE INDEX idx_audit_log_changed_at ON audit.audit_log(changed_at);

-- =============================================
-- Performance Indexes
-- =============================================
-- Create indexes for foreign key references that don't have them

-- Add GIN indexes for JSONB columns (will be used across many tables)
-- These will be created on specific tables as needed

-- =============================================
-- Grants and Permissions
-- =============================================
-- Set up initial permissions structure

-- Create application role if not exists
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tickettoken_app') THEN
       CREATE ROLE tickettoken_app;
   END IF;
END
$$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public, blockchain, compliance, analytics, audit, cache TO tickettoken_app;

-- Grant table permissions (will be extended as tables are created)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA blockchain TO tickettoken_app;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA blockchain TO tickettoken_app;

-- =============================================
-- Migration Metadata
-- =============================================
-- Track migration history

CREATE TABLE IF NOT EXISTS public.schema_migrations (
   version INTEGER PRIMARY KEY,
   name TEXT NOT NULL,
   applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (1, '001_initial_schema.sql')
ON CONFLICT (version) DO NOTHING;

-- =============================================
-- Completion
-- =============================================
-- If we got here, everything succeeded

-- Commit the transaction

-- =============================================
-- Rollback Instructions
-- =============================================
/*
To rollback this migration, run:


-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 1;

-- Drop schemas (CASCADE will drop all objects within)
DROP SCHEMA IF EXISTS cache CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS analytics CASCADE;
DROP SCHEMA IF EXISTS compliance CASCADE;
DROP SCHEMA IF EXISTS blockchain CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "hstore";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS "btree_gist";
DROP EXTENSION IF EXISTS "citext";

-- Drop domains
DROP DOMAIN IF EXISTS url;
DROP DOMAIN IF EXISTS positive_numeric;
DROP DOMAIN IF EXISTS VARCHAR(44);
DROP DOMAIN IF EXISTS VARCHAR(20);
DROP DOMAIN IF EXISTS email;

-- Drop types
DROP TYPE IF EXISTS priority_level;
DROP TYPE IF EXISTS event_status;
DROP TYPE IF EXISTS kyc_status;
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS ticket_status;
DROP TYPE IF EXISTS user_status;

-- Drop functions
DROP FUNCTION IF EXISTS auth.user_id();
DROP FUNCTION IF EXISTS anonymize_email(TEXT);
DROP FUNCTION IF EXISTS validate_json_schema(JSONB, JSONB);
DROP FUNCTION IF EXISTS calculate_age(DATE);
DROP FUNCTION IF EXISTS generate_random_code(INTEGER);
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop role
DROP ROLE IF EXISTS tickettoken_app;

*/
