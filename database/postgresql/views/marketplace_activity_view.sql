-- marketplace_activity_view.sql
-- Secondary market analytics view for TicketToken platform
-- Built incrementally to ensure each phase works before adding complexity
-- Generated on: Sat Jul 19 00:29:46 EDT 2025

-- Fix Phase 2: Listing details with correct columns
DROP VIEW IF EXISTS marketplace_activity_with_listings CASCADE;

CREATE OR REPLACE VIEW marketplace_activity_with_listings AS
SELECT 
    mab.*,
    l.price as listing_price,
    l.original_price,
    l.listing_type,
    l.status as listing_status,
    l.listed_at as listing_created_at,
    l.is_featured,
    l.accepts_offers,
    l.view_count,
    l.offer_count,
    -- Price comparison
    mab.sale_price - l.price as price_difference,
    CASE 
        WHEN l.price > 0 THEN 
            ((mab.sale_price - l.price) / l.price * 100)
        ELSE 0 
    END as price_change_percent
FROM marketplace_activity_basic mab
LEFT JOIN listings l ON mab.listing_id = l.id;

-- Test with: SELECT COUNT(*) FROM marketplace_activity_with_listings;

-- =====================================================================
-- PHASE 3: ADD USER ACTIVITY METRICS
-- Add buyer and seller information
-- =====================================================================

CREATE OR REPLACE VIEW marketplace_activity_with_users AS
SELECT 
    mawl.*,
    -- Buyer info
    buyer.username as buyer_username,
    buyer.email as buyer_email,
    -- Seller info  
    seller.username as seller_username,
    seller.email as seller_email,
    -- Transaction timing
    EXTRACT(EPOCH FROM (mawl.created_at - mawl.listing_created_at))/3600 as hours_to_sale,
    DATE_TRUNC('hour', mawl.created_at) as sale_hour,
    DATE_TRUNC('day', mawl.created_at) as sale_date
FROM marketplace_activity_with_listings mawl
LEFT JOIN users buyer ON mawl.buyer_id = buyer.id
LEFT JOIN users seller ON mawl.seller_id = seller.id;

-- Test with: SELECT COUNT(*) FROM marketplace_activity_with_users;

-- =====================================================================
-- PHASE 4: ADD FEE AND ROYALTY CALCULATIONS
-- Include all marketplace fees and seller payouts
-- =====================================================================

CREATE OR REPLACE VIEW marketplace_activity_with_fees AS
SELECT 
    mawu.*,
    -- Fees from marketplace_transactions
    mt.platform_fee,
    mt.platform_fee_percentage,
    mt.payment_processing_fee,
    mt.blockchain_fee,
    mt.total_fees,
    mt.seller_payout,
    -- Fee percentages
    CASE 
        WHEN mawu.sale_price > 0 THEN (mt.total_fees / mawu.sale_price * 100)
        ELSE 0 
    END as total_fee_percent,
    -- Seller keeps percentage
    CASE 
        WHEN mawu.sale_price > 0 THEN (mt.seller_payout / mawu.sale_price * 100)
        ELSE 0 
    END as seller_keep_percent
FROM marketplace_activity_with_users mawu
JOIN marketplace_transactions mt ON mawu.transaction_id = mt.id;

-- Test with: SELECT COUNT(*) FROM marketplace_activity_with_fees;

-- =====================================================================
-- PHASE 5: ADD MARKET VOLUME ANALYSIS
-- Calculate volume metrics and rankings
-- =====================================================================

