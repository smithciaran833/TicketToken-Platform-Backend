-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Create Events and Related Tables
-- Version: 004
-- Description: Creates events table and all related event management tables
-- Estimated execution time: < 2 seconds
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


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create events table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.events (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Venue relationship
   venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
   venue_layout_id UUID REFERENCES public.venue_layouts(id),
   
   -- Event information
   name VARCHAR(300) NOT NULL,
   slug VARCHAR(300) NOT NULL,
   description TEXT,
   short_description VARCHAR(500),
   event_type VARCHAR(50) NOT NULL DEFAULT 'single', -- single, recurring, series
   
   -- Category and classification
   primary_category_id UUID, -- Will reference event_categories
   secondary_category_ids UUID[], -- Array of additional categories
   tags TEXT[],
   
   -- Status and visibility
   status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
   visibility VARCHAR(20) DEFAULT 'PUBLIC', -- PUBLIC, PRIVATE, UNLISTED
   is_featured BOOLEAN DEFAULT FALSE,
   priority_score INTEGER DEFAULT 0, -- For sorting/ranking
   
   -- Media
   banner_image_url TEXT,
   thumbnail_image_url TEXT,
   image_gallery JSONB DEFAULT '[]',
   video_url TEXT,
   virtual_event_url TEXT,
   
   -- Event details
   age_restriction INTEGER DEFAULT 0,
   dress_code VARCHAR(100),
   special_requirements TEXT[],
   accessibility_info JSONB DEFAULT '{}',
   
   -- Blockchain integration
   collection_address VARCHAR(44),
   mint_authority VARCHAR(44),
   royalty_percentage NUMERIC(5, 2),
   
   -- Virtual/hybrid event settings
   is_virtual BOOLEAN DEFAULT FALSE,
   is_hybrid BOOLEAN DEFAULT FALSE,
   streaming_platform VARCHAR(50),
   streaming_config JSONB DEFAULT '{}',
   
   -- Cancellation and refund policy
   cancellation_policy TEXT,
   refund_policy TEXT,
   cancellation_deadline_hours INTEGER DEFAULT 24,
   
   -- SEO and marketing
   meta_title VARCHAR(70),
   meta_description VARCHAR(160),
   meta_keywords TEXT[],
   
   -- Analytics
   view_count INTEGER DEFAULT 0,
   interest_count INTEGER DEFAULT 0,
   share_count INTEGER DEFAULT 0,
   
   -- Metadata
   external_id VARCHAR(100), -- For third-party integrations
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_by UUID REFERENCES public.users(id),
   updated_by UUID REFERENCES public.users(id),
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   deleted_at TIMESTAMP WITH TIME ZONE,
   
   -- Constraints
   CONSTRAINT valid_event_status CHECK (status IN (
       'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
       'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'
   )),
   CONSTRAINT valid_event_type CHECK (event_type IN ('single', 'recurring', 'series')),
   CONSTRAINT valid_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'UNLISTED'))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_categories table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_categories (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Category hierarchy
   parent_id UUID REFERENCES public.event_categories(id) ON DELETE CASCADE,
   
   -- Category information
   name VARCHAR(100) NOT NULL,
   slug VARCHAR(100) UNIQUE NOT NULL,
   description TEXT,
   icon VARCHAR(50), -- Icon name/class
   color VARCHAR(7), -- Hex color
   
   -- Display settings
   display_order INTEGER DEFAULT 0,
   is_active BOOLEAN DEFAULT TRUE,
   is_featured BOOLEAN DEFAULT FALSE,
   
   -- SEO
   meta_title VARCHAR(70),
   meta_description VARCHAR(160),
   
   -- Statistics
   event_count INTEGER DEFAULT 0,
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for primary category
ALTER TABLE public.events 
ADD CONSTRAINT fk_primary_category 
FOREIGN KEY (primary_category_id) 
REFERENCES public.event_categories(id) 
ON DELETE SET NULL;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_schedules table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_schedules (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
   
   -- Schedule information
   starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
   ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
   doors_open_at TIMESTAMP WITH TIME ZONE,
   
   -- Recurring event fields
   is_recurring BOOLEAN DEFAULT FALSE,
   recurrence_rule TEXT, -- RRULE format
   recurrence_end_date DATE,
   occurrence_number INTEGER, -- For series tracking
   
   -- Time zone handling
   timezone VARCHAR(50) NOT NULL,
   utc_offset INTEGER, -- Minutes from UTC
   
   -- Status for this specific occurrence
   status VARCHAR(20) DEFAULT 'SCHEDULED',
   status_reason TEXT,
   
   -- Capacity override for this schedule
   capacity_override INTEGER,
   
   -- Check-in settings
   check_in_opens_at TIMESTAMP WITH TIME ZONE,
   check_in_closes_at TIMESTAMP WITH TIME ZONE,
   
   -- Metadata
   notes TEXT,
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_schedule_dates CHECK (ends_at > starts_at),
   CONSTRAINT valid_doors_open CHECK (doors_open_at IS NULL OR doors_open_at <= starts_at),
   CONSTRAINT valid_schedule_status CHECK (status IN (
       'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 
       'CANCELLED', 'POSTPONED', 'RESCHEDULED'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_capacity table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_capacity (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
   schedule_id UUID REFERENCES public.event_schedules(id) ON DELETE CASCADE,
   
   -- Section/tier information
   section_name VARCHAR(100) NOT NULL,
   section_code VARCHAR(20),
   tier VARCHAR(50), -- VIP, Premium, Standard, etc.
   
   -- Capacity numbers
   total_capacity INTEGER NOT NULL,
   available_capacity INTEGER NOT NULL,
   reserved_capacity INTEGER DEFAULT 0,
   buffer_capacity INTEGER DEFAULT 0, -- Held back for various reasons
   
   -- Sales tracking
   sold_count INTEGER DEFAULT 0,
   pending_count INTEGER DEFAULT 0, -- In cart but not purchased
   
   -- Row/seat configuration (optional)
   row_config JSONB, -- {"rows": [{"name": "A", "seats": 20}, ...]}
   seat_map JSONB, -- Detailed seat availability
   
   -- Status
   is_active BOOLEAN DEFAULT TRUE,
   is_visible BOOLEAN DEFAULT TRUE,
   
   -- Constraints
   minimum_purchase INTEGER DEFAULT 1,
   maximum_purchase INTEGER,
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_capacity CHECK (
       total_capacity >= 0 AND 
       available_capacity >= 0 AND 
       available_capacity <= total_capacity
   ),
   CONSTRAINT unique_event_section UNIQUE(event_id, section_name, schedule_id)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_pricing table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_pricing (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
   schedule_id UUID REFERENCES public.event_schedules(id) ON DELETE CASCADE,
   capacity_id UUID REFERENCES public.event_capacity(id) ON DELETE CASCADE,
   
   -- Pricing tier
   name VARCHAR(100) NOT NULL,
   description TEXT,
   tier VARCHAR(50),
   
   -- Price information
   base_price NUMERIC(10, 2) NOT NULL,
   service_fee NUMERIC(10, 2) DEFAULT 0,
   facility_fee NUMERIC(10, 2) DEFAULT 0,
   tax_rate NUMERIC(5, 4) DEFAULT 0, -- Percentage as decimal
   
   -- Dynamic pricing
   is_dynamic BOOLEAN DEFAULT FALSE,
   min_price NUMERIC(10, 2),
   max_price NUMERIC(10, 2),
   price_adjustment_rules JSONB DEFAULT '{}',
   current_price NUMERIC(10, 2), -- Current dynamic price
   
   -- Time-based pricing
   early_bird_price NUMERIC(10, 2),
   early_bird_ends_at TIMESTAMP WITH TIME ZONE,
   last_minute_price NUMERIC(10, 2),
   last_minute_starts_at TIMESTAMP WITH TIME ZONE,
   
   -- Group pricing
   group_size_min INTEGER,
   group_discount_percentage NUMERIC(5, 2),
   
   -- Currency
   currency VARCHAR(3) DEFAULT 'USD',
   
   -- Sales period
   sales_start_at TIMESTAMP WITH TIME ZONE,
   sales_end_at TIMESTAMP WITH TIME ZONE,
   
   -- Quantity limits
   max_per_order INTEGER,
   max_per_customer INTEGER,
   
   -- Status
   is_active BOOLEAN DEFAULT TRUE,
   is_visible BOOLEAN DEFAULT TRUE,
   
   -- Display settings
   display_order INTEGER DEFAULT 0,
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_base_price CHECK (base_price >= 0),
   CONSTRAINT valid_dynamic_range CHECK (
       (is_dynamic = FALSE) OR 
       (min_price IS NOT NULL AND max_price IS NOT NULL AND min_price <= max_price)
   ),
   CONSTRAINT valid_early_bird CHECK (
       early_bird_price IS NULL OR 
       (early_bird_price < base_price AND early_bird_ends_at IS NOT NULL)
   )
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create event_metadata table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_metadata (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
   
   -- Performer/artist information
   performers JSONB DEFAULT '[]', -- Array of performer objects
   headliner VARCHAR(200),
   supporting_acts TEXT[],
   
   -- Production information
   production_company VARCHAR(200),
   technical_requirements JSONB DEFAULT '{}',
   stage_setup_time_hours INTEGER,
   
   -- Sponsorship
   sponsors JSONB DEFAULT '[]', -- Array of sponsor objects
   primary_sponsor VARCHAR(200),
   
   -- Legal and compliance
   performance_rights_org VARCHAR(100),
   licensing_requirements TEXT[],
   insurance_requirements JSONB DEFAULT '{}',
   
   -- Marketing materials
   press_release TEXT,
   marketing_copy JSONB DEFAULT '{}', -- Different versions
   social_media_copy JSONB DEFAULT '{}',
   
   -- Technical specifications
   sound_requirements JSONB DEFAULT '{}',
   lighting_requirements JSONB DEFAULT '{}',
   video_requirements JSONB DEFAULT '{}',
   
   -- Catering and hospitality
   catering_requirements JSONB DEFAULT '{}',
   rider_requirements JSONB DEFAULT '{}',
   
   -- Financial
   production_budget NUMERIC(12, 2),
   marketing_budget NUMERIC(12, 2),
   projected_revenue NUMERIC(12, 2),
   break_even_capacity INTEGER,
   
   -- Historical data
   previous_events JSONB DEFAULT '[]', -- Similar events for reference
   
   -- Custom fields
   custom_fields JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT unique_event_metadata UNIQUE(event_id)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Events indexes
CREATE INDEX idx_events_venue_id ON public.events(venue_id);
CREATE INDEX idx_events_slug ON public.events(slug);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_primary_category ON public.events(primary_category_id);
CREATE INDEX idx_events_created_at ON public.events(created_at);
CREATE INDEX idx_events_deleted_at ON public.events(deleted_at);
CREATE INDEX idx_events_featured ON public.events(is_featured, priority_score);
CREATE INDEX idx_events_search ON public.events USING gin(
   to_tsvector('english', 
       COALESCE(name, '') || ' ' || 
       COALESCE(description, '') || ' ' || 
       COALESCE(short_description, '')
   )
);

-- Event categories indexes
CREATE INDEX idx_event_categories_parent ON public.event_categories(parent_id);
CREATE INDEX idx_event_categories_slug ON public.event_categories(slug);
CREATE INDEX idx_event_categories_active ON public.event_categories(is_active);

-- Event schedules indexes
CREATE INDEX idx_event_schedules_event_id ON public.event_schedules(event_id);
CREATE INDEX idx_event_schedules_starts_at ON public.event_schedules(starts_at);
CREATE INDEX idx_event_schedules_status ON public.event_schedules(status);
CREATE INDEX idx_event_schedules_upcoming ON public.event_schedules(starts_at);

-- Event capacity indexes
CREATE INDEX idx_event_capacity_event_id ON public.event_capacity(event_id);
CREATE INDEX idx_event_capacity_schedule_id ON public.event_capacity(schedule_id);
CREATE INDEX idx_event_capacity_available ON public.event_capacity(available_capacity);

-- Event pricing indexes
CREATE INDEX idx_event_pricing_event_id ON public.event_pricing(event_id);
CREATE INDEX idx_event_pricing_schedule_id ON public.event_pricing(schedule_id);
CREATE INDEX idx_event_pricing_capacity_id ON public.event_pricing(capacity_id);
CREATE INDEX idx_event_pricing_active ON public.event_pricing(is_active, sales_start_at, sales_end_at);

-- Event metadata indexes
CREATE INDEX idx_event_metadata_event_id ON public.event_metadata(event_id);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Triggers
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Update timestamp triggers
CREATE TRIGGER trigger_update_events_timestamp
   BEFORE UPDATE ON public.events
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_event_categories_timestamp
   BEFORE UPDATE ON public.event_categories
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_event_schedules_timestamp
   BEFORE UPDATE ON public.event_schedules
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_event_capacity_timestamp
   BEFORE UPDATE ON public.event_capacity
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_event_pricing_timestamp
   BEFORE UPDATE ON public.event_pricing
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_event_metadata_timestamp
   BEFORE UPDATE ON public.event_metadata
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

-- Generate event slug trigger
CREATE OR REPLACE FUNCTION generate_event_slug()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_event_slug
   BEFORE INSERT OR UPDATE OF name ON public.events
   FOR EACH ROW
   EXECUTE FUNCTION generate_event_slug();

-- Update available capacity trigger
CREATE OR REPLACE FUNCTION update_available_capacity()
RETURNS TRIGGER AS $$
BEGIN
   -- When sold_count or pending_count changes, update available_capacity
   NEW.available_capacity := NEW.total_capacity - NEW.sold_count - NEW.pending_count - NEW.reserved_capacity;
   
   -- Ensure available capacity doesn't go negative
   IF NEW.available_capacity < 0 THEN
       NEW.available_capacity := 0;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_available_capacity
   BEFORE INSERT OR UPDATE OF sold_count, pending_count, reserved_capacity, total_capacity 
   ON public.event_capacity
   FOR EACH ROW
   EXECUTE FUNCTION update_available_capacity();

-- Create event metadata automatically
CREATE OR REPLACE FUNCTION create_event_metadata()
RETURNS TRIGGER AS $$
BEGIN
   INSERT INTO public.event_metadata (event_id)
   VALUES (NEW.id)
   ON CONFLICT (event_id) DO NOTHING;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_event_metadata
   AFTER INSERT ON public.events
   FOR EACH ROW
   EXECUTE FUNCTION create_event_metadata();

-- Update category event count
CREATE OR REPLACE FUNCTION update_category_event_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_category_count
   AFTER INSERT OR UPDATE OF primary_category_id OR DELETE ON public.events
   FOR EACH ROW
   EXECUTE FUNCTION update_category_event_count();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to calculate total price including fees
CREATE OR REPLACE FUNCTION calculate_ticket_price(pricing_id UUID)
RETURNS NUMERIC AS $$
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
$$ LANGUAGE plpgsql;

-- Function to check event availability
CREATE OR REPLACE FUNCTION check_event_availability(
   p_event_id UUID,
   p_schedule_id UUID DEFAULT NULL,
   p_quantity INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Event Categories
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


INSERT INTO public.event_categories (name, slug, description, icon, color, display_order) VALUES
('Music', 'music', 'Concerts, festivals, and musical performances', 'music', '#FF6B6B', 1),
('Sports', 'sports', 'Sporting events and competitions', 'sports', '#4ECDC4', 2),
('Theater', 'theater', 'Plays, musicals, and theatrical performances', 'theater', '#45B7D1', 3),
('Comedy', 'comedy', 'Stand-up comedy and humor shows', 'comedy', '#F7DC6F', 4),
('Arts', 'arts', 'Art exhibitions, galleries, and cultural events', 'arts', '#BB8FCE', 5),
('Conference', 'conference', 'Business conferences and professional events', 'conference', '#85C1E2', 6),
('Workshop', 'workshop', 'Educational workshops and training sessions', 'workshop', '#73C6B6', 7),
('Festival', 'festival', 'Multi-day festivals and celebrations', 'festival', '#F8B739', 8),
('Family', 'family', 'Family-friendly events and activities', 'family', '#82E0AA', 9),
('Nightlife', 'nightlife', 'Clubs, parties, and late-night events', 'nightlife', '#D68910', 10)
ON CONFLICT (slug) DO NOTHING;

-- Add subcategories
INSERT INTO public.event_categories (parent_id, name, slug, description, display_order) 
SELECT id, 'Rock', 'music-rock', 'Rock concerts and performances', 1 
FROM public.event_categories WHERE slug = 'music'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.event_categories (parent_id, name, slug, description, display_order) 
SELECT id, 'Pop', 'music-pop', 'Pop music concerts and shows', 2 
FROM public.event_categories WHERE slug = 'music'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.event_categories (parent_id, name, slug, description, display_order) 
SELECT id, 'Basketball', 'sports-basketball', 'Basketball games and tournaments', 1 
FROM public.event_categories WHERE slug = 'sports'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.event_categories (parent_id, name, slug, description, display_order) 
SELECT id, 'Football', 'sports-football', 'Football matches and competitions', 2 
FROM public.event_categories WHERE slug = 'sports'
ON CONFLICT (slug) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Enable RLS on all tables
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_metadata ENABLE ROW LEVEL SECURITY;

-- Events policies
CREATE POLICY events_select_public ON public.events
   FOR SELECT
   USING (
       deleted_at IS NULL AND 
       (visibility = 'PUBLIC' OR visibility = 'UNLISTED' OR created_by = auth.user_id())
   );

CREATE POLICY events_insert_venue_staff ON public.events
   FOR INSERT
   WITH CHECK (
       EXISTS (
           SELECT 1 FROM public.venue_staff
           WHERE venue_id = events.venue_id
           AND user_id = auth.user_id()
           AND is_active = TRUE
       )
   );

CREATE POLICY events_update_venue_staff ON public.events
   FOR UPDATE
   USING (
       EXISTS (
           SELECT 1 FROM public.venue_staff
           WHERE venue_id = events.venue_id
           AND user_id = auth.user_id()
           AND is_active = TRUE
       )
   );

-- Public access to categories
CREATE POLICY categories_select_all ON public.event_categories
   FOR SELECT
   USING (is_active = TRUE);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grants
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


GRANT SELECT, INSERT, UPDATE ON public.events TO tickettoken_app;
GRANT SELECT ON public.event_categories TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_schedules TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_capacity TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_pricing TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.event_metadata TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration Tracking
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


INSERT INTO public.schema_migrations (version, name) 
VALUES (4, '004_create_events_table.sql')
ON CONFLICT (version) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Validation Queries
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


DO $$
DECLARE
   table_count INTEGER;
   index_count INTEGER;
   category_count INTEGER;
BEGIN
   -- Count tables created
   SELECT COUNT(*) INTO table_count
   FROM information_schema.tables
   WHERE table_schema = 'public' 
   AND table_name IN ('events', 'event_categories', 'event_schedules', 
                      'event_capacity', 'event_pricing', 'event_metadata');
   
   -- Count indexes created
   SELECT COUNT(*) INTO index_count
   FROM pg_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('events', 'event_categories', 'event_schedules', 
                     'event_capacity', 'event_pricing', 'event_metadata');
   
   -- Count categories inserted
   SELECT COUNT(*) INTO category_count
   FROM public.event_categories;
   
   RAISE NOTICE 'Events migration completed: % tables, % indexes, % categories', 
       table_count, index_count, category_count;
END $$;


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DOWN Migration (Commented Out)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/*

-- Drop RLS policies
DROP POLICY IF EXISTS events_select_public ON public.events;
DROP POLICY IF EXISTS events_insert_venue_staff ON public.events;
DROP POLICY IF EXISTS events_update_venue_staff ON public.events;
DROP POLICY IF EXISTS categories_select_all ON public.event_categories;

-- Drop functions
DROP FUNCTION IF EXISTS check_event_availability(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS calculate_ticket_price(UUID);
DROP FUNCTION IF EXISTS update_category_event_count();
DROP FUNCTION IF EXISTS create_event_metadata();
DROP FUNCTION IF EXISTS update_available_capacity();
DROP FUNCTION IF EXISTS generate_event_slug();

-- Drop tables in correct order
DROP TABLE IF EXISTS public.event_metadata CASCADE;
DROP TABLE IF EXISTS public.event_pricing CASCADE;
DROP TABLE IF EXISTS public.event_capacity CASCADE;
DROP TABLE IF EXISTS public.event_schedules CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.event_categories CASCADE;

-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 4;

*/
