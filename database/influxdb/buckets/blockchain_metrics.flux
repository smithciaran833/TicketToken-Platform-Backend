// Blockchain Metrics Bucket Configuration
// Purpose: Track blockchain performance, NFT operations, and smart contract interactions
// Retention: 90 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "blockchain_metrics"
org = "tickettoken"
retention = "90d"
description = "Comprehensive blockchain monitoring with security and cross-chain analytics"

// Transaction Metrics
transaction_metrics = {
    measurement: "transactions",
    tags: [
        "network",
        "transaction_type",
        "status",
        "program_id",
        "wallet_type",
        "priority_level",
        "signer_count"
    ],
    fields: {
        transaction_count: "integer",
        confirmation_time: "float",
        gas_used: "float",
        transaction_fee: "float",
        priority_fee: "float",
        compute_units: "integer",
        slot_number: "integer",
        block_height: "integer",
        retry_count: "integer",
        simulation_units: "integer"
    }
}

// NFT Operations
nft_metrics = {
    measurement: "nft_operations",
    tags: [
        "operation_type",
        "collection",
        "marketplace",
        "status",
        "venue_id",
        "token_standard",
        "creator_verified"
    ],
    fields: {
        mint_count: "integer",
        transfer_count: "integer",
        burn_count: "integer",
        list_count: "integer",
        sale_count: "integer",
        operation_time: "float",
        royalty_amount: "float",
        metadata_size: "integer",
        compressed: "boolean",
        update_authority_changes: "integer",
        freeze_authority_active: "boolean"
    }
}

// Smart Contract Metrics
contract_metrics = {
    measurement: "smart_contracts",
    tags: [
        "contract_address",
        "contract_type",
        "method_name",
        "network",
        "version",
        "caller_type",
        "security_audit_status"
    ],
    fields: {
        call_count: "integer",
        execution_time: "float",
        gas_consumed: "integer",
        error_count: "integer",
        success_rate: "float",
        state_changes: "integer",
        events_emitted: "integer",
        reentrancy_guards_triggered: "integer",
        admin_calls: "integer"
    }
}

// Wallet Analytics
wallet_metrics = {
    measurement: "wallet_analytics",
    tags: [
        "wallet_address",
        "wallet_type",
        "user_segment",
        "network",
        "risk_score"
    ],
    fields: {
        balance: "float",
        transaction_count: "integer",
        nft_count: "integer",
        gas_spent: "float",
        last_activity: "integer",
        wallet_age: "integer",
        interaction_count: "integer",
        unique_contracts_called: "integer",
        max_transaction_value: "float"
    }
}

// Network Performance
network_metrics = {
    measurement: "network_performance",
    tags: [
        "network",
        "rpc_endpoint",
        "region",
        "provider",
        "endpoint_type"
    ],
    fields: {
        tps: "float",
        block_time: "float",
        network_congestion: "float",
        slot_height: "integer",
        validator_count: "integer",
        total_stake: "float",
        network_fee: "float",
        skip_rate: "float",
        fork_count: "integer"
    }
}

// DeFi Metrics
defi_metrics = {
    measurement: "defi_operations",
    tags: [
        "protocol",
        "operation_type",
        "token_pair",
        "venue_id",
        "liquidity_pool"
    ],
    fields: {
        liquidity_amount: "float",
        swap_volume: "float",
        fee_earned: "float",
        impermanent_loss: "float",
        apy: "float",
        tvl: "float",
        slippage: "float",
        arbitrage_opportunities: "integer",
        mev_extracted: "float"
    }
}

// Gas Optimization Metrics
gas_metrics = {
    measurement: "gas_optimization",
    tags: [
        "operation_type",
        "optimization_level",
        "network",
        "time_period",
        "batch_size"
    ],
    fields: {
        average_gas_price: "float",
        gas_saved: "float",
        transactions_optimized: "integer",
        peak_gas_price: "float",
        optimal_gas_price: "float",
        priority_fee_saved: "float",
        batched_transactions: "integer",
        compression_savings: "float"
    }
}

// Marketplace Analytics
marketplace_blockchain_metrics = {
    measurement: "marketplace_blockchain",
    tags: [
        "marketplace",
        "collection",
        "price_range",
        "sale_type",
        "currency"
    ],
    fields: {
        floor_price: "float",
        volume_24h: "float",
        sales_count: "integer",
        unique_buyers: "integer",
        unique_sellers: "integer",
        average_price: "float",
        royalty_volume: "float",
        wash_trading_score: "float",
        liquidity_score: "float"
    }
}

