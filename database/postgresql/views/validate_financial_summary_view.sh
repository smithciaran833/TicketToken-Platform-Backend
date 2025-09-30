#!/bin/bash

# Validation script for financial_summary_view.sql
# Tests each incremental phase to ensure functionality

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database connection details
DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Test function
test_phase() {
    local phase_name="$1"
    local view_name="$2"
    local test_query="$3"
    
    echo -e "\n${BLUE}Testing Phase: $phase_name${NC}"
    
    # Test if view exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM $view_name LIMIT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ View exists${NC}"
        
        # Get row count
        local count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM $view_name")
        echo -e "${GREEN}✓ Row count: $count${NC}"
        
        # Run specific test
        if [ ! -z "$test_query" ]; then
            echo -e "${YELLOW}Running test query:${NC}"
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$test_query"
        fi
        
        return 0
    else
        echo -e "${RED}✗ View creation failed${NC}"
        return 1
    fi
}

# Main validation
echo -e "${YELLOW}=== Financial Summary View Validation ===${NC}"
echo -e "Database: $DB_NAME"
echo -e "Time: $(date)"

# Track phases
PHASES_COMPLETED=0

# Phase 1: Basic View
if test_phase "Phase 1 - Basic View" "financial_summary_basic" \
    "SELECT COUNT(*), MIN(amount), MAX(amount) FROM financial_summary_basic;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 2: Payment Methods
if test_phase "Phase 2 - Payment Methods" "financial_summary_payment_methods" \
    "SELECT payment_method, COUNT(*) FROM financial_summary_payment_methods GROUP BY payment_method LIMIT 5;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 3: Refunds
if test_phase "Phase 3 - Refunds" "financial_summary_with_refunds" \
    "SELECT transaction_type, SUM(payment_amount) as payments, SUM(refund_amount) as refunds, SUM(net_amount) as net FROM financial_summary_with_refunds GROUP BY transaction_type;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 4: Fees
if test_phase "Phase 4 - Fees" "financial_summary_with_fees" \
    "SELECT payment_method, AVG(processing_fee), AVG(platform_fee) FROM financial_summary_with_fees WHERE transaction_type = 'payment' GROUP BY payment_method;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 5: Settlements
if test_phase "Phase 5 - Settlements" "financial_summary_with_settlements" \
    "SELECT settlement_status, COUNT(*), SUM(pending_payout) FROM financial_summary_with_settlements GROUP BY settlement_status;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 6: Taxes
if test_phase "Phase 6 - Taxes" "financial_summary_with_taxes" \
    "SELECT currency, SUM(tax_amount) FROM financial_summary_with_taxes WHERE transaction_type = 'payment' GROUP BY currency;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 7: Currency Conversions
if test_phase "Phase 7 - Currency" "financial_summary_with_conversions" \
    "SELECT currency, exchange_rate, SUM(amount) as original, SUM(amount_usd) as usd FROM financial_summary_with_conversions GROUP BY currency, exchange_rate;"; then
    ((PHASES_COMPLETED++))
fi

# Phase 8: Analytics
if test_phase "Phase 8 - Analytics" "financial_summary_with_analytics" \
    "SELECT transaction_date, MAX(cumulative_revenue_usd) FROM financial_summary_with_analytics GROUP BY transaction_date ORDER BY transaction_date DESC LIMIT 5;"; then
    ((PHASES_COMPLETED++))
fi

# Final View
echo -e "\n${YELLOW}=== Testing Final View ===${NC}"
if test_phase "Final View" "financial_summary" \
    "SELECT COUNT(*) as total_transactions, SUM(net_revenue_usd) as total_revenue FROM financial_summary;"; then
    echo -e "${GREEN}✓ Final view operational${NC}"
fi

# Test helper views
echo -e "\n${YELLOW}=== Testing Helper Views ===${NC}"
test_phase "Daily Revenue" "daily_revenue_summary" \
    "SELECT * FROM daily_revenue_summary ORDER BY transaction_date DESC LIMIT 3;"

test_phase "Payment Performance" "payment_method_performance" \
    "SELECT * FROM payment_method_performance;"

# Summary
echo -e "\n${YELLOW}=== Validation Summary ===${NC}"
echo -e "Phases completed: ${GREEN}$PHASES_COMPLETED${NC} / 8"

if [ $PHASES_COMPLETED -eq 8 ]; then
    echo -e "${GREEN}✓ All phases completed successfully!${NC}"
else
    echo -e "${RED}✗ Some phases failed. Check errors above.${NC}"
fi

# Feature availability
echo -e "\n${YELLOW}=== Feature Availability ===${NC}"
echo "✓ Basic financial data" 
[ $PHASES_COMPLETED -ge 2 ] && echo "✓ Payment method breakdown" || echo "✗ Payment method breakdown"
[ $PHASES_COMPLETED -ge 3 ] && echo "✓ Refund calculations" || echo "✗ Refund calculations"
[ $PHASES_COMPLETED -ge 4 ] && echo "✓ Fee calculations" || echo "✗ Fee calculations"
[ $PHASES_COMPLETED -ge 5 ] && echo "✓ Settlement tracking" || echo "✗ Settlement tracking"
[ $PHASES_COMPLETED -ge 6 ] && echo "✓ Tax calculations" || echo "✗ Tax calculations"
[ $PHASES_COMPLETED -ge 7 ] && echo "✓ Currency conversions" || echo "✗ Currency conversions"
[ $PHASES_COMPLETED -ge 8 ] && echo "✓ Analytics & running totals" || echo "✗ Analytics & running totals"

echo -e "\n${GREEN}Validation completed at $(date)${NC}"
