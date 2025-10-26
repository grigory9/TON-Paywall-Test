#!/bin/bash
# TON Connect Fix Verification Script
# This script verifies that the TON Connect fixes were applied correctly

set -e

echo "====================================="
echo "TON Connect Fix Verification"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "payment-bot" ]; then
    echo -e "${RED}ERROR: Please run this script from the ton-paywall root directory${NC}"
    exit 1
fi

echo "Step 1: Checking Payment Bot..."
echo "-----------------------------------"

# Check if extractBridgeSources method exists in payment bot
if grep -q "extractBridgeSources" payment-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} extractBridgeSources() method found"
else
    echo -e "${RED}✗${NC} extractBridgeSources() method NOT found"
    exit 1
fi

# Check if deep links use universal URL (not wallet.universalLink)
if grep -q "universalUrl: final" payment-bot/src/services/tonconnect.service.ts || grep -q "universalUrl: universalUrl" payment-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} Deep links use TON Connect universal URL"
else
    echo -e "${RED}✗${NC} Deep links still use wallet home page URLs"
    exit 1
fi

# Check if connect() uses bridge sources
if grep -q "const bridgeSources = this.extractBridgeSources" payment-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} connect() method uses bridge sources"
else
    echo -e "${RED}✗${NC} connect() method doesn't use bridge sources"
    exit 1
fi

echo ""
echo "Step 2: Checking Admin Bot..."
echo "-----------------------------------"

# Check if extractBridgeSources method exists in admin bot
if grep -q "extractBridgeSources" admin-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} extractBridgeSources() method found"
else
    echo -e "${RED}✗${NC} extractBridgeSources() method NOT found"
    exit 1
fi

# Check if deep links use universal URL (not wallet.universalLink)
if grep -q "universalUrl: universalUrl" admin-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} Deep links use TON Connect universal URL"
else
    echo -e "${RED}✗${NC} Deep links still use wallet home page URLs"
    exit 1
fi

# Check if connect() uses bridge sources
if grep -q "const bridgeSources = this.extractBridgeSources" admin-bot/src/services/tonconnect.service.ts; then
    echo -e "${GREEN}✓${NC} connect() method uses bridge sources"
else
    echo -e "${RED}✗${NC} connect() method doesn't use bridge sources"
    exit 1
fi

echo ""
echo "Step 3: Building Payment Bot..."
echo "-----------------------------------"

cd payment-bot
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Payment bot builds successfully"
else
    echo -e "${RED}✗${NC} Payment bot build failed"
    echo "Run 'cd payment-bot && npm run build' for details"
    exit 1
fi
cd ..

echo ""
echo "Step 4: Building Admin Bot..."
echo "-----------------------------------"

cd admin-bot
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Admin bot builds successfully"
else
    echo -e "${RED}✗${NC} Admin bot build failed"
    echo "Run 'cd admin-bot && npm run build' for details"
    exit 1
fi
cd ..

echo ""
echo "Step 5: Checking Documentation..."
echo "-----------------------------------"

if [ -f "TON_CONNECT_FIX_SUMMARY.md" ]; then
    echo -e "${GREEN}✓${NC} Fix summary documentation exists"
else
    echo -e "${YELLOW}⚠${NC} Fix summary documentation not found"
fi

if [ -f "TON_CONNECT_FIX_EXPLANATION.md" ]; then
    echo -e "${GREEN}✓${NC} Detailed explanation documentation exists"
else
    echo -e "${YELLOW}⚠${NC} Detailed explanation documentation not found"
fi

echo ""
echo "====================================="
echo -e "${GREEN}All Checks Passed!${NC}"
echo "====================================="
echo ""
echo "The TON Connect fixes have been successfully applied."
echo ""
echo "Next Steps:"
echo "1. Deploy to test server"
echo "2. Test wallet connection with real wallets"
echo "3. Test payment transactions on testnet"
echo "4. Monitor logs for any issues"
echo ""
echo "Testing Commands:"
echo "  cd payment-bot && npm start    # Start payment bot"
echo "  cd admin-bot && npm start      # Start admin bot"
echo "  pm2 logs payment-bot           # Monitor logs"
echo ""
echo "Documentation:"
echo "  - Quick Summary: TON_CONNECT_FIX_SUMMARY.md"
echo "  - Detailed Explanation: TON_CONNECT_FIX_EXPLANATION.md"
echo ""