CREATE OR REPLACE VIEW marketplace_activity_with_volume AS
SELECT 
    mawf.*,
    -- Running totals
    SUM(mawf.sale_price) OVER (
        ORDER BY mawf.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_volume,
    -- Daily volume
    SUM(mawf.sale_price) OVER (
        PARTITION BY mawf.sale_date
    ) as daily_volume,
    -- Transaction ranking
    RANK() OVER (
        PARTITION BY mawf.sale_date
        ORDER BY mawf.sale_price DESC
    ) as daily_price_rank,
    -- Average price by listing type
    AVG(mawf.sale_price) OVER (
        PARTITION BY mawf.listing_type
    ) as avg_price_by_type
FROM marketplace_activity_with_fees mawf;

-- Test with: SELECT COUNT(*) FROM marketplace_activity_with_volume;

-- =====================================================================
-- PHASE 6: HOT TICKETS IDENTIFICATION
-- Identify trending and high-demand tickets
-- =====================================================================

CREATE OR REPLACE VIEW marketplace_activity_with_trends AS
SELECT 
    mawv.*,
    -- Velocity metrics
    COUNT(*) OVER (
        PARTITION BY mawv.ticket_id
        ORDER BY mawv.created_at
        RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND CURRENT ROW
    ) as sales_last_24h,
    -- Price trend
    CASE 
        WHEN LAG(mawv.sale_price) OVER (PARTITION BY mawv.ticket_id ORDER BY mawv.created_at) > 0 THEN
            ((mawv.sale_price - LAG(mawv.sale_price) OVER (PARTITION BY mawv.ticket_id ORDER BY mawv.created_at)) / 
             LAG(mawv.sale_price) OVER (PARTITION BY mawv.ticket_id ORDER BY mawv.created_at) * 100)
        ELSE 0
    END as price_momentum,
    -- Hot ticket flag
    CASE 
        WHEN COUNT(*) OVER (
            PARTITION BY mawv.ticket_id
            ORDER BY mawv.created_at
            RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND CURRENT ROW
        ) >= 3 THEN true
        ELSE false
    END as is_hot_ticket
FROM marketplace_activity_with_volume mawv;

-- =====================================================================
-- FINAL VIEW: COMPLETE MARKETPLACE ACTIVITY
-- This is the main view that applications should use
-- =====================================================================

CREATE OR REPLACE VIEW marketplace_activity AS
SELECT * FROM marketplace_activity_with_trends;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marketplace_tx_created ON marketplace_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_tx_ticket ON marketplace_transactions(ticket_id);

-- =====================================================================
-- MATERIALIZED VIEW FOR PERFORMANCE
-- For production use with large datasets
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS marketplace_activity_materialized CASCADE;

CREATE MATERIALIZED VIEW marketplace_activity_materialized AS
SELECT * FROM marketplace_activity;

-- Create indexes on materialized view
CREATE INDEX idx_market_mat_date ON marketplace_activity_materialized(sale_date);
CREATE INDEX idx_market_mat_ticket ON marketplace_activity_materialized(ticket_id);
CREATE INDEX idx_market_mat_buyer ON marketplace_activity_materialized(buyer_id);
CREATE INDEX idx_market_mat_seller ON marketplace_activity_materialized(seller_id);

-- =====================================================================
-- HELPER VIEWS FOR COMMON QUERIES
-- =====================================================================

-- Daily marketplace summary
CREATE OR REPLACE VIEW daily_marketplace_summary AS
SELECT 
    sale_date,
    COUNT(DISTINCT transaction_id) as transaction_count,
    COUNT(DISTINCT buyer_id) as unique_buyers,
    COUNT(DISTINCT seller_id) as unique_sellers,
    COUNT(DISTINCT ticket_id) as unique_tickets_sold,
    SUM(sale_price) as total_volume,
    AVG(sale_price) as avg_sale_price,
    SUM(platform_fee) as total_platform_fees,
    SUM(seller_payout) as total_seller_payouts
FROM marketplace_activity
WHERE status = 'COMPLETED'
GROUP BY sale_date
ORDER BY sale_date DESC;

-- Seller performance
CREATE OR REPLACE VIEW seller_performance AS
SELECT 
    seller_id,
    seller_username,
    COUNT(*) as total_sales,
    SUM(sale_price) as total_revenue,
    AVG(sale_price) as avg_sale_price,
    SUM(seller_payout) as total_earnings,
    AVG(hours_to_sale) as avg_hours_to_sale,
    COUNT(DISTINCT ticket_id) as unique_tickets_sold
FROM marketplace_activity
WHERE status = 'COMPLETED'
GROUP BY seller_id, seller_username
ORDER BY total_revenue DESC;

-- Hot tickets report
CREATE OR REPLACE VIEW hot_tickets_report AS
SELECT 
    ticket_id,
    COUNT(*) as trade_count,
    MIN(sale_price) as min_price,
    MAX(sale_price) as max_price,
    AVG(sale_price) as avg_price,
    STDDEV(sale_price) as price_volatility,
    MAX(sale_price) - MIN(sale_price) as price_range,
    MAX(is_hot_ticket::int) as currently_hot
FROM marketplace_activity
GROUP BY ticket_id
HAVING COUNT(*) > 1
ORDER BY trade_count DESC;

-- =====================================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON VIEW marketplace_activity IS 'Comprehensive marketplace activity view with user info, fees, volume analysis, and trend identification';
COMMENT ON VIEW daily_marketplace_summary IS 'Daily aggregated marketplace metrics for reporting';
COMMENT ON VIEW seller_performance IS 'Seller performance metrics including sales, revenue, and timing';
COMMENT ON VIEW hot_tickets_report IS 'Identifies frequently traded tickets with price analysis';

-- Test queries
/*
SELECT COUNT(*) FROM marketplace_activity;
SELECT * FROM daily_marketplace_summary LIMIT 5;
SELECT * FROM seller_performance LIMIT 10;
SELECT * FROM hot_tickets_report LIMIT 10;
*/
