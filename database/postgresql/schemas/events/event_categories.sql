-- TicketToken Platform - Event Categories Management Schema
-- Week 1, Day 4: Event Categorization and Classification
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive event categorization with hierarchy, genre-specific attributes,
--              search capabilities, and venue-specific customization

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- EVENT CATEGORIES MASTER TABLE
-- ==========================================
CREATE TABLE event_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_name VARCHAR(100) NOT NULL,
    category_slug VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID,
    category_level INTEGER DEFAULT 0 CHECK (category_level >= 0),
    category_path VARCHAR(500), -- Materialized path for hierarchy
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_system_category BOOLEAN DEFAULT false, -- Core categories that can't be deleted
    
    -- Display properties
    icon_name VARCHAR(50),
    icon_color VARCHAR(7), -- Hex color code
    background_color VARCHAR(7),
    display_image_url VARCHAR(500),
    banner_image_url VARCHAR(500),
    
    -- Age and content ratings
    min_age INTEGER CHECK (min_age >= 0),
    max_age INTEGER CHECK (max_age >= min_age),
    content_rating VARCHAR(10) CHECK (content_rating IN ('G', 'PG', 'PG-13', 'R', 'NC-17', 'NR')),
    parental_guidance_required BOOLEAN DEFAULT false,
    age_verification_required BOOLEAN DEFAULT false,
    
    -- Popularity metrics
    event_count INTEGER DEFAULT 0,
    total_tickets_sold INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    popularity_score DECIMAL(8,4) DEFAULT 0,
    trending_score DECIMAL(8,4) DEFAULT 0,
    last_event_date TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_category_parent FOREIGN KEY (parent_category_id) REFERENCES event_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_category_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_category_slug UNIQUE (category_slug),
    CONSTRAINT chk_category_no_self_parent CHECK (id != parent_category_id)
);

-- ==========================================
-- GENRE-SPECIFIC ATTRIBUTES
-- ==========================================
CREATE TABLE event_category_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_id UUID NOT NULL,
    attribute_type VARCHAR(50) NOT NULL, -- 'MUSIC_GENRE', 'SPORTS_LEAGUE', 'THEATER_TYPE', etc.
    attribute_name VARCHAR(100) NOT NULL,
    attribute_value VARCHAR(200) NOT NULL,
    attribute_data JSONB, -- Additional structured data
    is_primary BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_category_attr_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_attr_unique UNIQUE (category_id, attribute_type, attribute_name)
);

-- ==========================================
-- SEARCH TAGS AND KEYWORDS
-- ==========================================
CREATE TABLE event_category_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_id UUID NOT NULL,
    tag_name VARCHAR(50) NOT NULL,
    tag_type VARCHAR(20) DEFAULT 'GENERAL' CHECK (tag_type IN ('GENERAL', 'GENRE', 'MOOD', 'AUDIENCE', 'OCCASION', 'LOCATION')),
    search_weight DECIMAL(3,2) DEFAULT 1.00 CHECK (search_weight >= 0),
    is_featured BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_category_tag_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_tag_unique UNIQUE (category_id, tag_name)
);

-- ==========================================
-- EVENT-TO-CATEGORY MAPPINGS (Many-to-Many)
-- ==========================================
CREATE TABLE event_category_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    category_id UUID NOT NULL,
    is_primary_category BOOLEAN DEFAULT false,
    mapping_confidence DECIMAL(3,2) DEFAULT 1.00 CHECK (mapping_confidence >= 0 AND mapping_confidence <= 1),
    assigned_by VARCHAR(20) DEFAULT 'MANUAL' CHECK (assigned_by IN ('MANUAL', 'AUTO', 'ML_SUGGESTED', 'USER_GENERATED')),
    assigned_by_user UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_category_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_category_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_category_user FOREIGN KEY (assigned_by_user) REFERENCES users(id),
    CONSTRAINT uq_event_category_mapping UNIQUE (event_id, category_id)
);

