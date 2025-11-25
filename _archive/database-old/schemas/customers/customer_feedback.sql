-- TicketToken Customer Feedback Schema
-- Week 3: Customer feedback, reviews, and ratings system
-- Purpose: Capture and manage customer feedback for events, venues, and platform

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS public;

-- Set search path
SET search_path TO public;

-- Create customer_feedback table
CREATE TABLE IF NOT EXISTS customer_feedback (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Foreign keys
   customer_profile_id UUID NOT NULL,                   -- Customer providing feedback
   event_id UUID,                                       -- Event being reviewed
   venue_id UUID,                                       -- Venue being reviewed
   order_id UUID,                                       -- Related order (for verified purchases)
   
   -- Feedback type
   type VARCHAR(30) NOT NULL,                           -- event_review, venue_review, platform_feedback, support_ticket
   
   -- Rating fields (1-5 scale)
   overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
   venue_rating INTEGER CHECK (venue_rating >= 1 AND venue_rating <= 5),
   event_rating INTEGER CHECK (event_rating >= 1 AND event_rating <= 5),
   platform_rating INTEGER CHECK (platform_rating >= 1 AND platform_rating <= 5),
   
   -- Text feedback
   title VARCHAR(200),                                  -- Review title/subject
   comment TEXT,                                        -- Main feedback text
   suggestions TEXT,                                    -- Improvement suggestions
   
   -- Specific ratings (1-5 scale)
   sound_quality INTEGER CHECK (sound_quality >= 1 AND sound_quality <= 5),
   seating_comfort INTEGER CHECK (seating_comfort >= 1 AND seating_comfort <= 5),
   venue_cleanliness INTEGER CHECK (venue_cleanliness >= 1 AND venue_cleanliness <= 5),
   staff_friendliness INTEGER CHECK (staff_friendliness >= 1 AND staff_friendliness <= 5),
   value_for_money INTEGER CHECK (value_for_money >= 1 AND value_for_money <= 5),
   
   -- Status
   status VARCHAR(20) DEFAULT 'pending',                -- pending, published, hidden, flagged
   moderation_status VARCHAR(20) DEFAULT 'pending',     -- pending, approved, rejected, requires_review
   
   -- Response tracking
   venue_response TEXT,                                 -- Response from venue
   venue_responded_at TIMESTAMP WITH TIME ZONE,         -- When venue responded
   response_helpful_count INTEGER DEFAULT 0,            -- How many found response helpful
   
   -- Verification
   is_verified_purchase BOOLEAN DEFAULT false,          -- Whether purchase is verified
   purchase_verified_at TIMESTAMP WITH TIME ZONE,       -- When purchase was verified
   
   -- Helpfulness
   helpful_count INTEGER DEFAULT 0,                     -- Number who found helpful
   not_helpful_count INTEGER DEFAULT 0,                 -- Number who found not helpful
   reported_count INTEGER DEFAULT 0,                    -- Number of reports/flags
   
   -- Display settings
   is_featured BOOLEAN DEFAULT false,                   -- Featured review
   display_order INTEGER,                               -- Custom display order
   
   -- Anonymous option
   is_anonymous BOOLEAN DEFAULT false,                  -- Post anonymously
   display_name VARCHAR(100),                           -- Override display name
   
   -- Media attachments
   photo_urls TEXT[] DEFAULT '{}',                      -- Array of photo URLs
   has_photos BOOLEAN DEFAULT false,                    -- Quick check for photos
   
   -- Metadata
   device_type VARCHAR(50),                             -- mobile, web, app
   app_version VARCHAR(20),                             -- App version used
   survey_id UUID,                                      -- Link to survey if from survey
   
   -- Tags and analysis
   tags TEXT[] DEFAULT '{}',                            -- Category tags
   sentiment_score DECIMAL(3,2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   moderated_at TIMESTAMP WITH TIME ZONE,               -- When moderated
   moderated_by UUID,                                   -- Who moderated
   
   -- Constraints
   CONSTRAINT chk_feedback_type CHECK (type IN ('event_review', 'venue_review', 'platform_feedback', 'support_ticket')),
   CONSTRAINT chk_status CHECK (status IN ('pending', 'published', 'hidden', 'flagged')),
   CONSTRAINT chk_moderation_status CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'requires_review')),
   CONSTRAINT chk_feedback_reference CHECK (
       (type = 'event_review' AND event_id IS NOT NULL) OR
       (type = 'venue_review' AND venue_id IS NOT NULL) OR
       (type IN ('platform_feedback', 'support_ticket'))
   ),
   CONSTRAINT chk_helpful_counts CHECK (helpful_count >= 0 AND not_helpful_count >= 0 AND reported_count >= 0)
);

