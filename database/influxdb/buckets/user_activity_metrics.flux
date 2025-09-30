// User Activity Metrics Bucket Configuration
// Purpose: Track user behavior, engagement, and interaction patterns
// Retention: 60 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "user_activity_metrics"
org = "tickettoken"
retention = "60d"
description = "User behavior, engagement, conversion tracking, and predictive analytics"

// User Session Metrics
session_metrics = {
    measurement: "sessions",
    tags: [
        "user_id",
        "device_type",
        "platform",
        "country",
        "user_segment",
        "acquisition_source",
        "browser",
        "experiment_group"
    ],
    fields: {
        session_duration: "float",
        page_views: "integer",
        actions_performed: "integer",
        session_value: "float",
        bounce: "boolean",
        events_triggered: "integer",
        conversion_value: "float",
        engagement_depth: "float",
        frustration_score: "float"
    }
}

// Page View Metrics
pageview_metrics = {
    measurement: "pageviews",
    tags: [
        "page_path",
        "page_type",
        "referrer",
        "device_type",
        "user_segment",
        "experiment_id",
        "utm_source",
        "utm_campaign"
    ],
    fields: {
        view_count: "integer",
        time_on_page: "float",
        scroll_depth: "float",
        exit_rate: "float",
        load_time: "float",
        interaction_count: "integer",
        rage_clicks: "integer",
        dead_clicks: "integer",
        attention_time: "float"
    }
}

// User Action Metrics
action_metrics = {
    measurement: "actions",
    tags: [
        "action_type",
        "action_category",
        "user_segment",
        "platform",
        "feature",
        "context",
        "ab_test_variant",
        "user_intent"
    ],
    fields: {
        action_count: "integer",
        completion_rate: "float",
        time_to_complete: "float",
        error_count: "integer",
        success_rate: "float",
        retry_count: "integer",
        abandonment_rate: "float",
        effort_score: "float",
        value_generated: "float"
    }
}

// User Engagement Metrics
engagement_metrics = {
    measurement: "engagement",
    tags: [
        "user_id",
        "engagement_type",
        "content_type",
        "platform",
        "user_cohort",
        "lifecycle_stage"
    ],
    fields: {
        daily_active: "boolean",
        weekly_active: "boolean",
        monthly_active: "boolean",
        engagement_score: "float",
        content_interactions: "integer",
        shares: "integer",
        saves: "integer",
        time_spent: "float",
        recency_score: "float",
        frequency_score: "float",
        monetary_score: "float"
    }
}

// Conversion Funnel Metrics
conversion_metrics = {
    measurement: "conversions",
    tags: [
        "funnel_name",
        "funnel_step",
        "user_segment",
        "traffic_source",
        "device_type",
        "experiment_variant",
        "user_intent"
    ],
    fields: {
        step_entries: "integer",
        step_exits: "integer",
        conversions: "integer",
        conversion_rate: "float",
        time_to_convert: "float",
        drop_off_rate: "float",
        revenue_generated: "float",
        micro_conversions: "integer",
        macro_conversions: "integer",
        conversion_probability: "float"
    }
}

// Feature Usage Metrics
feature_usage_metrics = {
    measurement: "feature_usage",
    tags: [
        "feature_name",
        "feature_category",
        "user_segment",
        "platform",
        "version",
        "rollout_group"
    ],
    fields: {
        usage_count: "integer",
        unique_users: "integer",
        adoption_rate: "float",
        retention_rate: "float",
        time_to_first_use: "float",
        feature_stickiness: "float",
        satisfaction_score: "float",
        feature_depth: "float",
        churn_risk: "float"
    }
}

// Search Behavior Metrics
search_metrics = {
    measurement: "search_behavior",
    tags: [
        "search_type",
        "results_found",
        "platform",
        "user_segment",
        "search_context"
    ],
    fields: {
        search_count: "integer",
        query_length: "integer",
        results_clicked: "integer",
        click_through_rate: "float",
        zero_results_rate: "float",
        refinement_count: "integer",
        time_to_click: "float",
        search_success_rate: "float",
        query_reformulation_rate: "float"
    }
}

// User Journey Metrics
journey_metrics = {
    measurement: "user_journey",
    tags: [
        "journey_type",
        "entry_point",
        "exit_point",
        "user_segment",
        "device_type",
        "journey_intent"
    ],
    fields: {
        journey_duration: "float",
        steps_completed: "integer",
        total_steps: "integer",
        completion_rate: "float",
        backtrack_count: "integer",
        assistance_requests: "integer",
        friction_points: "integer",
        journey_value: "float"
    }
}

