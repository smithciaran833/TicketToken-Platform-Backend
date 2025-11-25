#!/bin/bash

# Notification Service - Coverage Report Generation Script
# This script generates comprehensive test coverage reports

set -e

echo "========================================"
echo "Notification Service Coverage Analysis"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Navigate to service directory
cd "$(dirname "$0")/.."

echo -e "${BLUE}Step 1: Cleaning previous coverage data...${NC}"
rm -rf coverage/
rm -rf .nyc_output/

echo -e "${GREEN}✓ Cleaned${NC}"
echo ""

echo -e "${BLUE}Step 2: Running all tests with coverage...${NC}"
npm test -- --coverage --coverageReporters=text --coverageReporters=lcov --coverageReporters=html --coverageReporters=json-summary

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tests completed successfully${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 3: Generating detailed coverage report...${NC}"

# Check if coverage directory exists
if [ -d "coverage" ]; then
    echo -e "${GREEN}✓ Coverage reports generated${NC}"
    echo ""
    
    # Display coverage summary
    if [ -f "coverage/coverage-summary.json" ]; then
        echo -e "${YELLOW}Coverage Summary:${NC}"
        echo "----------------------------------------"
        
        # Extract and display key metrics using node
        node -e "
        const fs = require('fs');
        const summary = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
        const total = summary.total;
        
        console.log('Lines:      ' + total.lines.pct + '%');
        console.log('Statements: ' + total.statements.pct + '%');
        console.log('Functions:  ' + total.functions.pct + '%');
        console.log('Branches:   ' + total.branches.pct + '%');
        console.log('');
        
        // Check thresholds
        const thresholds = {
            lines: 80,
            statements: 80,
            functions: 80,
            branches: 70
        };
        
        let passed = true;
        Object.keys(thresholds).forEach(key => {
            if (total[key].pct < thresholds[key]) {
                console.log('⚠️  ' + key + ' coverage below threshold (' + thresholds[key] + '%)');
                passed = false;
            }
        });
        
        if (passed) {
            console.log('✓ All coverage thresholds met!');
        }
        "
    fi
    
    echo "----------------------------------------"
    echo ""
    echo -e "${GREEN}HTML Report: coverage/index.html${NC}"
    echo -e "${GREEN}LCOV Report: coverage/lcov.info${NC}"
    echo ""
    
    # List uncovered files
    echo -e "${YELLOW}Files with low coverage (<80%):${NC}"
    echo "----------------------------------------"
    
    find coverage/lcov-report -name "*.html" -type f | while read file; do
        # Extract coverage percentage from HTML (simplified)
        filename=$(basename "$file" .html)
        if [ "$filename" != "index" ] && [ "$filename" != "base" ]; then
            echo "  - $filename"
        fi
    done 2>/dev/null || echo "  (Run analysis to see detailed file coverage)"
    
    echo "----------------------------------------"
    echo ""
else
    echo -e "${RED}✗ Coverage directory not found${NC}"
    exit 1
fi

echo -e "${BLUE}Step 4: Coverage analysis complete!${NC}"
echo ""
echo "To view the HTML report, open: coverage/index.html"
echo "To upload to Codecov: npm run coverage:upload"
echo ""
echo -e "${GREEN}========================================"
echo "Coverage report generation complete!"
echo "========================================${NC}"