-- Create feedback_responses table
CREATE TABLE IF NOT EXISTS feedback_responses (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Foreign key to feedback
   feedback_id UUID NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
   
   -- Responder details
   responder_id UUID NOT NULL,                          -- User/venue responding
   responder_type VARCHAR(20) NOT NULL,                 -- venue, platform, support
   responder_name VARCHAR(255),                         -- Display name
   
   -- Response content
   response_text TEXT NOT NULL,                         -- Response message
   
   -- Status
   status VARCHAR(20) DEFAULT 'published',              -- draft, published, hidden
   is_official BOOLEAN DEFAULT true,                    -- Official response
   
   -- Timestamps
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT chk_responder_type CHECK (responder_type IN ('venue', 'platform', 'support')),
   CONSTRAINT chk_response_status CHECK (status IN ('draft', 'published', 'hidden'))
);

-- Add comments on customer_feedback
COMMENT ON TABLE customer_feedback IS 'Customer feedback, reviews, and ratings for events, venues, and platform';

COMMENT ON COLUMN customer_feedback.id IS 'Unique identifier for feedback';
COMMENT ON COLUMN customer_feedback.customer_profile_id IS 'Customer who provided feedback';
COMMENT ON COLUMN customer_feedback.event_id IS 'Event being reviewed (if applicable)';
COMMENT ON COLUMN customer_feedback.venue_id IS 'Venue being reviewed (if applicable)';
COMMENT ON COLUMN customer_feedback.order_id IS 'Related order for purchase verification';

COMMENT ON COLUMN customer_feedback.type IS 'Type of feedback: event_review, venue_review, platform_feedback, support_ticket';

COMMENT ON COLUMN customer_feedback.overall_rating IS 'Overall rating (1-5 stars)';
COMMENT ON COLUMN customer_feedback.venue_rating IS 'Venue-specific rating (1-5)';
COMMENT ON COLUMN customer_feedback.event_rating IS 'Event-specific rating (1-5)';
COMMENT ON COLUMN customer_feedback.platform_rating IS 'Platform experience rating (1-5)';

COMMENT ON COLUMN customer_feedback.title IS 'Review title or subject';
COMMENT ON COLUMN customer_feedback.comment IS 'Main feedback text';
COMMENT ON COLUMN customer_feedback.suggestions IS 'Suggestions for improvement';

COMMENT ON COLUMN customer_feedback.sound_quality IS 'Sound quality rating (1-5)';
COMMENT ON COLUMN customer_feedback.seating_comfort IS 'Seating comfort rating (1-5)';
COMMENT ON COLUMN customer_feedback.venue_cleanliness IS 'Venue cleanliness rating (1-5)';
COMMENT ON COLUMN customer_feedback.staff_friendliness IS 'Staff friendliness rating (1-5)';
COMMENT ON COLUMN customer_feedback.value_for_money IS 'Value for money rating (1-5)';

COMMENT ON COLUMN customer_feedback.status IS 'Publication status';
COMMENT ON COLUMN customer_feedback.moderation_status IS 'Content moderation status';

COMMENT ON COLUMN customer_feedback.venue_response IS 'Response from venue (deprecated - use feedback_responses)';
COMMENT ON COLUMN customer_feedback.venue_responded_at IS 'When venue responded';
COMMENT ON COLUMN customer_feedback.response_helpful_count IS 'Number who found response helpful';

