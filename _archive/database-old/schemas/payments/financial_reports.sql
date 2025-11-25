-- TicketToken Financial Reports Schema
-- This table manages all financial reports including revenue, transactions, and analytics
-- Report Generation: queued -> processing -> completed
-- Financial Reporting Structure: Supports real-time and batch report generation with flexible data storage
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS financial_reports CASCADE;

-- Create the financial_reports table
CREATE TABLE financial_reports (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    venue_id UUID,  -- Venue for venue-specific reports (nullable for platform reports)
    generated_by_user_id UUID,  -- User who requested the report
    report_template_id UUID,  -- Reference to report template used
    parent_report_id UUID,  -- For comparative or follow-up reports
    
    -- Report identification
    report_code VARCHAR(100) UNIQUE,  -- Unique report identifier
    report_name VARCHAR(255) NOT NULL,  -- Human-readable report name
    report_description TEXT,  -- Detailed description
    report_category VARCHAR(50) CHECK (report_category IN (
        'revenue',           -- Revenue reports
        'transactions',      -- Transaction analysis
        'settlements',       -- Settlement reports
        'subscriptions',     -- Subscription analytics
        'refunds',          -- Refund analysis
        'taxes',            -- Tax reports
        'compliance',       -- Compliance reports
        'analytics',        -- General analytics
        'custom'            -- Custom reports
    )),
    
    -- Report type and frequency
    report_type VARCHAR(30) NOT NULL CHECK (report_type IN (
        'daily',            -- Daily report
        'weekly',           -- Weekly report
        'monthly',          -- Monthly report
        'quarterly',        -- Quarterly report
        'annual',           -- Annual report
        'ytd',              -- Year-to-date
        'custom_period',    -- Custom date range
        'real_time',        -- Real-time snapshot
        'comparative',      -- Period comparison
        'rolling'           -- Rolling period (e.g., last 30 days)
    )),
    rolling_period_days INTEGER,  -- For rolling reports
    
    -- Period coverage
    period_start_date DATE NOT NULL,  -- Report period start
    period_end_date DATE NOT NULL,  -- Report period end
    comparison_start_date DATE,  -- For comparative reports
    comparison_end_date DATE,  -- For comparative reports
    fiscal_year INTEGER,  -- Fiscal year
    fiscal_quarter INTEGER CHECK (fiscal_quarter >= 1 AND fiscal_quarter <= 4),  -- Fiscal quarter
    fiscal_month INTEGER CHECK (fiscal_month >= 1 AND fiscal_month <= 12),  -- Fiscal month
    week_number INTEGER,  -- Week number in year
    
    -- Financial summary (all amounts in report currency)
    gross_revenue DECIMAL(15, 2),  -- Total gross revenue
    net_revenue DECIMAL(15, 2),  -- Net revenue after fees
    platform_fees DECIMAL(12, 2),  -- Total platform fees
    processing_fees DECIMAL(12, 2),  -- Payment processing fees
    refunds DECIMAL(12, 2),  -- Total refunds
    chargebacks DECIMAL(12, 2),  -- Total chargebacks
    adjustments DECIMAL(12, 2),  -- Manual adjustments
    taxes_collected DECIMAL(12, 2),  -- Taxes collected
    currency VARCHAR(3) DEFAULT 'USD',  -- Report currency
    
    -- Revenue breakdown
    ticket_sales DECIMAL(15, 2),  -- Revenue from ticket sales
    subscription_revenue DECIMAL(12, 2),  -- Subscription revenue
    fees_revenue DECIMAL(12, 2),  -- Service fees revenue
    other_revenue DECIMAL(12, 2),  -- Other revenue sources
    
    -- Transaction metrics
    total_transactions INTEGER,  -- Total transaction count
    successful_transactions INTEGER,  -- Successful transactions
    failed_transactions INTEGER,  -- Failed transactions
    refunded_transactions INTEGER,  -- Refunded transactions
    average_transaction_value DECIMAL(10, 2),  -- Average transaction size
    median_transaction_value DECIMAL(10, 2),  -- Median transaction size
    largest_transaction DECIMAL(12, 2),  -- Largest single transaction
    
    -- Volume metrics
    tickets_sold INTEGER,  -- Number of tickets sold
    events_count INTEGER,  -- Number of events
    active_venues INTEGER,  -- Active venues in period
    new_customers INTEGER,  -- New customers acquired
    returning_customers INTEGER,  -- Returning customers
    
    -- Growth metrics
    revenue_growth_percentage DECIMAL(8, 2),  -- Period-over-period growth
    transaction_growth_percentage DECIMAL(8, 2),  -- Transaction growth
    customer_growth_percentage DECIMAL(8, 2),  -- Customer growth
    
    -- Report data storage (detailed breakdowns as JSON)
    detailed_breakdown JSONB DEFAULT '{}'::jsonb,
    /* Example detailed_breakdown:
    {
        "by_venue": [
            {"venue_id": "uuid", "venue_name": "Madison Square Garden", "revenue": 50000.00, "transactions": 500}
        ],
        "by_event_type": [
            {"type": "concert", "revenue": 30000.00, "count": 10},
            {"type": "sports", "revenue": 20000.00, "count": 5}
        ],
        "by_payment_method": [
            {"method": "credit_card", "revenue": 40000.00, "percentage": 80},
            {"method": "crypto", "revenue": 10000.00, "percentage": 20}
        ],
        "daily_breakdown": [
            {"date": "2025-07-01", "revenue": 5000.00, "transactions": 50}
        ]
    }
    */
    
    -- Charts and visualization data
    charts_data JSONB DEFAULT '{}'::jsonb,
    /* Example charts_data:
    {
        "revenue_trend": {
            "labels": ["Jan", "Feb", "Mar"],
            "datasets": [{"label": "Revenue", "data": [10000, 12000, 15000]}]
        },
        "category_pie": {
            "labels": ["Concerts", "Sports", "Theater"],
            "data": [45, 35, 20]
        }
    }
    */
    
    -- Comparative analysis data
    comparative_data JSONB DEFAULT '{}'::jsonb,
    /* Example comparative_data:
    {
        "vs_previous_period": {
            "revenue_change": 15.5,
            "transaction_change": 10.2,
            "avg_ticket_price_change": 5.0
        },
        "vs_same_period_last_year": {
            "revenue_change": 25.0,
            "growth_rate": 1.25
        },
        "benchmarks": {
            "industry_avg_growth": 10.0,
            "performance_vs_benchmark": "above"
        }
    }
    */
    
    -- Key performance indicators
    kpi_data JSONB DEFAULT '{}'::jsonb,
    /* Example kpi_data:
    {
        "conversion_rate": 3.5,
        "cart_abandonment_rate": 25.0,
        "refund_rate": 2.1,
        "chargeback_rate": 0.5,
        "customer_lifetime_value": 250.00,
        "revenue_per_customer": 75.00
    }
    */
    
    -- Report generation details
    generation_status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (generation_status IN (
        'queued',           -- In queue for generation
        'processing',       -- Currently being generated
        'completed',        -- Successfully generated
        'failed',           -- Generation failed
        'cancelled',        -- Generation cancelled
        'scheduled',        -- Scheduled for future
        'expired'           -- Report expired
    )),
    generation_progress INTEGER DEFAULT 0 CHECK (generation_progress >= 0 AND generation_progress <= 100),
    generation_error TEXT,  -- Error details if failed
    generation_duration_seconds INTEGER,  -- Time taken to generate
    data_freshness_minutes INTEGER,  -- Age of data at generation time
    
    -- Scheduling information (for recurring reports)
    is_recurring BOOLEAN DEFAULT FALSE,  -- Whether report recurs
    recurrence_pattern VARCHAR(50),  -- Cron expression or pattern
    next_generation_date TIMESTAMP WITH TIME ZONE,  -- Next scheduled generation
    last_generation_date TIMESTAMP WITH TIME ZONE,  -- Last generation timestamp
    
    -- Access control
    is_public BOOLEAN DEFAULT FALSE,  -- Whether report is public
    is_archived BOOLEAN DEFAULT FALSE,  -- Whether report is archived
    access_level VARCHAR(20) CHECK (access_level IN (
        'private',          -- Only creator can access
        'shared',           -- Shared with specific users
        'venue',            -- All venue users can access
        'public'            -- Anyone can access
    )),
    shared_with_users UUID[] DEFAULT ARRAY[]::UUID[],  -- Array of user IDs
    shared_with_roles VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],  -- Array of roles
    share_expiry_date TIMESTAMP WITH TIME ZONE,  -- When sharing expires
    
    -- File storage and exports
    report_pdf_url VARCHAR(500),  -- Generated PDF URL
    report_pdf_size INTEGER,  -- PDF file size in bytes
    report_csv_url VARCHAR(500),  -- CSV export URL
    report_csv_size INTEGER,  -- CSV file size
    report_excel_url VARCHAR(500),  -- Excel export URL
    report_excel_size INTEGER,  -- Excel file size
    report_json_url VARCHAR(500),  -- JSON data export URL
    storage_path VARCHAR(255),  -- Internal storage path
    
    -- Email and distribution
    email_recipients TEXT[],  -- Array of email addresses
    email_sent_at TIMESTAMP WITH TIME ZONE,  -- When emailed
    email_subject VARCHAR(255),  -- Email subject used
    slack_webhook_url VARCHAR(500),  -- Slack notification webhook
    webhook_sent_at TIMESTAMP WITH TIME ZONE,  -- Webhook notification time
    
    -- Audit and compliance
    audit_trail JSONB DEFAULT '[]'::jsonb,  -- Array of audit events
    compliance_flags JSONB DEFAULT '{}'::jsonb,  -- Compliance markers
    data_retention_days INTEGER DEFAULT 365,  -- How long to retain
    pii_redacted BOOLEAN DEFAULT FALSE,  -- Whether PII is redacted
    
    -- Performance and caching
    is_cached BOOLEAN DEFAULT FALSE,  -- Whether results are cached
    cache_key VARCHAR(255),  -- Cache key for retrieval
    cache_expires_at TIMESTAMP WITH TIME ZONE,  -- Cache expiration
    query_performance JSONB,  -- Query performance metrics
    
    -- Metadata
    tags VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],  -- Tags for categorization
    custom_fields JSONB DEFAULT '{}'::jsonb,  -- User-defined fields
    notes TEXT,  -- Internal notes
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    generated_at TIMESTAMP WITH TIME ZONE,  -- When generation completed
    last_accessed_at TIMESTAMP WITH TIME ZONE,  -- Last time accessed
    last_modified_at TIMESTAMP WITH TIME ZONE,  -- Last modification
    expires_at TIMESTAMP WITH TIME ZONE,  -- When report expires
    archived_at TIMESTAMP WITH TIME ZONE,  -- When archived
    
    -- Foreign key constraints
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    CONSTRAINT fk_generated_by FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_report_template FOREIGN KEY (report_template_id) REFERENCES report_templates(id) ON DELETE SET NULL,
    CONSTRAINT fk_parent_report FOREIGN KEY (parent_report_id) REFERENCES financial_reports(id) ON DELETE SET NULL,
    
    -- Business constraints
    CONSTRAINT chk_period_validity CHECK (period_end_date >= period_start_date),
    CONSTRAINT chk_comparison_period CHECK (
        (comparison_start_date IS NULL AND comparison_end_date IS NULL) OR
        (comparison_start_date IS NOT NULL AND comparison_end_date IS NOT NULL AND comparison_end_date >= comparison_start_date)
    ),
    CONSTRAINT chk_fiscal_values CHECK (
        (fiscal_year IS NULL) OR (fiscal_year >= 2020 AND fiscal_year <= 2100)
    ),
    CONSTRAINT chk_amounts_consistency CHECK (
        (gross_revenue IS NULL) OR (gross_revenue >= 0)
    ),
    CONSTRAINT chk_transaction_counts CHECK (
        (total_transactions IS NULL) OR 
        (total_transactions >= COALESCE(successful_transactions, 0) + COALESCE(failed_transactions, 0))
    ),
    CONSTRAINT chk_generation_completed CHECK (
        (generation_status != 'completed') OR (generated_at IS NOT NULL)
    ),
    CONSTRAINT chk_rolling_period CHECK (
        (report_type != 'rolling') OR (rolling_period_days IS NOT NULL AND rolling_period_days > 0)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_financial_reports_venue ON financial_reports(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_financial_reports_user ON financial_reports(generated_by_user_id);
CREATE INDEX idx_financial_reports_code ON financial_reports(report_code);

-- Report type and period indexes
CREATE INDEX idx_financial_reports_type ON financial_reports(report_type, period_start_date DESC);
CREATE INDEX idx_financial_reports_period ON financial_reports(period_start_date, period_end_date);
CREATE INDEX idx_financial_reports_fiscal ON financial_reports(fiscal_year, fiscal_quarter) WHERE fiscal_year IS NOT NULL;
CREATE INDEX idx_financial_reports_category ON financial_reports(report_category, generation_status);

-- Generation and status indexes
CREATE INDEX idx_financial_reports_status ON financial_reports(generation_status);
CREATE INDEX idx_financial_reports_queued ON financial_reports(requested_at) WHERE generation_status = 'queued';
CREATE INDEX idx_financial_reports_processing ON financial_reports(generation_status, generation_progress) WHERE generation_status = 'processing';
CREATE INDEX idx_financial_reports_recurring ON financial_reports(is_recurring, next_generation_date) WHERE is_recurring = TRUE;

-- Access control indexes
CREATE INDEX idx_financial_reports_public ON financial_reports(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_financial_reports_shared ON financial_reports(shared_with_users) USING GIN;
CREATE INDEX idx_financial_reports_access ON financial_reports(access_level, venue_id);

-- Performance and usage indexes
CREATE INDEX idx_financial_reports_accessed ON financial_reports(last_accessed_at DESC);
CREATE INDEX idx_financial_reports_expires ON financial_reports(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_financial_reports_archived ON financial_reports(is_archived, archived_at) WHERE is_archived = TRUE;

-- Financial metrics indexes
CREATE INDEX idx_financial_reports_revenue ON financial_reports(gross_revenue DESC) WHERE gross_revenue IS NOT NULL;
CREATE INDEX idx_financial_reports_venue_period ON financial_reports(venue_id, period_start_date DESC) WHERE venue_id IS NOT NULL;

-- Tag search index
CREATE INDEX idx_financial_reports_tags ON financial_reports USING GIN(tags);

-- JSON data indexes for common queries
CREATE INDEX idx_financial_reports_breakdown ON financial_reports USING GIN((detailed_breakdown));
CREATE INDEX idx_financial_reports_kpi ON financial_reports USING GIN((kpi_data));

-- Create function to generate report codes
CREATE OR REPLACE FUNCTION generate_report_code()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_date_part VARCHAR(8);
    v_sequence INTEGER;
BEGIN
    -- Determine prefix based on report type and category
    v_prefix := CASE 
        WHEN NEW.report_category = 'revenue' THEN 'REV'
        WHEN NEW.report_category = 'transactions' THEN 'TXN'
        WHEN NEW.report_category = 'settlements' THEN 'SET'
        WHEN NEW.report_category = 'taxes' THEN 'TAX'
        ELSE 'FIN'
    END;
    
    -- Add report type to prefix
    v_prefix := v_prefix || '-' || UPPER(SUBSTRING(NEW.report_type, 1, 3));
    
    -- Generate date part
    v_date_part := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get sequence number
    SELECT COALESCE(MAX(CAST(SUBSTRING(report_code FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM financial_reports
    WHERE report_code LIKE v_prefix || '-' || v_date_part || '-%';
    
    -- Generate report code
    NEW.report_code := v_prefix || '-' || v_date_part || '-' || LPAD(v_sequence::TEXT, 4, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_report_code_before_insert
    BEFORE INSERT ON financial_reports
    FOR EACH ROW
    WHEN (NEW.report_code IS NULL)
    EXECUTE FUNCTION generate_report_code();

-- Create function to manage report generation
CREATE OR REPLACE FUNCTION manage_report_generation()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle status transitions
    IF TG_OP = 'UPDATE' AND NEW.generation_status != OLD.generation_status THEN
        CASE NEW.generation_status
            WHEN 'processing' THEN
                -- Reset progress
                NEW.generation_progress = 0;
                
            WHEN 'completed' THEN
                NEW.generated_at = CURRENT_TIMESTAMP;
                NEW.generation_progress = 100;
                -- Calculate generation duration
                IF OLD.generation_status = 'processing' THEN
                    NEW.generation_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - OLD.last_modified_at));
                END IF;
                -- Set expiration if not set
                IF NEW.expires_at IS NULL THEN
                    NEW.expires_at = CURRENT_TIMESTAMP + INTERVAL '1 year';
                END IF;
                
            WHEN 'failed' THEN
                -- Ensure error message is set
                IF NEW.generation_error IS NULL THEN
                    NEW.generation_error = 'Unknown error occurred';
                END IF;
        END CASE;
        
        NEW.last_modified_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Update last accessed timestamp when report is viewed
    IF TG_OP = 'UPDATE' AND 
       NEW.generation_status = 'completed' AND 
       (NEW.report_pdf_url != OLD.report_pdf_url OR 
        NEW.report_csv_url != OLD.report_csv_url OR 
        NEW.report_excel_url != OLD.report_excel_url) THEN
        NEW.last_accessed_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Handle recurring reports
    IF NEW.is_recurring AND NEW.generation_status = 'completed' THEN
        -- Calculate next generation date based on report type
        CASE NEW.report_type
            WHEN 'daily' THEN
                NEW.next_generation_date = CURRENT_TIMESTAMP + INTERVAL '1 day';
            WHEN 'weekly' THEN
                NEW.next_generation_date = CURRENT_TIMESTAMP + INTERVAL '1 week';
            WHEN 'monthly' THEN
                NEW.next_generation_date = CURRENT_TIMESTAMP + INTERVAL '1 month';
            WHEN 'quarterly' THEN
                NEW.next_generation_date = CURRENT_TIMESTAMP + INTERVAL '3 months';
            WHEN 'annual' THEN
                NEW.next_generation_date = CURRENT_TIMESTAMP + INTERVAL '1 year';
        END CASE;
        NEW.last_generation_date = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_report_generation_trigger
    BEFORE INSERT OR UPDATE ON financial_reports
    FOR EACH ROW
    EXECUTE FUNCTION manage_report_generation();

-- Create function to calculate report metrics
CREATE OR REPLACE FUNCTION calculate_report_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate average transaction value
    IF NEW.total_transactions > 0 AND NEW.gross_revenue IS NOT NULL THEN
        NEW.average_transaction_value = NEW.gross_revenue / NEW.total_transactions;
    END IF;
    
    -- Calculate net revenue
    IF NEW.gross_revenue IS NOT NULL THEN
        NEW.net_revenue = NEW.gross_revenue - 
                         COALESCE(NEW.platform_fees, 0) - 
                         COALESCE(NEW.processing_fees, 0) - 
                         COALESCE(NEW.refunds, 0) - 
                         COALESCE(NEW.chargebacks, 0);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_report_metrics_trigger
    BEFORE INSERT OR UPDATE ON financial_reports
    FOR EACH ROW
    EXECUTE FUNCTION calculate_report_metrics();

-- Create view for active reports
CREATE OR REPLACE VIEW active_financial_reports AS
SELECT 
    fr.id,
    fr.report_code,
    fr.report_name,
    fr.report_type,
    fr.report_category,
    fr.venue_id,
    v.name as venue_name,
    fr.period_start_date,
    fr.period_end_date,
    fr.gross_revenue,
    fr.net_revenue,
    fr.generation_status,
    fr.generation_progress,
    fr.generated_at,
    fr.generated_by_user_id,
    u.email as generated_by_email,
    fr.is_public,
    fr.access_level,
    fr.expires_at
FROM financial_reports fr
LEFT JOIN venues v ON fr.venue_id = v.id
LEFT JOIN users u ON fr.generated_by_user_id = u.id
WHERE fr.generation_status != 'expired'
    AND fr.is_archived = FALSE
    AND (fr.expires_at IS NULL OR fr.expires_at > CURRENT_TIMESTAMP)
ORDER BY fr.requested_at DESC;

-- Add table comments
COMMENT ON TABLE financial_reports IS 'Comprehensive financial reporting system supporting various report types, periods, and formats. Handles report generation, storage, access control, and distribution with full audit trails.';

-- Add column comments (selected key columns)
COMMENT ON COLUMN financial_reports.id IS 'Unique report identifier (UUID)';
COMMENT ON COLUMN financial_reports.report_code IS 'Auto-generated unique report code';
COMMENT ON COLUMN financial_reports.report_type IS 'Frequency/type of report';
COMMENT ON COLUMN financial_reports.detailed_breakdown IS 'Detailed financial data breakdown as JSON';
COMMENT ON COLUMN financial_reports.charts_data IS 'Pre-calculated chart data for visualizations';
COMMENT ON COLUMN financial_reports.comparative_data IS 'Period-over-period comparison data';
COMMENT ON COLUMN financial_reports.kpi_data IS 'Key performance indicators';
COMMENT ON COLUMN financial_reports.generation_status IS 'Current status of report generation';
COMMENT ON COLUMN financial_reports.access_level IS 'Access control level for the report';
COMMENT ON COLUMN financial_reports.shared_with_users IS 'Array of user IDs with access';

-- Sample data for testing (commented out)
/*
-- Monthly revenue report for a venue
INSERT INTO financial_reports (
    venue_id, generated_by_user_id,
    report_name, report_type, report_category,
    period_start_date, period_end_date,
    gross_revenue, platform_fees, processing_fees,
    net_revenue, total_transactions,
    generation_status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'July 2025 Revenue Report - Madison Square Garden',
    'monthly',
    'revenue',
    '2025-07-01'::date,
    '2025-07-31'::date,
    250000.00,  -- $250k gross
    12500.00,   -- 5% platform fee
    7250.00,    -- ~2.9% processing
    230250.00,  -- Net revenue
    2500,       -- Transactions
    'queued'
);

-- Comparative quarterly report
INSERT INTO financial_reports (
    generated_by_user_id,
    report_name, report_type, report_category,
    period_start_date, period_end_date,
    comparison_start_date, comparison_end_date,
    fiscal_year, fiscal_quarter,
    detailed_breakdown, comparative_data,
    generation_status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'Q2 2025 Platform Performance Report',
    'quarterly',
    'analytics',
    '2025-04-01'::date,
    '2025-06-30'::date,
    '2025-01-01'::date,  -- Compare to Q1
    '2025-03-31'::date,
    2025,
    2,
    '{
        "by_venue": [
            {"venue_id": "uuid1", "revenue": 500000, "growth": 15.5}
        ],
        "by_category": [
            {"category": "concerts", "revenue": 300000, "percentage": 60}
        ]
    }'::jsonb,
    '{
        "vs_previous_quarter": {
            "revenue_change": 25.5,
            "transaction_change": 20.0
        }
    }'::jsonb,
    'completed'
);
*/

-- Financial Reporting Notes:
-- 1. Report Generation: Async processing with progress tracking
-- 2. Data Freshness: Track how current the data is
-- 3. Access Control: Flexible sharing and permission system
-- 4. Multiple Formats: PDF, CSV, Excel, JSON exports
-- 5. Caching: Performance optimization for frequently accessed reports
-- 6. Compliance: Audit trails and data retention policies
-- 7. Automation: Recurring reports with scheduling

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_financial_reports_tenant_id ON financial_reports(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_reports_tenant_created ON financial_reports(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 8. Distribution: Email and webhook notifications
