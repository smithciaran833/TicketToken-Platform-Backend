// Business Metrics Bucket Configuration
// Purpose: Track business KPIs, revenue, and growth metrics
// Retention: 90 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "business_metrics"
org = "tickettoken"
retention = "90d"
description = "Business KPIs, financial metrics, and growth analytics"

// Revenue Metrics
revenue_metrics = {
    measurement: "revenue",
    tags: [
        "source",
        "category",
        "currency",
        "payment_method",
        "region",
        "platform",
        "customer_segment"
    ],
    fields: {
        amount: "float",
        transaction_count: "integer",
        average_order_value: "float",
        fees_collected: "float",
        net_revenue: "float",
        refund_amount: "float",
        tax_collected: "float",
        gross_margin: "float"
    }
}

// User Metrics
user_metrics = {
    measurement: "users",
    tags: [
        "user_type",
        "acquisition_channel",
        "cohort",
        "segment",
        "region",
        "platform"
    ],
    fields: {
        new_users: "integer",
        active_users: "integer",
        churned_users: "integer",
        retention_rate: "float",
        lifetime_value: "float",
        engagement_score: "float",
        verified_users: "integer",
        paying_users: "integer",
        arpu: "float"
    }
}

// Transaction Metrics
transaction_metrics = {
    measurement: "transactions",
    tags: [
        "type",
        "status",
        "payment_provider",
        "currency",
        "channel",
        "risk_level"
    ],
    fields: {
        count: "integer",
        volume: "float",
        fee_revenue: "float",
        success_rate: "float",
        processing_time: "float",
        failed_count: "integer",
        fraud_detected: "integer",
        chargeback_count: "integer",
        dispute_amount: "float"
    }
}

// Ticket Sales Metrics
ticket_sales = {
    measurement: "ticket_sales",
    tags: [
        "event_category",
        "ticket_type",
        "sales_channel",
        "venue",
        "promoter",
        "currency",
        "price_tier"
    ],
    fields: {
        tickets_sold: "integer",
        revenue: "float",
        average_ticket_price: "float",
        early_bird_sales: "integer",
        vip_sales: "integer",
        group_sales: "integer",
        unsold_inventory: "integer",
        discount_amount: "float",
        sellout_time: "float"
    }
}

// Marketplace Metrics
marketplace_metrics = {
    measurement: "marketplace",
    tags: [
        "listing_type",
        "category",
        "seller_type",
        "transaction_status",
        "price_range"
    ],
    fields: {
        new_listings: "integer",
        active_listings: "integer",
        completed_sales: "integer",
        gmv: "float",
        average_sale_price: "float",
        take_rate: "float",
        seller_payout: "float",
        time_to_sale: "float",
        price_premium: "float",
        buyer_fees: "float"
    }
}

// Event Metrics
event_metrics = {
    measurement: "events",
    tags: [
        "category",
        "venue_type",
        "promoter",
        "status",
        "capacity_tier"
    ],
    fields: {
        events_created: "integer",
        events_published: "integer",
        events_cancelled: "integer",
        total_capacity: "integer",
        average_attendance: "float",
        sell_through_rate: "float",
        revenue_per_event: "float",
        repeat_attendance_rate: "float"
    }
}

// Customer Support Metrics
support_metrics = {
    measurement: "customer_support",
    tags: [
        "channel",
        "issue_type",
        "priority",
        "resolution_status",
        "agent_team"
    ],
    fields: {
        tickets_created: "integer",
        tickets_resolved: "integer",
        resolution_time: "float",
        satisfaction_score: "float",
        escalation_count: "integer",
        first_contact_resolution: "float",
        cost_per_ticket: "float"
    }
}

// Marketing Metrics
marketing_metrics = {
    measurement: "marketing",
    tags: [
        "campaign",
        "channel",
        "medium",
        "source",
        "content_type"
    ],
    fields: {
        impressions: "integer",
        clicks: "integer",
        conversions: "integer",
        cost: "float",
        revenue_attributed: "float",
        roi: "float",
        cac: "float",
        ltv_cac_ratio: "float",
        engagement_rate: "float"
    }
}

// Financial Reporting Metrics
financial_metrics = {
    measurement: "financial_reporting",
    tags: [
        "report_type",
        "period",
        "currency",
        "business_unit"
    ],
    fields: {
        gross_revenue: "float",
        net_revenue: "float",
        operating_expenses: "float",
        ebitda: "float",
        cash_flow: "float",
        accounts_receivable: "float",
        deferred_revenue: "float",
        mrr: "float",
        arr: "float"
    }
}

// Growth Metrics
growth_metrics = {
    measurement: "growth",
    tags: [
        "metric_type",
        "segment",
        "period"
    ],
    fields: {
        growth_rate: "float",
        compound_growth_rate: "float",
        market_share: "float",
        nps_score: "float",
        viral_coefficient: "float",
        cohort_retention: "float"
    }
}

// Blockchain Economics
blockchain_economics = {
    measurement: "blockchain_economics",
    tags: [
        "token_type",
        "network",
        "transaction_type"
    ],
    fields: {
        token_price: "float",
        market_cap: "float",
        trading_volume: "float",
        staking_rewards: "float",
        burn_amount: "float",
        circulation_supply: "float",
        treasury_balance: "float"
    }
}