-- ==========================================
-- VENUE-SPECIFIC CATEGORIES
-- ==========================================
CREATE TABLE venue_custom_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    venue_id UUID NOT NULL,
    category_id UUID NOT NULL,
    custom_name VARCHAR(100),
    custom_description TEXT,
    custom_icon VARCHAR(50),
    custom_color VARCHAR(7),
    is_enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    pricing_modifier DECIMAL(5,4) DEFAULT 1.0000, -- Venue-specific pricing adjustment
    capacity_modifier DECIMAL(5,4) DEFAULT 1.0000, -- Venue-specific capacity adjustment
    special_requirements TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_venue_category_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    CONSTRAINT fk_venue_category_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT fk_venue_category_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_venue_category_unique UNIQUE (venue_id, category_id)
);

-- ==========================================
-- CATEGORY POPULARITY TRACKING
-- ==========================================
CREATE TABLE event_category_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_id UUID NOT NULL,
    analytics_date DATE NOT NULL,
    event_count INTEGER DEFAULT 0,
    tickets_sold INTEGER DEFAULT 0,
    revenue DECIMAL(12,2) DEFAULT 0,
    unique_buyers INTEGER DEFAULT 0,
    avg_ticket_price DECIMAL(10,2) DEFAULT 0,
    search_impressions INTEGER DEFAULT 0,
    category_clicks INTEGER DEFAULT 0,
    click_through_rate DECIMAL(5,4) DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0,
    bounce_rate DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_category_analytics_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_analytics_date UNIQUE (category_id, analytics_date)
);

