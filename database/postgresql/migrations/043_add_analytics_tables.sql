-- Migration: 002_add_analytics_tables.sql
-- Description: Add analytics tables for customer LTV and revenue projections
-- Safe: Only creates new tables in analytics_v2 schema

BEGIN;

-- Customer LTV tracking
CREATE TABLE analytics_v2.customer_ltv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers.customers(id),
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_spent DECIMAL(12,2) DEFAULT 0,
    total_events INTEGER DEFAULT 0,
    avg_ticket_price DECIMAL(10,2) DEFAULT 0,
    days_since_first_purchase INTEGER,
    days_since_last_purchase INTEGER,
    churn_probability DECIMAL(5,4) DEFAULT 0,
    ltv_estimate DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_ltv_customer_date ON analytics_v2.customer_ltv(customer_id, calculation_date DESC);
CREATE INDEX idx_customer_ltv_calculation_date ON analytics_v2.customer_ltv(calculation_date DESC);

-- Revenue projections
CREATE TABLE analytics_v2.revenue_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues.venues(id),
    projection_date DATE NOT NULL,
    projection_period VARCHAR(20) CHECK (projection_period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    projected_events INTEGER DEFAULT 0,
    projected_tickets INTEGER DEFAULT 0,
    projected_revenue DECIMAL(12,2) DEFAULT 0,
    actual_revenue DECIMAL(12,2),
    confidence_score DECIMAL(5,4) DEFAULT 0.5,
    factors JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_revenue_proj_venue_date ON analytics_v2.revenue_projections(venue_id, projection_date DESC);
CREATE INDEX idx_revenue_proj_date ON analytics_v2.revenue_projections(projection_date DESC);

-- Event performance analytics
CREATE TABLE analytics_v2.event_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events.events(id),
    analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tickets_sold INTEGER DEFAULT 0,
    total_capacity INTEGER DEFAULT 0,
    occupancy_rate DECIMAL(5,4) DEFAULT 0,
    revenue_generated DECIMAL(12,2) DEFAULT 0,
    avg_ticket_price DECIMAL(10,2) DEFAULT 0,
    sales_velocity DECIMAL(10,2), -- tickets per day
    days_to_event INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_perf_event_date ON analytics_v2.event_performance(event_id, analysis_date DESC);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA analytics_v2 TO tickettoken;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics_v2 TO tickettoken;

-- Record migration
INSERT INTO core.schema_migrations (version, name, applied_at)
VALUES ('002', 'add_analytics_tables', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