// Forecasting Metrics
forecasting_metrics = {
    measurement: "forecasts",
    tags: [
        "model_type",
        "metric",
        "confidence_level"
    ],
    fields: {
        predicted_value: "float",
        actual_value: "float",
        variance: "float",
        mape: "float",
        confidence_interval_lower: "float",
        confidence_interval_upper: "float"
    }
}

// Retention Policies
retention_policies = [
    {
        name: "raw",
        duration: "30d",
        replication: 1,
        shardGroupDuration: "1d",
        default: true
    },
    {
        name: "aggregated_hourly",
        duration: "90d",
        replication: 1,
        shardGroupDuration: "1d"
    },
    {
        name: "aggregated_daily", 
        duration: "365d",
        replication: 1,
        shardGroupDuration: "7d"
    },
    {
        name: "aggregated_monthly",
        duration: "5y",
        replication: 1,
        shardGroupDuration: "30d"
    }
]

// Continuous Queries for Business Intelligence
continuous_queries = [
    {
        name: "cq_hourly_revenue",
        interval: "1h",
        query: '''
            CREATE CONTINUOUS QUERY cq_hourly_revenue ON business_metrics
            BEGIN
                SELECT 
                    sum("amount") as hourly_revenue,
                    sum("transaction_count") as hourly_transactions,
                    mean("average_order_value") as avg_order_value,
                    sum("net_revenue") as hourly_net_revenue
                INTO business_metrics.aggregated_hourly.revenue
                FROM business_metrics.raw.revenue
                GROUP BY time(1h), *
            END
        '''
    },
    {
        name: "cq_daily_financial",
        interval: "1d",
        query: '''
            CREATE CONTINUOUS QUERY cq_daily_financial ON business_metrics
            BEGIN
                SELECT 
                    sum("gross_revenue") as daily_gross_revenue,
                    sum("net_revenue") as daily_net_revenue,
                    sum("operating_expenses") as daily_expenses,
                    last("mrr") as current_mrr
                INTO business_metrics.aggregated_daily.financial_reporting
                FROM business_metrics.raw.financial_reporting
                GROUP BY time(1d), business_unit
            END
        '''
    },
    {
        name: "cq_marketplace_gmv",
        interval: "1h",
        query: '''
            CREATE CONTINUOUS QUERY cq_marketplace_gmv ON business_metrics
            BEGIN
                SELECT 
                    sum("gmv") as hourly_gmv,
                    sum("completed_sales") as hourly_sales,
                    mean("average_sale_price") as avg_price,
                    mean("take_rate") as avg_take_rate
                INTO business_metrics.aggregated_hourly.marketplace
                FROM business_metrics.raw.marketplace
                GROUP BY time(1h), category
            END
        '''
    }
]

// Alert Rules
alert_rules = [
    {
        name: "revenue_drop",
        query: '''
            SELECT mean("amount") 
            FROM revenue 
            WHERE time > now() - 1h 
            GROUP BY source
        ''',
        condition: "value < 0.8 * previous_day_avg",
        message: "Revenue dropped 20% below daily average for {source}"
    },
    {
        name: "high_churn_rate",
        query: '''
            SELECT sum("churned_users") / sum("active_users") * 100
            FROM users 
            WHERE time > now() - 24h
        ''',
        condition: "value > 5",
        message: "Daily churn rate exceeds 5%"
    },
    {
        name: "low_marketplace_liquidity",
        query: '''
            SELECT sum("active_listings") / sum("completed_sales")
            FROM marketplace
            WHERE time > now() - 1h
        ''',
        condition: "value > 100",
        message: "Marketplace liquidity ratio exceeds 100:1"
    }
]

// KPI Calculations
kpi_queries = {
    monthly_recurring_revenue: '''
        SELECT last("mrr") as MRR
        FROM financial_reporting
        WHERE time > now() - 1d
    ''',
    
    customer_acquisition_cost: '''
        SELECT sum("cost") / sum("conversions") as CAC
        FROM marketing
        WHERE time > now() - 30d
        GROUP BY channel
    ''',
    
    gross_merchandise_value: '''
        SELECT sum("gmv") as total_gmv
        FROM marketplace
        WHERE time > now() - 30d
    ''',
    
    average_revenue_per_user: '''
        SELECT sum("amount") / count(distinct("user_id")) as ARPU
        FROM revenue
        WHERE time > now() - 30d
    ''',
    
    sell_through_rate: '''
        SELECT 
            sum("tickets_sold") / sum("total_capacity") * 100 as STR
        FROM ticket_sales, events
        WHERE time > now() - 7d
        GROUP BY event_category
    '''
}

// Dashboards Configuration
dashboards = [
    {
        name: "Executive Dashboard",
        refresh: "5m",
        panels: [
            "monthly_recurring_revenue",
            "gross_merchandise_value", 
            "active_users_trend",
            "revenue_by_source"
        ]
    },
    {
        name: "Financial Dashboard",
        refresh: "15m",
        panels: [
            "profit_and_loss",
            "cash_flow_statement",
            "revenue_forecast",
            "expense_breakdown"
        ]
    },
    {
        name: "Marketplace Dashboard",
        refresh: "1m",
        panels: [
            "real_time_gmv",
            "listing_velocity",
            "price_trends",
            "seller_performance"
        ]
    }
]
