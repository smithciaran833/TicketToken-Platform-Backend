#!/bin/bash

TABLE_NAME=$1
SERVICE_FILE="../schema-extraction/payment-service-complete.md"

if [ -z "$TABLE_NAME" ]; then
  echo "Usage: ./compile-table-references.sh <table_name>"
  exit 1
fi

echo "=========================================="
echo "TABLE: $TABLE_NAME"
echo "=========================================="
echo ""

# Get all line numbers where table appears
LINE_NUMBERS=$(grep -n "$TABLE_NAME" $SERVICE_FILE | cut -d: -f1)
TOTAL=$(echo "$LINE_NUMBERS" | wc -l)

echo "Total occurrences: $TOTAL"
echo ""

COUNTER=1
for LINE in $LINE_NUMBERS; do
  START=$((LINE - 20))
  END=$((LINE + 20))
  
  if [ $START -lt 1 ]; then
    START=1
  fi
  
  echo "----------------------------------------"
  echo "OCCURRENCE $COUNTER/$TOTAL AT LINE: $LINE"
  echo "----------------------------------------"
  sed -n "${START},${END}p" $SERVICE_FILE
  echo ""
  echo ""
  
  COUNTER=$((COUNTER + 1))
done
