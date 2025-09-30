#!/bin/bash
# Fix all REAL/FLOAT money columns to NUMERIC(10,2)

set -euo pipefail

echo "Fixing money column data types..."

# Function to fix money columns in a file
fix_money_columns() {
    local file=$1
    echo "Checking for money columns in: $file"
    
    # Common money-related column names
    money_columns=(
        "amount"
        "price"
        "base_price"
        "service_fee"
        "facility_fee"
        "total"
        "subtotal"
        "tax"
        "discount"
        "revenue"
        "cost"
        "balance"
        "fee"
        "rate"
        "commission"
    )
    
    # Check if file has any money columns
    local has_changes=false
    
    for column in "${money_columns[@]}"; do
        # Replace REAL with NUMERIC(10,2)
        if grep -q "${column} REAL" "$file"; then
            sed -i "s/${column} REAL/${column} NUMERIC(10,2)/g" "$file"
            has_changes=true
        fi
        
        # Replace FLOAT with NUMERIC(10,2)
        if grep -q "${column} FLOAT" "$file"; then
            sed -i "s/${column} FLOAT/${column} NUMERIC(10,2)/g" "$file"
            has_changes=true
        fi
        
        # Replace DOUBLE PRECISION with NUMERIC(10,2) for money columns
        if grep -q "${column} DOUBLE PRECISION" "$file"; then
            sed -i "s/${column} DOUBLE PRECISION/${column} NUMERIC(10,2)/g" "$file"
            has_changes=true
        fi
    done
    
    if [ "$has_changes" = true ]; then
        echo "  Fixed money columns in $file"
        
        # Add CHECK constraints for non-negative amounts
        if grep -q "amount NUMERIC" "$file" && ! grep -q "CHECK.*amount.*>=" "$file"; then
            # Add constraint after the column definition
            sed -i '/amount NUMERIC/s/,/, CHECK (amount >= 0),/' "$file"
        fi
        
        if grep -q "price NUMERIC" "$file" && ! grep -q "CHECK.*price.*>=" "$file"; then
            sed -i '/price NUMERIC/s/,/, CHECK (price >= 0),/' "$file"
        fi
    fi
}

# Process payment-related schema files first (most likely to have money columns)
echo "Processing payment schemas..."
find database/postgresql/schemas/payments -name "*.sql" -type f | while read -r file; do
    fix_money_columns "$file"
done

echo -e "\nProcessing event pricing schemas..."
find database/postgresql/schemas/events -name "*pricing*.sql" -type f | while read -r file; do
    fix_money_columns "$file"
done

echo -e "\nProcessing ticket schemas..."
find database/postgresql/schemas/tickets -name "*.sql" -type f | while read -r file; do
    fix_money_columns "$file"
done

echo -e "\nProcessing marketplace schemas..."
find database/postgresql/schemas/marketplace -name "*.sql" -type f | while read -r file; do
    fix_money_columns "$file"
done

echo -e "\nChecking all other schemas..."
find database/postgresql/schemas -name "*.sql" -type f | while read -r file; do
    if [[ ! "$file" =~ "payments|tickets|marketplace|pricing" ]]; then
        fix_money_columns "$file"
    fi
done

echo "Money column fixes complete!"