COMMENT ON COLUMN customer_feedback.is_verified_purchase IS 'Whether reviewer purchased tickets';
COMMENT ON COLUMN customer_feedback.purchase_verified_at IS 'When purchase was verified';

COMMENT ON COLUMN customer_feedback.helpful_count IS 'Number of helpful votes';
COMMENT ON COLUMN customer_feedback.not_helpful_count IS 'Number of not helpful votes';
COMMENT ON COLUMN customer_feedback.reported_count IS 'Number of times reported';

COMMENT ON COLUMN customer_feedback.is_featured IS 'Whether review is featured';
COMMENT ON COLUMN customer_feedback.display_order IS 'Custom sort order';

COMMENT ON COLUMN customer_feedback.is_anonymous IS 'Whether posted anonymously';
COMMENT ON COLUMN customer_feedback.display_name IS 'Override name for display';

COMMENT ON COLUMN customer_feedback.photo_urls IS 'Array of photo URLs';
COMMENT ON COLUMN customer_feedback.has_photos IS 'Quick check for photo existence';

COMMENT ON COLUMN customer_feedback.device_type IS 'Device used to submit';
COMMENT ON COLUMN customer_feedback.app_version IS 'App version at submission';
COMMENT ON COLUMN customer_feedback.survey_id IS 'Link to survey if applicable';

COMMENT ON COLUMN customer_feedback.tags IS 'Categorization tags';
COMMENT ON COLUMN customer_feedback.sentiment_score IS 'Sentiment analysis score (-1 to 1)';

-- Add comments on feedback_responses
COMMENT ON TABLE feedback_responses IS 'Official responses to customer feedback';
COMMENT ON COLUMN feedback_responses.feedback_id IS 'Feedback being responded to';
COMMENT ON COLUMN feedback_responses.responder_type IS 'Type of responder: venue, platform, support';

-- Create indexes on customer_feedback