-- ==========================================
-- CATEGORY TRENDING METRICS
-- ==========================================
CREATE TABLE event_category_trending (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_id UUID NOT NULL,
    trending_period VARCHAR(20) NOT NULL CHECK (trending_period IN ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY')),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    search_volume INTEGER DEFAULT 0,
    event_creation_rate DECIMAL(8,4) DEFAULT 0,
    ticket_sales_velocity DECIMAL(8,4) DEFAULT 0,
    social_mentions INTEGER DEFAULT 0,
    trending_score DECIMAL(8,4) DEFAULT 0,
    trend_direction VARCHAR(10) CHECK (trend_direction IN ('UP', 'DOWN', 'STABLE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_category_trending_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_trending_period UNIQUE (category_id, trending_period, period_start)
);

-- ==========================================
-- CATEGORY SEARCH SUGGESTIONS
-- ==========================================
CREATE TABLE event_category_search_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    category_id UUID NOT NULL,
    suggestion_text VARCHAR(200) NOT NULL,
    suggestion_type VARCHAR(20) DEFAULT 'AUTO_COMPLETE' CHECK (suggestion_type IN ('AUTO_COMPLETE', 'RELATED', 'POPULAR', 'TRENDING')),
    search_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT fk_category_suggestion_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_suggestion_text UNIQUE (category_id, suggestion_text)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to get category hierarchy path
CREATE OR REPLACE FUNCTION get_category_path(p_category_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_path TEXT := '';
    v_current_id UUID := p_category_id;
    v_category_name VARCHAR(100);
    v_parent_id UUID;
BEGIN
    WHILE v_current_id IS NOT NULL LOOP
        SELECT category_name, parent_category_id
        INTO v_category_name, v_parent_id
        FROM event_categories
        WHERE id = v_current_id;
        
        IF v_path = '' THEN
            v_path := v_category_name;
        ELSE
            v_path := v_category_name || ' > ' || v_path;
        END IF;
        
        v_current_id := v_parent_id;
    END LOOP;
    
    RETURN v_path;
END;
$$ LANGUAGE plpgsql;

-- Function to get all child categories (recursive)
CREATE OR REPLACE FUNCTION get_child_categories(p_parent_id UUID)
RETURNS TABLE(category_id UUID, category_name VARCHAR, level INTEGER) AS $$
WITH RECURSIVE category_tree AS (
    -- Base case: direct children
    SELECT id, category_name, 1 as level
    FROM event_categories
    WHERE parent_category_id = p_parent_id AND is_active = true
    
    UNION ALL
    
    -- Recursive case: children of children
    SELECT ec.id, ec.category_name, ct.level + 1
    FROM event_categories ec
    INNER JOIN category_tree ct ON ec.parent_category_id = ct.category_id
    WHERE ec.is_active = true AND ct.level < 10 -- Prevent infinite recursion
)
SELECT category_id, category_name, level FROM category_tree;
$$ LANGUAGE sql;

-- Function to update category statistics
CREATE OR REPLACE FUNCTION update_category_stats(p_category_id UUID)
RETURNS VOID AS $$
DECLARE
    v_stats RECORD;
BEGIN
    SELECT 
        COUNT(DISTINCT ecm.event_id) as event_count,
        COALESCE(SUM(t.quantity), 0) as total_tickets_sold,
        COALESCE(SUM(t.total_amount), 0) as total_revenue,
        COALESCE(AVG(e.rating), 0) as avg_rating,
        MAX(e.event_date) as last_event_date
    INTO v_stats
    FROM event_category_mappings ecm
    LEFT JOIN events e ON ecm.event_id = e.id
    LEFT JOIN tickets t ON e.id = t.event_id AND t.status = 'SOLD'
    WHERE ecm.category_id = p_category_id;
    
    UPDATE event_categories
    SET 
        event_count = v_stats.event_count,
        total_tickets_sold = v_stats.total_tickets_sold,
        total_revenue = v_stats.total_revenue,
        avg_rating = v_stats.avg_rating,
        last_event_date = v_stats.last_event_date,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_category_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate category popularity score
CREATE OR REPLACE FUNCTION calculate_category_popularity(p_category_id UUID)
RETURNS DECIMAL(8,4) AS $$
DECLARE
    v_score DECIMAL(8,4) := 0;
    v_recent_events INTEGER;
    v_recent_sales INTEGER;
    v_search_volume INTEGER;
    v_social_mentions INTEGER;
BEGIN
    -- Get recent activity (last 30 days)
    SELECT 
        COUNT(DISTINCT ecm.event_id),
        COALESCE(SUM(t.quantity), 0),
        COALESCE(SUM(eca.search_impressions), 0)
    INTO v_recent_events, v_recent_sales, v_search_volume
    FROM event_category_mappings ecm
    LEFT JOIN events e ON ecm.event_id = e.id
    LEFT JOIN tickets t ON e.id = t.event_id AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'
    LEFT JOIN event_category_analytics eca ON ecm.category_id = eca.category_id AND eca.analytics_date >= CURRENT_DATE - INTERVAL '30 days'
    WHERE ecm.category_id = p_category_id;
    
    -- Calculate weighted score
    v_score := (v_recent_events * 0.3) + (v_recent_sales * 0.4) + (v_search_volume * 0.0001) + (COALESCE(v_social_mentions, 0) * 0.2);
    
    -- Normalize score (0-100 scale)
    v_score := LEAST(100, v_score);
    
    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Function to get trending categories
CREATE OR REPLACE FUNCTION get_trending_categories(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    category_id UUID,
    category_name VARCHAR,
    trending_score DECIMAL(8,4),
    trend_direction VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ec.id,
        ec.category_name,
        ect.trending_score,
        ect.trend_direction
    FROM event_categories ec
    JOIN event_category_trending ect ON ec.id = ect.category_id
    WHERE ect.trending_period = 'DAILY'
      AND ect.period_start >= CURRENT_DATE - INTERVAL '1 day'
      AND ec.is_active = true
    ORDER BY ect.trending_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to suggest categories for an event
CREATE OR REPLACE FUNCTION suggest_categories_for_event(
    p_event_name TEXT,
    p_event_description TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
    category_id UUID,
    category_name VARCHAR,
    confidence_score DECIMAL(3,2),
    match_reason TEXT
) AS $$
DECLARE
    v_search_text TEXT;
BEGIN
    v_search_text := LOWER(p_event_name || ' ' || COALESCE(p_event_description, ''));
    
    RETURN QUERY
    SELECT 
        ec.id,
        ec.category_name,
        CASE 
            WHEN ec.category_name ILIKE '%' || p_event_name || '%' THEN 0.95
            WHEN EXISTS (
                SELECT 1 FROM event_category_tags ect 
                WHERE ect.category_id = ec.id 
                AND v_search_text LIKE '%' || LOWER(ect.tag_name) || '%'
            ) THEN 0.80
            WHEN EXISTS (
                SELECT 1 FROM event_category_attributes eca 
                WHERE eca.category_id = ec.id 
                AND v_search_text LIKE '%' || LOWER(eca.attribute_value) || '%'
            ) THEN 0.70
            ELSE 0.50
        END as confidence_score,
        CASE 
            WHEN ec.category_name ILIKE '%' || p_event_name || '%' THEN 'Category name match'
            WHEN EXISTS (
                SELECT 1 FROM event_category_tags ect 
                WHERE ect.category_id = ec.id 
                AND v_search_text LIKE '%' || LOWER(ect.tag_name) || '%'
            ) THEN 'Tag match'
            WHEN EXISTS (
                SELECT 1 FROM event_category_attributes eca 
                WHERE eca.category_id = ec.id 
                AND v_search_text LIKE '%' || LOWER(eca.attribute_value) || '%'
            ) THEN 'Attribute match'
            ELSE 'General suggestion'
        END as match_reason
    FROM event_categories ec
    WHERE ec.is_active = true
    ORDER BY confidence_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get category hierarchy as JSON
CREATE OR REPLACE FUNCTION get_category_hierarchy_json()
RETURNS JSONB AS $$
WITH RECURSIVE category_tree AS (
    -- Root categories
    SELECT 
        id,
        category_name,
        parent_category_id,
        0 as level,
        jsonb_build_object(
            'id', id,
            'name', category_name,
            'slug', category_slug,
            'icon', icon_name,
            'color', icon_color,
            'children', '[]'::jsonb
        ) as category_json
    FROM event_categories
    WHERE parent_category_id IS NULL AND is_active = true
    
    UNION ALL
    
    -- Child categories
    SELECT 
        ec.id,
        ec.category_name,
        ec.parent_category_id,
        ct.level + 1,
        jsonb_build_object(
            'id', ec.id,
            'name', ec.category_name,
            'slug', ec.category_slug,
            'icon', ec.icon_name,
            'color', ec.icon_color,
            'children', '[]'::jsonb
        )
    FROM event_categories ec
    INNER JOIN category_tree ct ON ec.parent_category_id = ct.id
    WHERE ec.is_active = true AND ct.level < 10
)
SELECT jsonb_agg(category_json) 
FROM category_tree 
WHERE level = 0;
$$ LANGUAGE sql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_event_categories_parent ON event_categories(parent_category_id);
CREATE INDEX idx_event_categories_slug ON event_categories(category_slug);
CREATE INDEX idx_event_categories_active ON event_categories(is_active);
CREATE INDEX idx_event_categories_featured ON event_categories(is_featured);
CREATE INDEX idx_event_categories_level ON event_categories(category_level);
CREATE INDEX idx_event_categories_popularity ON event_categories(popularity_score DESC);
CREATE INDEX idx_event_categories_path ON event_categories USING GIN(category_path);

CREATE INDEX idx_category_attributes_category ON event_category_attributes(category_id);
CREATE INDEX idx_category_attributes_type ON event_category_attributes(attribute_type);
CREATE INDEX idx_category_attributes_name ON event_category_attributes(attribute_name);

CREATE INDEX idx_category_tags_category ON event_category_tags(category_id);
CREATE INDEX idx_category_tags_name ON event_category_tags(tag_name);
CREATE INDEX idx_category_tags_type ON event_category_tags(tag_type);
CREATE INDEX idx_category_tags_weight ON event_category_tags(search_weight DESC);

CREATE INDEX idx_event_category_mappings_event ON event_category_mappings(event_id);
CREATE INDEX idx_event_category_mappings_category ON event_category_mappings(category_id);
CREATE INDEX idx_event_category_mappings_primary ON event_category_mappings(is_primary_category);

CREATE INDEX idx_venue_categories_venue ON venue_custom_categories(venue_id);
CREATE INDEX idx_venue_categories_category ON venue_custom_categories(category_id);
CREATE INDEX idx_venue_categories_enabled ON venue_custom_categories(is_enabled);

CREATE INDEX idx_category_analytics_category ON event_category_analytics(category_id);
CREATE INDEX idx_category_analytics_date ON event_category_analytics(analytics_date);

CREATE INDEX idx_category_trending_category ON event_category_trending(category_id);
CREATE INDEX idx_category_trending_period ON event_category_trending(trending_period, period_start);
CREATE INDEX idx_category_trending_score ON event_category_trending(trending_score DESC);

CREATE INDEX idx_category_suggestions_category ON event_category_search_suggestions(category_id);
CREATE INDEX idx_category_suggestions_text ON event_category_search_suggestions(suggestion_text);
CREATE INDEX idx_category_suggestions_active ON event_category_search_suggestions(is_active);

-- Text search indexes
CREATE INDEX idx_event_categories_search ON event_categories USING GIN(to_tsvector('english', category_name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_category_tags_search ON event_category_tags USING GIN(to_tsvector('english', tag_name));

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_category_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_categories_updated
    BEFORE UPDATE ON event_categories
    FOR EACH ROW EXECUTE FUNCTION update_category_timestamp();

CREATE TRIGGER trg_venue_categories_updated
    BEFORE UPDATE ON venue_custom_categories
    FOR EACH ROW EXECUTE FUNCTION update_category_timestamp();

-- Trigger to update category path when hierarchy changes
CREATE OR REPLACE FUNCTION update_category_path()
RETURNS TRIGGER AS $$
BEGIN
    NEW.category_path = get_category_path(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_path_update
    BEFORE INSERT OR UPDATE OF parent_category_id, category_name ON event_categories
    FOR EACH ROW EXECUTE FUNCTION update_category_path();

-- Trigger to update tag usage count
CREATE OR REPLACE FUNCTION update_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE event_category_tags
        SET usage_count = usage_count + 1
        WHERE category_id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE event_category_tags
        SET usage_count = GREATEST(0, usage_count - 1)
        WHERE category_id = OLD.category_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_category_mapping_tag_usage
    AFTER INSERT OR DELETE ON event_category_mappings
    FOR EACH ROW EXECUTE FUNCTION update_tag_usage();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for category hierarchy with statistics
CREATE VIEW v_category_hierarchy AS
WITH RECURSIVE category_tree AS (
    SELECT 
        id,
        category_name,
        category_slug,
        parent_category_id,
        0 as level,
        category_name as full_path,
        event_count,
        popularity_score,
        is_featured
    FROM event_categories
    WHERE parent_category_id IS NULL AND is_active = true
    
    UNION ALL
    
    SELECT 
        ec.id,
        ec.category_name,
        ec.category_slug,
        ec.parent_category_id,
        ct.level + 1,
        ct.full_path || ' > ' || ec.category_name,
        ec.event_count,
        ec.popularity_score,
        ec.is_featured
    FROM event_categories ec
    INNER JOIN category_tree ct ON ec.parent_category_id = ct.id
    WHERE ec.is_active = true
)
SELECT * FROM category_tree ORDER BY level, category_name;

-- View for popular categories
CREATE VIEW v_popular_categories AS
SELECT 
    ec.id,
    ec.category_name,
    ec.category_slug,
    ec.event_count,
    ec.total_tickets_sold,
    ec.total_revenue,
    ec.popularity_score,
    ec.trending_score,
    get_category_path(ec.id) as category_path
FROM event_categories ec
WHERE ec.is_active = true
ORDER BY ec.popularity_score DESC;

-- View for category performance metrics
CREATE VIEW v_category_performance AS
SELECT 
    ec.id,
    ec.category_name,
    ec.event_count,
    ec.total_tickets_sold,
    ec.total_revenue,
    CASE 
        WHEN ec.event_count > 0 THEN ec.total_tickets_sold::DECIMAL / ec.event_count
        ELSE 0
    END as avg_tickets_per_event,
    CASE 
        WHEN ec.total_tickets_sold > 0 THEN ec.total_revenue / ec.total_tickets_sold
        ELSE 0
    END as avg_ticket_price,
    ec.avg_rating,
    ec.popularity_score,
    ec.last_event_date
FROM event_categories ec
WHERE ec.is_active = true AND ec.event_count > 0;

-- Comments for documentation
COMMENT ON TABLE event_categories IS 'Master table for event categories with hierarchical structure';
COMMENT ON TABLE event_category_attributes IS 'Genre-specific attributes for categories (music genres, sports leagues, etc.)';
COMMENT ON TABLE event_category_tags IS 'Search tags and keywords for category discovery';
COMMENT ON TABLE event_category_mappings IS 'Many-to-many mapping between events and categories';
COMMENT ON TABLE venue_custom_categories IS 'Venue-specific category customizations and branding';
COMMENT ON TABLE event_category_analytics IS 'Daily analytics data for category performance tracking';
COMMENT ON TABLE event_category_trending IS 'Trending metrics for categories across different time periods';
COMMENT ON TABLE event_category_search_suggestions IS 'Auto-complete and search suggestions for categories';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_event_categories_tenant_id ON event_categories(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_categories_tenant_created ON event_categories(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