// Behavioral Analytics
behavioral_analytics = {
    measurement: "behavior_patterns",
    tags: [
        "user_id",
        "behavior_type",
        "user_persona",
        "lifecycle_stage"
    ],
    fields: {
        behavior_score: "float",
        intent_clarity: "float",
        task_success_rate: "float",
        frustration_events: "integer",
        delight_events: "integer",
        habit_strength: "float",
        predictive_ltv: "float",
        churn_probability: "float"
    }
}

// Cohort Analysis
cohort_metrics = {
    measurement: "cohort_analysis",
    tags: [
        "cohort_week",
        "cohort_month",
        "acquisition_channel",
        "user_segment",
        "cohort_type"
    ],
    fields: {
        cohort_size: "integer",
        retention_week_1: "float",
        retention_week_2: "float",
        retention_week_4: "float",
        retention_week_12: "float",
        revenue_per_cohort: "float",
        average_session_length: "float",
        feature_adoption_rate: "float"
    }
}

// Event Stream Analytics
event_stream_metrics = {
    measurement: "event_stream",
    tags: [
        "event_name",
        "event_category",
        "user_id",
        "session_id",
        "platform"
    ],
    fields: {
        event_count: "integer",
        event_value: "float",
        sequence_position: "integer",
        time_since_last_event: "float",
        event_properties: "string"
    }
}

// Predictive Metrics
predictive_metrics = {
    measurement: "predictions",
    tags: [
        "user_id",
        "prediction_type",
        "model_version",
        "confidence_level"
    ],
    fields: {
        churn_score: "float",
        ltv_prediction: "float",
        next_purchase_probability: "float",
        engagement_forecast: "float",
        upsell_probability: "float",
        referral_likelihood: "float",
        satisfaction_prediction: "float"
    }
}

// Activity Retention Policies
activity_retention = {
    raw_events: "60d",
    hourly_aggregates: "180d",
    daily_aggregates: "2y",
    weekly_aggregates: "5y",
    cohort_data: "5y"
}

// Engagement Thresholds
engagement_thresholds = {
    active_session_minimum: 30,     // seconds
    engaged_user_actions: 3,        // per session
    power_user_sessions: 10,        // per week
    feature_adoption_target: 0.25,  // 25% of users
    conversion_goal: 0.02,          // 2% conversion rate
    retention_target_week_1: 0.40,  // 40% week 1 retention
    retention_target_month_1: 0.20  // 20% month 1 retention
}

// Behavioral Segments
behavioral_segments = {
    new_users: "sessions < 3",
    active_users: "sessions >= 3 AND last_seen < 7d",
    at_risk_users: "last_seen >= 7d AND last_seen < 30d",
    churned_users: "last_seen >= 30d",
    power_users: "sessions >= 50 AND feature_usage >= 10",
    high_value_users: "ltv >= 100 OR purchases >= 5"
}

// Analytics Dashboards
analytics_dashboards = {
    user_overview: {
        widgets: ["dau_mau_ratio", "user_segments", "engagement_trends", "retention_curves"],
        refresh_interval: "60s"
    },
    conversion_analytics: {
        widgets: ["funnel_visualization", "conversion_rates", "revenue_impact", "ab_test_results"],
        refresh_interval: "300s"
    },
    behavioral_insights: {
        widgets: ["user_flows", "feature_adoption", "friction_points", "predictive_scores"],
        refresh_interval: "900s"
    },
    cohort_performance: {
        widgets: ["retention_matrix", "ltv_curves", "behavior_evolution", "segment_migration"],
        refresh_interval: "3600s"
    }
}

// Aggregation Queries
from(bucket: "user_activity_metrics")
  |> range(start: -60d)
  |> filter(fn: (r) => r._measurement =~ /sessions|pageviews|actions|engagement|conversions/)
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "user_activity_hourly", org: "tickettoken")

// User Scoring Calculation
user_engagement_score = from(bucket: "user_activity_metrics")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "engagement")
  |> map(fn: (r) => ({
      r with
      engagement_score: (r.recency_score * 0.3) + (r.frequency_score * 0.3) + (r.monetary_score * 0.4)
  }))

// Churn Prediction Model Inputs
churn_indicators = {
    decreasing_session_frequency: true,
    reduced_feature_usage: true,
    increased_error_rate: true,
    support_ticket_increase: true,
    payment_failure: true
}
