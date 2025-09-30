#!/bin/bash

# Service configuration matrix
declare -A SERVICE_TYPE=(
    ["analytics-service"]="typescript"
    ["api-gateway"]="typescript"
    ["auth-service"]="typescript"
    ["blockchain-indexer"]="javascript"
    ["blockchain-service"]="javascript"
    ["compliance-service"]="typescript"
    ["event-service"]="typescript"
    ["file-service"]="typescript"
    ["integration-service"]="typescript"
    ["marketplace-service"]="typescript"
    ["minting-service"]="javascript"
    ["monitoring-service"]="typescript"
    ["notification-service"]="typescript"
    ["order-service"]="javascript"
    ["payment-service"]="typescript"
    ["queue-service"]="typescript"
    ["scanning-service"]="javascript"
    ["search-service"]="typescript"
    ["ticket-service"]="typescript"
    ["transfer-service"]="javascript"
    ["venue-service"]="typescript"
)

declare -A SERVICE_PORT=(
    ["api-gateway"]=3000
    ["auth-service"]=3001
    ["venue-service"]=3002
    ["event-service"]=3003
    ["ticket-service"]=3004
    ["order-service"]=3005
    ["payment-service"]=3006
    ["marketplace-service"]=3008
    ["scanning-service"]=3009
    ["notification-service"]=3010
    ["queue-service"]=3011
    ["blockchain-service"]=3012
    ["blockchain-indexer"]=3013
    ["minting-service"]=3014
    ["compliance-service"]=3015
    ["analytics-service"]=3016
    ["search-service"]=3017
    ["file-service"]=3018
    ["integration-service"]=3019
    ["monitoring-service"]=3020
    ["transfer-service"]=3021
)

# Export for use in Docker builds
export SERVICE_TYPE
export SERVICE_PORT
