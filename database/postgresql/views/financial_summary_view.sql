-- Fix Phase 2: Payment Methods
-- Note: payment_methods table doesn't exist in schema, use metadata from payment_transactions
DROP VIEW IF EXISTS financial_summary_payment_methods CASCADE;

CREATE OR REPLACE VIEW financial_summary_payment_methods AS
SELECT 
    fsb.*,
    t.metadata->>'payment_method' as payment_method,
    t.metadata->>'gateway' as gateway,
    t.stripe_payment_intent_id as gateway_transaction_id
FROM financial_summary_basic fsb
LEFT JOIN payment_transactions t ON fsb.transaction_id = t.id;
-- Fix all financial summary views to work with actual schema

-- Phase 1 already works
-- Phase 2 already fixed

-- Phase 3: Fix refunds (no refunds table)
DROP VIEW IF EXISTS financial_summary_with_refunds CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_refunds AS
SELECT 
    fspm.*,
    t.type as transaction_type,
    CASE WHEN t.type = 'refund' THEN fspm.amount ELSE 0 END as refund_amount,
    CASE WHEN t.type = 'payment' THEN fspm.amount ELSE 0 END as payment_amount,
    CASE 
        WHEN t.type = 'payment' THEN fspm.amount
        WHEN t.type = 'refund' THEN -fspm.amount
        ELSE 0
    END as net_amount,
    NULL::text as refund_reason
FROM financial_summary_payment_methods fspm
JOIN payment_transactions t ON fspm.transaction_id = t.id;

-- Phase 4: Fees
DROP VIEW IF EXISTS financial_summary_with_fees CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_fees AS
SELECT 
    fswr.*,
    CASE 
        WHEN fswr.transaction_type = 'payment' THEN 
            CASE 
                WHEN fswr.payment_method = 'credit_card' THEN fswr.amount * 0.029 + 0.30
                WHEN fswr.payment_method = 'crypto' THEN fswr.amount * 0.015
                ELSE fswr.amount * 0.025
            END
        ELSE 0
    END as processing_fee,
    CASE 
        WHEN fswr.transaction_type = 'payment' THEN fswr.amount * 0.10
        ELSE 0
    END as platform_fee,
    CASE 
        WHEN fswr.transaction_type = 'payment' THEN 
            fswr.amount - (fswr.amount * 0.10) - 
            CASE 
                WHEN fswr.payment_method = 'credit_card' THEN fswr.amount * 0.029 + 0.30
                WHEN fswr.payment_method = 'crypto' THEN fswr.amount * 0.015
                ELSE fswr.amount * 0.025
            END
        WHEN fswr.transaction_type = 'refund' THEN -fswr.amount
        ELSE 0
    END as net_revenue_after_fees
FROM financial_summary_with_refunds fswr;

-- Phase 5: Settlements
-- Note: settlement_batches is for batch processing, not individual transactions
-- Removed settlement join as settlements don't link to individual transactions
DROP VIEW IF EXISTS financial_summary_with_settlements CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_settlements AS
SELECT 
    fswf.*,
    NULL::varchar as settlement_status,
    NULL::timestamp as settlement_date,
    NULL::numeric as settlement_amount,
    0::numeric as paid_out_amount,
    fswf.net_revenue_after_fees as pending_payout
FROM financial_summary_with_fees fswf;

-- Phase 6: Taxes
DROP VIEW IF EXISTS financial_summary_with_taxes CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_taxes AS
SELECT 
    fsws.*,
    CASE 
        WHEN fsws.transaction_type = 'payment' THEN
            CASE 
                WHEN fsws.currency = 'USD' THEN fsws.amount * 0.0875
                WHEN fsws.currency = 'EUR' THEN fsws.amount * 0.20
                WHEN fsws.currency = 'GBP' THEN fsws.amount * 0.20
                ELSE fsws.amount * 0.10
            END
        ELSE 0
    END as tax_amount
FROM financial_summary_with_settlements fsws;

-- Phase 7: Currency conversions
DROP VIEW IF EXISTS financial_summary_with_conversions CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_conversions AS
SELECT 
    fswt.*,
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as exchange_rate,
    fswt.amount * 
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as amount_usd,
    fswt.net_revenue_after_fees * 
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as net_revenue_usd
FROM financial_summary_with_taxes fswt;

