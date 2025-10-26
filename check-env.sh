#!/bin/bash

echo "=== Environment Variables Check ==="
echo ""

source .env

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_var() {
    local var_name=$1
    local var_value=${!var_name}
    local required=$2
    
    if [ -z "$var_value" ] || [ "$var_value" == "your_"* ] || [ "$var_value" == "EQC..." ]; then
        if [ "$required" == "required" ]; then
            echo -e "${RED}✗ $var_name - NOT SET${NC}"
            return 1
        else
            echo -e "${YELLOW}⚠ $var_name - Optional (not set)${NC}"
            return 0
        fi
    else
        echo -e "${GREEN}✓ $var_name${NC} = $var_value"
        return 0
    fi
}

errors=0

echo "Database Configuration:"
check_var "DATABASE_URL" "required" || ((errors++))
echo ""

echo "Telegram Bots:"
check_var "ADMIN_BOT_TOKEN" "required" || ((errors++))
check_var "PAYMENT_BOT_TOKEN" "required" || ((errors++))
check_var "PAYMENT_BOT_USERNAME" "required" || ((errors++))
check_var "PAYMENT_BOT_ID" "required" || ((errors++))
echo ""

echo "TON Blockchain:"
check_var "TON_NETWORK" "required" || ((errors++))
check_var "FACTORY_CONTRACT_ADDRESS" "required" || ((errors++))
check_var "TON_RPC_URL" "optional"
check_var "TON_API_KEY" "optional"
echo ""

echo "TON Connect:"
check_var "TONCONNECT_MANIFEST_URL" "required" || ((errors++))
echo ""

echo "Application:"
check_var "NODE_ENV" "optional"
check_var "LOG_LEVEL" "optional"
echo ""

# Test database connection
echo "=== Testing Database Connection ==="
PGPASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p') \
psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    ((errors++))
fi
echo ""

# Check if manifest URL is accessible
echo "=== Testing TON Connect Manifest ==="
if command -v curl &> /dev/null; then
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$TONCONNECT_MANIFEST_URL" 2>/dev/null)
    if [ "$status_code" == "200" ]; then
        echo -e "${GREEN}✓ Manifest URL is accessible${NC}"
    else
        echo -e "${YELLOW}⚠ Manifest URL returned status: $status_code${NC}"
        echo -e "${YELLOW}  Make sure to upload tonconnect-manifest.json to this URL${NC}"
    fi
else
    echo -e "${YELLOW}⚠ curl not available, skipping manifest check${NC}"
fi
echo ""

# Summary
echo "=== Summary ==="
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ All required variables are set!${NC}"
    echo ""
    echo "Ready to start:"
    echo "  cd admin-bot && npm install && npm run dev"
else
    echo -e "${RED}✗ Found $errors missing/invalid required variable(s)${NC}"
    echo "Please fix the issues above before starting the bot."
    exit 1
fi