// Security Monitoring
security_metrics = {
    measurement: "blockchain_security",
    tags: [
        "threat_type",
        "severity",
        "network",
        "contract_address",
        "detection_method"
    ],
    fields: {
        threat_count: "integer",
        blocked_transactions: "integer",
        suspicious_wallets: "integer",
        anomaly_score: "float",
        fraud_amount_prevented: "float",
        malicious_contracts_flagged: "integer",
        phishing_attempts: "integer",
        rug_pull_risk_score: "float"
    }
}

// Cross-Chain Metrics
crosschain_metrics = {
    measurement: "cross_chain",
    tags: [
        "source_chain",
        "destination_chain",
        "bridge_protocol",
        "asset_type",
        "status"
    ],
    fields: {
        bridge_volume: "float",
        bridge_count: "integer",
        average_bridge_time: "float",
        bridge_fee: "float",
        failed_bridges: "integer",
        liquidity_available: "float",
        slippage_tolerance: "float"
    }
}

// Validator Performance
validator_metrics = {
    measurement: "validator_performance",
    tags: [
        "validator_address",
        "commission_rate",
        "data_center",
        "network"
    ],
    fields: {
        vote_success_rate: "float",
        block_production_rate: "float",
        skip_rate: "float",
        stake_amount: "float",
        delegator_count: "integer",
        rewards_earned: "float",
        penalties_incurred: "float",
        uptime_percentage: "float"
    }
}

// Token Economics
token_economics_metrics = {
    measurement: "token_economics",
    tags: [
        "token_address",
        "token_type",
        "supply_type",
        "burn_mechanism"
    ],
    fields: {
        total_supply: "float",
        circulating_supply: "float",
        locked_supply: "float",
        burn_rate: "float",
        mint_rate: "float",
        velocity: "float",
        holder_count: "integer",
        concentration_index: "float"
    }
}

// Blockchain Retention Policies
blockchain_retention = {
    raw_data: "90d",
    hourly_aggregates: "1y",
    daily_aggregates: "3y",
    security_events: "5y"
}

// Performance Thresholds
performance_thresholds = {
    max_confirmation_time: 30.0,     // seconds
    min_success_rate: 95.0,          // percentage
    max_gas_price: 0.25,             // SOL
    max_network_congestion: 80.0,    // percentage
    min_tps: 1000.0,                 // transactions per second
    max_mev_extraction: 0.001,       // SOL per transaction
    min_validator_uptime: 95.0       // percentage
}

// Security Alert Rules
security_alerts = {
    high_value_transaction: "transaction_value > 1000",
    unusual_gas_price: "gas_price > avg_gas_price * 3",
    contract_vulnerability: "security_audit_status == 'failed'",
    wash_trading_detected: "wash_trading_score > 0.7",
    validator_downtime: "uptime_percentage < 90"
}

// Analytics Dashboards
blockchain_dashboards = {
    transaction_overview: {
        widgets: ["tps_chart", "confirmation_times", "fee_trends", "network_health"],
        refresh_interval: "10s"
    },
    nft_analytics: {
        widgets: ["mint_velocity", "marketplace_volume", "collection_rankings", "royalty_flows"],
        refresh_interval: "60s"
    },
    security_monitoring: {
        widgets: ["threat_dashboard", "anomaly_detection", "wallet_risk_scores", "contract_audits"],
        refresh_interval: "30s"
    },
    defi_performance: {
        widgets: ["liquidity_pools", "yield_farming", "impermanent_loss", "arbitrage_opportunities"],
        refresh_interval: "300s"
    },
    validator_health: {
        widgets: ["validator_performance", "stake_distribution", "network_decentralization", "rewards_tracking"],
        refresh_interval: "300s"
    }
}

// Aggregation Queries
from(bucket: "blockchain_metrics")
  |> range(start: -90d)
  |> filter(fn: (r) => r._measurement =~ /transactions|nft_operations|smart_contracts|security|validator/)
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "blockchain_metrics_hourly", org: "tickettoken")

// MEV Protection Calculations
mev_protection = from(bucket: "blockchain_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "defi_operations" and r._field == "mev_extracted")
  |> aggregate(fn: sum)
  |> map(fn: (r) => ({
      r with
      protection_efficiency: 1 - (r.mev_extracted / r.swap_volume)
  }))