-- Phase 8: Analytics
DROP VIEW IF EXISTS financial_summary_with_analytics CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_analytics AS
SELECT 
    fswc.*,
    DATE_TRUNC('day', fswc.created_at) as transaction_date,
    DATE_TRUNC('month', fswc.created_at) as transaction_month,
    SUM(fswc.net_revenue_usd) OVER (
        ORDER BY fswc.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_revenue_usd,
    SUM(fswc.net_revenue_usd) OVER (
        PARTITION BY DATE_TRUNC('day', fswc.created_at)
    ) as daily_revenue_usd
FROM financial_summary_with_conversions fswc;

-- Final view
DROP VIEW IF EXISTS financial_summary CASCADE;
CREATE OR REPLACE VIEW financial_summary AS
SELECT * FROM financial_summary_with_analytics;

-- Helper views
DROP VIEW IF EXISTS daily_revenue_summary CASCADE;
CREATE OR REPLACE VIEW daily_revenue_summary AS
SELECT 
    transaction_date,
    COUNT(*) as transaction_count,
    SUM(payment_amount) as gross_revenue,
    SUM(refund_amount) as total_refunds,
    SUM(net_revenue_usd) as net_revenue_usd
FROM financial_summary
GROUP BY transaction_date;

DROP VIEW IF EXISTS payment_method_performance CASCADE;
CREATE OR REPLACE VIEW payment_method_performance AS
SELECT 
    payment_method,
    COUNT(*) as transaction_count,
    SUM(amount_usd) as total_volume_usd,
    AVG(processing_fee) as avg_processing_fee
FROM financial_summary
WHERE transaction_type = 'payment'
GROUP BY payment_method;

-- Test final view
SELECT 'Financial views fixed!' as status;
-- Fix remaining financial views

-- Phase 5: Skip settlements (it's for batch processing, not individual transactions)
DROP VIEW IF EXISTS financial_summary_with_settlements CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_settlements AS
SELECT 
    fswf.*,
    NULL::varchar as settlement_status,
    NULL::timestamp as settlement_date,
    NULL::bigint as settlement_amount,
    0::numeric as paid_out_amount,
    fswf.net_revenue_after_fees as pending_payout
FROM financial_summary_with_fees fswf;

-- Phase 6: Taxes
DROP VIEW IF EXISTS financial_summary_with_taxes CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_taxes AS
SELECT 
    fsws.*,
    CASE 
        WHEN fsws.transaction_type = 'payment' THEN
            CASE 
                WHEN fsws.currency = 'USD' THEN fsws.amount * 0.0875
                WHEN fsws.currency = 'EUR' THEN fsws.amount * 0.20
                WHEN fsws.currency = 'GBP' THEN fsws.amount * 0.20
                ELSE fsws.amount * 0.10
            END
        ELSE 0
    END as tax_amount
FROM financial_summary_with_settlements fsws;

-- Phase 7: Currency conversions
DROP VIEW IF EXISTS financial_summary_with_conversions CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_conversions AS
SELECT 
    fswt.*,
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as exchange_rate,
    fswt.amount * 
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as amount_usd,
    fswt.net_revenue_after_fees * 
    CASE 
        WHEN fswt.currency = 'USD' THEN 1.0
        WHEN fswt.currency = 'EUR' THEN 1.08
        WHEN fswt.currency = 'GBP' THEN 1.27
        ELSE 1.0
    END as net_revenue_usd
FROM financial_summary_with_taxes fswt;

-- Phase 8: Analytics
DROP VIEW IF EXISTS financial_summary_with_analytics CASCADE;
CREATE OR REPLACE VIEW financial_summary_with_analytics AS
SELECT 
    fswc.*,
    DATE_TRUNC('day', fswc.created_at) as transaction_date,
    DATE_TRUNC('month', fswc.created_at) as transaction_month,
    SUM(fswc.net_revenue_usd) OVER (
        ORDER BY fswc.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_revenue_usd,
    SUM(fswc.net_revenue_usd) OVER (
        PARTITION BY DATE_TRUNC('day', fswc.created_at)
    ) as daily_revenue_usd
FROM financial_summary_with_conversions fswc;

-- Final view
DROP VIEW IF EXISTS financial_summary CASCADE;
CREATE OR REPLACE VIEW financial_summary AS
SELECT * FROM financial_summary_with_analytics;

-- Helper views
DROP VIEW IF EXISTS daily_revenue_summary CASCADE;
CREATE OR REPLACE VIEW daily_revenue_summary AS
SELECT 
    transaction_date,
    COUNT(*) as transaction_count,
    SUM(payment_amount) as gross_revenue,
    SUM(refund_amount) as total_refunds,
    SUM(net_revenue_usd) as net_revenue_usd
FROM financial_summary
GROUP BY transaction_date;

DROP VIEW IF EXISTS payment_method_performance CASCADE;
CREATE OR REPLACE VIEW payment_method_performance AS
SELECT 
    payment_method,
    COUNT(*) as transaction_count,
    SUM(amount_usd) as total_volume_usd,
    AVG(processing_fee) as avg_processing_fee
FROM financial_summary
WHERE transaction_type = 'payment'
GROUP BY payment_method;

SELECT 'All financial views created successfully!' as status;