-- Foreign key indexes
CREATE INDEX idx_customer_feedback_customer_profile_id ON customer_feedback(customer_profile_id);
CREATE INDEX idx_customer_feedback_event_id ON customer_feedback(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_customer_feedback_venue_id ON customer_feedback(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_customer_feedback_order_id ON customer_feedback(order_id) WHERE order_id IS NOT NULL;

-- Type and status indexes
CREATE INDEX idx_customer_feedback_type ON customer_feedback(type);
CREATE INDEX idx_customer_feedback_status ON customer_feedback(status);
CREATE INDEX idx_customer_feedback_moderation ON customer_feedback(moderation_status) 
   WHERE moderation_status = 'requires_review';

-- Rating indexes
CREATE INDEX idx_customer_feedback_overall_rating ON customer_feedback(overall_rating DESC) 
   WHERE overall_rating IS NOT NULL;
CREATE INDEX idx_customer_feedback_high_ratings ON customer_feedback(overall_rating) 
   WHERE overall_rating >= 4 AND status = 'published';
CREATE INDEX idx_customer_feedback_low_ratings ON customer_feedback(overall_rating) 
   WHERE overall_rating <= 2 AND status = 'published';

-- Featured and verified
CREATE INDEX idx_customer_feedback_featured ON customer_feedback(is_featured, created_at DESC) 
   WHERE is_featured = true;
CREATE INDEX idx_customer_feedback_verified ON customer_feedback(is_verified_purchase) 
   WHERE is_verified_purchase = true;

-- Temporal indexes
CREATE INDEX idx_customer_feedback_created_at ON customer_feedback(created_at DESC);
CREATE INDEX idx_customer_feedback_recent_published ON customer_feedback(created_at DESC) 
   WHERE status = 'published';

-- Response tracking
CREATE INDEX idx_customer_feedback_needs_response ON customer_feedback(venue_id, created_at DESC) 
   WHERE venue_response IS NULL AND type = 'venue_review';

-- Create indexes on feedback_responses
CREATE INDEX idx_feedback_responses_feedback_id ON feedback_responses(feedback_id);
CREATE INDEX idx_feedback_responses_responder ON feedback_responses(responder_id, responder_type);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_customer_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   -- Update has_photos flag
   NEW.has_photos = (array_length(NEW.photo_urls, 1) > 0);
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_feedback_updated_at 
   BEFORE UPDATE ON customer_feedback
   FOR EACH ROW EXECUTE FUNCTION update_customer_feedback_updated_at();

-- Create trigger for feedback_responses updated_at
CREATE OR REPLACE FUNCTION update_feedback_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feedback_responses_updated_at 
   BEFORE UPDATE ON feedback_responses
   FOR EACH ROW EXECUTE FUNCTION update_feedback_responses_updated_at();

-- Create function to update average ratings
CREATE OR REPLACE FUNCTION update_entity_average_ratings()
RETURNS TRIGGER AS $$
DECLARE
   v_avg_rating DECIMAL(3,2);
   v_total_reviews INTEGER;
BEGIN
   -- Update venue average if venue review
   IF NEW.type = 'venue_review' AND NEW.venue_id IS NOT NULL THEN
       SELECT 
           AVG(overall_rating)::DECIMAL(3,2),
           COUNT(*)
       INTO v_avg_rating, v_total_reviews
       FROM customer_feedback
       WHERE venue_id = NEW.venue_id 
         AND status = 'published'
         AND overall_rating IS NOT NULL;
       
       -- Update venues table (if exists)
       -- UPDATE venues SET average_rating = v_avg_rating, total_reviews = v_total_reviews WHERE id = NEW.venue_id;
   END IF;
   
   -- Update event average if event review
   IF NEW.type = 'event_review' AND NEW.event_id IS NOT NULL THEN
       SELECT 
           AVG(overall_rating)::DECIMAL(3,2),
           COUNT(*)
       INTO v_avg_rating, v_total_reviews
       FROM customer_feedback
       WHERE event_id = NEW.event_id 
         AND status = 'published'
         AND overall_rating IS NOT NULL;
       
       -- Update events table (if exists)
       -- UPDATE events SET average_rating = v_avg_rating, total_reviews = v_total_reviews WHERE id = NEW.event_id;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_entity_ratings_trigger
   AFTER INSERT OR UPDATE OF status, overall_rating ON customer_feedback
   FOR EACH ROW 
   WHEN (NEW.status = 'published')
   EXECUTE FUNCTION update_entity_average_ratings();

-- Create view for feedback summary
CREATE OR REPLACE VIEW customer_feedback_summary AS
SELECT 
   type,
   COUNT(*) as total_feedback,
   COUNT(*) FILTER (WHERE status = 'published') as published_count,
   COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
   COUNT(*) FILTER (WHERE is_verified_purchase) as verified_count,
   AVG(overall_rating) FILTER (WHERE overall_rating IS NOT NULL) as avg_rating,
   COUNT(*) FILTER (WHERE overall_rating >= 4) as positive_count,
   COUNT(*) FILTER (WHERE overall_rating <= 2) as negative_count,
   COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as recent_count
FROM customer_feedback
GROUP BY type;

COMMENT ON VIEW customer_feedback_summary IS 'Summary statistics for customer feedback by type';

-- Insert sample feedback categories/tags
INSERT INTO customer_feedback (
   customer_profile_id, type, tags, 
   status, moderation_status, title, comment
) VALUES 
   (uuid_generate_v1(), 'platform_feedback', '{ui_improvement, feature_request}',
    'hidden', 'approved', 'Sample Category: UI Improvement', 'This is a sample category for UI improvements'),
   (uuid_generate_v1(), 'platform_feedback', '{bug_report, technical_issue}',
    'hidden', 'approved', 'Sample Category: Bug Report', 'This is a sample category for bug reports'),
   (uuid_generate_v1(), 'platform_feedback', '{payment_issue, billing}',
    'hidden', 'approved', 'Sample Category: Payment Issues', 'This is a sample category for payment issues')
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON customer_feedback TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON feedback_responses TO app_user;
-- GRANT SELECT ON customer_feedback_summary TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_id ON customer_feedback(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_created ON customer_feedback(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

