-- =============================================
-- Migration: Add Foreign Key Constraints and Basic Indexes
-- Version: 008  
-- Description: Adds foreign key constraints that weren't defined inline and prepares for complex constraints
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add any missing foreign key constraints that weren't created inline
-- (Most were created inline, so this focuses on cross-table constraints that couldn't be)

-- Add basic check constraints
ALTER TABLE public.tickets 
  ADD CONSTRAINT check_ticket_price CHECK (price >= 0);

ALTER TABLE public.events
  ADD CONSTRAINT check_event_dates CHECK (start_date <= end_date);

ALTER TABLE public.venues
  ADD CONSTRAINT check_venue_capacity CHECK (capacity > 0);

-- Add unique constraints for business logic
ALTER TABLE public.users
  ADD CONSTRAINT unique_user_email UNIQUE (email);

ALTER TABLE public.venues  
  ADD CONSTRAINT unique_venue_slug UNIQUE (slug);

-- Record migration
INSERT INTO public.schema_migrations (version, name)
VALUES (8, '008_add_foreign_key_constraints.sql')
ON CONFLICT (version) DO NOTHING;
