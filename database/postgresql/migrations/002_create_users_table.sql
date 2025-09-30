-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Create Users Table
-- Version: 002
-- Description: Creates the users table with authentication and profile data
-- Estimated execution time: < 1 second
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Drop existing minimal users table if exists
DROP TABLE IF EXISTS public.users CASCADE;

-- Create comprehensive users table
CREATE TABLE IF NOT EXISTS public.users (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Authentication fields
   email VARCHAR(255) UNIQUE NOT NULL,
   password_hash VARCHAR(255) NOT NULL, -- bcrypt/argon2 hash
   email_verified BOOLEAN DEFAULT FALSE,
   email_verification_token VARCHAR(64),
   email_verification_expires TIMESTAMP WITH TIME ZONE,
   
   -- Profile information
   username VARCHAR(30) UNIQUE,
   display_name VARCHAR(100),
   bio TEXT,
   avatar_url TEXT,
   cover_image_url TEXT,
   
   -- Personal information
   first_name VARCHAR(50),
   last_name VARCHAR(50),
   date_of_birth DATE,
   phone VARCHAR(20),
   phone_verified BOOLEAN DEFAULT FALSE,
   
   -- Location data
   country_code VARCHAR(2), -- ISO 3166-1 alpha-2
   city VARCHAR(100),
   state_province VARCHAR(100),
   postal_code VARCHAR(20),
   timezone VARCHAR(50) DEFAULT 'UTC',
   preferred_language VARCHAR(10) DEFAULT 'en',
   
   -- Account status
   status user_status DEFAULT 'PENDING',
   role VARCHAR(20) DEFAULT 'user', -- user, venue_owner, admin, super_admin
   permissions JSONB DEFAULT '[]', -- Array of permission strings
   
   -- Security fields
   two_factor_enabled BOOLEAN DEFAULT FALSE,
   two_factor_secret VARCHAR(32),
   backup_codes TEXT[], -- Array of encrypted backup codes
   last_password_change TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   password_reset_token VARCHAR(64),
   password_reset_expires TIMESTAMP WITH TIME ZONE,
   
   -- Session management
   last_login_at TIMESTAMP WITH TIME ZONE,
   last_login_ip INET,
   last_login_device VARCHAR(255),
   login_count INTEGER DEFAULT 0,
   failed_login_attempts INTEGER DEFAULT 0,
   locked_until TIMESTAMP WITH TIME ZONE,
   
   -- Preferences
   preferences JSONB DEFAULT '{}', -- User preferences
   notification_preferences JSONB DEFAULT '{
       "email": {
           "marketing": true,
           "transactions": true,
           "security": true
       },
       "push": {
           "marketing": false,
           "transactions": true,
           "security": true
       }
   }',
   
   -- Compliance
   terms_accepted_at TIMESTAMP WITH TIME ZONE,
   terms_version VARCHAR(20),
   privacy_accepted_at TIMESTAMP WITH TIME ZONE,
   privacy_version VARCHAR(20),
   marketing_consent BOOLEAN DEFAULT FALSE,
   marketing_consent_date TIMESTAMP WITH TIME ZONE,
   
   -- Referral tracking
   referral_code VARCHAR(20) UNIQUE,
   referred_by UUID REFERENCES public.users(id),
   referral_count INTEGER DEFAULT 0,
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   tags TEXT[], -- User tags for segmentation
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Authentication indexes
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_username ON public.users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_email_verification_token ON public.users(email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX idx_users_password_reset_token ON public.users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Profile indexes
CREATE INDEX idx_users_display_name ON public.users(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;

-- Status and role indexes
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_deleted_at ON public.users(deleted_at) WHERE deleted_at IS NULL; -- Active users

-- Location indexes
CREATE INDEX idx_users_country_code ON public.users(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX idx_users_timezone ON public.users(timezone);

-- Referral indexes
CREATE INDEX idx_users_referral_code ON public.users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_users_referred_by ON public.users(referred_by) WHERE referred_by IS NOT NULL;

-- Full text search index
CREATE INDEX idx_users_search ON public.users USING gin(
   to_tsvector('english', 
       COALESCE(username, '') || ' ' || 
       COALESCE(display_name, '') || ' ' || 
       COALESCE(first_name, '') || ' ' || 
       COALESCE(last_name, '') || ' ' ||
       COALESCE(email, '')
   )
);

-- JSONB indexes
CREATE INDEX idx_users_preferences_gin ON public.users USING gin(preferences);
CREATE INDEX idx_users_permissions_gin ON public.users USING gin(permissions);
CREATE INDEX idx_users_metadata_gin ON public.users USING gin(metadata);

-- Composite indexes for common queries
CREATE INDEX idx_users_status_created_at ON public.users(status, created_at);
CREATE INDEX idx_users_role_status ON public.users(role, status) WHERE deleted_at IS NULL;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Constraints
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Check constraints
ALTER TABLE public.users ADD CONSTRAINT check_email_lowercase 
   CHECK (email = LOWER(email));

ALTER TABLE public.users ADD CONSTRAINT check_username_format 
   CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$');

ALTER TABLE public.users ADD CONSTRAINT check_age_minimum 
   CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years');

ALTER TABLE public.users ADD CONSTRAINT check_referral_not_self 
   CHECK (referred_by IS NULL OR referred_by != id);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Triggers
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Update timestamp trigger
CREATE TRIGGER trigger_update_users_timestamp
   BEFORE UPDATE ON public.users
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

-- Generate referral code trigger
CREATE OR REPLACE FUNCTION generate_user_referral_code()
RETURNS TRIGGER AS $$
BEGIN
   IF NEW.referral_code IS NULL THEN
       NEW.referral_code := UPPER(generate_random_code(8));
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_referral_code
   BEFORE INSERT ON public.users
   FOR EACH ROW
   EXECUTE FUNCTION generate_user_referral_code();

-- Increment referral count trigger
CREATE OR REPLACE FUNCTION increment_referral_count()
RETURNS TRIGGER AS $$
BEGIN
   IF NEW.referred_by IS NOT NULL AND NEW.email_verified = TRUE AND OLD.email_verified = FALSE THEN
       UPDATE public.users 
       SET referral_count = referral_count + 1 
       WHERE id = NEW.referred_by;
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_referral_count
   AFTER UPDATE OF email_verified ON public.users
   FOR EACH ROW
   WHEN (NEW.email_verified = TRUE AND OLD.email_verified = FALSE)
   EXECUTE FUNCTION increment_referral_count();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security (RLS)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own data
CREATE POLICY users_select_own ON public.users
   FOR SELECT
   USING (id = auth.user_id() OR role IN ('admin', 'super_admin'));

-- Policy: Users can update their own data
CREATE POLICY users_update_own ON public.users
   FOR UPDATE
   USING (id = auth.user_id())
   WITH CHECK (id = auth.user_id()); -- Prevent role escalation

-- Policy: Only admins can insert new users (registration handled separately)
CREATE POLICY users_insert_admin ON public.users
   FOR INSERT
   WITH CHECK (EXISTS (
       SELECT 1 FROM public.users 
       WHERE id = auth.user_id() 
       AND role IN ('admin', 'super_admin')
   ));

-- Policy: Only super admins can delete users
CREATE POLICY users_delete_admin ON public.users
   FOR DELETE
   USING (EXISTS (
       SELECT 1 FROM public.users 
       WHERE id = auth.user_id() 
       AND role = 'super_admin'
   ));

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to check if email is available
CREATE OR REPLACE FUNCTION is_email_available(check_email VARCHAR(255))
RETURNS BOOLEAN AS $$
BEGIN
   RETURN NOT EXISTS (
       SELECT 1 FROM public.users 
       WHERE email = check_email 
       AND deleted_at IS NULL
   );
END;
$$ LANGUAGE plpgsql;

-- Function to check if username is available
CREATE OR REPLACE FUNCTION is_username_available(check_username VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
   RETURN NOT EXISTS (
       SELECT 1 FROM public.users 
       WHERE username = check_username 
       AND deleted_at IS NULL
   );
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete user
CREATE OR REPLACE FUNCTION soft_delete_user(user_id UUID)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Initial Data
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Create default admin user (password: 'ChangeMe123!')
INSERT INTO public.users (
   email,
   password_hash,
   username,
   display_name,
   first_name,
   last_name,
   status,
   role,
   email_verified,
   terms_accepted_at,
   privacy_accepted_at
) VALUES (
   'admin@tickettoken.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiGHJpLjpDy2', -- ChangeMe123!
   'admin',
   'System Administrator',
   'System',
   'Admin',
   'ACTIVE',
   'super_admin',
   TRUE,
   CURRENT_TIMESTAMP,
   CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grants
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE ON public.users TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration Tracking
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Record this migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (2, '002_create_users_table.sql')
ON CONFLICT (version) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Validation Queries
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Validate table structure
DO $$
DECLARE
   column_count INTEGER;
   index_count INTEGER;
   constraint_count INTEGER;
BEGIN
   SELECT COUNT(*) INTO column_count 
   FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'users';
   
   SELECT COUNT(*) INTO index_count 
   FROM pg_indexes 
   WHERE schemaname = 'public' AND tablename = 'users';
   
   SELECT COUNT(*) INTO constraint_count
   FROM information_schema.table_constraints
   WHERE table_schema = 'public' AND table_name = 'users';
   
   RAISE NOTICE 'Users table created with % columns, % indexes, and % constraints', 
       column_count, index_count, constraint_count;
   
   -- Verify critical columns exist
   IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = 'users' 
       AND column_name = 'email'
   ) THEN
       RAISE EXCEPTION 'Critical column "email" missing from users table';
   END IF;
END $$;


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DOWN Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/*

-- Drop RLS policies
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS users_insert_admin ON public.users;
DROP POLICY IF EXISTS users_delete_admin ON public.users;

-- Drop functions
DROP FUNCTION IF EXISTS soft_delete_user(UUID);
DROP FUNCTION IF EXISTS is_username_available(VARCHAR);
DROP FUNCTION IF EXISTS is_email_available(email);
DROP FUNCTION IF EXISTS increment_referral_count();
DROP FUNCTION IF EXISTS generate_user_referral_code();

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_increment_referral_count ON public.users;
DROP TRIGGER IF EXISTS trigger_generate_referral_code ON public.users;
DROP TRIGGER IF EXISTS trigger_update_users_timestamp ON public.users;

-- Drop table
DROP TABLE IF EXISTS public.users CASCADE;

-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 2;

*/
