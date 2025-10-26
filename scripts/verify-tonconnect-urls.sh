#!/bin/bash

# TON Connect URL Verification Script
# This script helps verify that the TON Connect URL fix is working correctly

set -e

echo "=========================================="
echo "TON Connect URL Fix Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a string contains tc:// protocol
check_tc_protocol() {
    local log_file=$1
    local bot_name=$2

    echo "Checking ${bot_name} logs for tc:// protocol URLs..."

    if [ ! -f "$log_file" ]; then
        echo -e "${YELLOW}⚠️  Log file not found: ${log_file}${NC}"
        return 1
    fi

    # Check for tc:// URLs in logs
    if grep -q "tc://" "$log_file" 2>/dev/null; then
        echo -e "${RED}❌ FAILED: Found tc:// protocol URLs in ${bot_name} logs${NC}"
        echo "   This indicates the fix is not working correctly."
        echo ""
        echo "   Examples found:"
        grep "tc://" "$log_file" | head -n 3
        return 1
    else
        echo -e "${GREEN}✅ PASSED: No tc:// protocol URLs found${NC}"
        return 0
    fi
}

# Function to check for HTTPS wallet URLs
check_https_urls() {
    local log_file=$1
    local bot_name=$2

    echo "Checking ${bot_name} logs for HTTPS wallet URLs..."

    if [ ! -f "$log_file" ]; then
        echo -e "${YELLOW}⚠️  Log file not found: ${log_file}${NC}"
        return 1
    fi

    # Check for HTTPS wallet URLs
    if grep -q "Generated HTTPS link for" "$log_file" 2>/dev/null; then
        echo -e "${GREEN}✅ PASSED: Found HTTPS wallet URLs${NC}"
        echo ""
        echo "   Examples:"
        grep "Generated HTTPS link for" "$log_file" | tail -n 3
        return 0
    else
        echo -e "${YELLOW}⚠️  No HTTPS wallet URLs found yet${NC}"
        echo "   This might be normal if no wallet connections have been attempted."
        return 0
    fi
}

# Function to check if bots are running
check_bot_running() {
    local bot_name=$1

    if pm2 list | grep -q "$bot_name.*online" 2>/dev/null; then
        echo -e "${GREEN}✅ ${bot_name} is running${NC}"
        return 0
    else
        echo -e "${RED}❌ ${bot_name} is NOT running${NC}"
        return 1
    fi
}

# Function to verify build files exist
check_build_files() {
    echo ""
    echo "Verifying build files..."
    echo ""

    local payment_bot_file="/home/gmet/workspace/ton-paywall/payment-bot/dist/services/tonconnect.service.js"
    local admin_bot_file="/home/gmet/workspace/ton-paywall/admin-bot/dist/services/tonconnect.service.js"

    # Check payment bot build
    if [ -f "$payment_bot_file" ]; then
        echo -e "${GREEN}✅ Payment bot build file exists${NC}"

        # Check if the fix is in the compiled code
        if grep -q "CRITICAL FIX FOR TELEGRAM BOT API" "$payment_bot_file" 2>/dev/null || \
           grep -q "tonConnectParams" "$payment_bot_file" 2>/dev/null; then
            echo -e "${GREEN}✅ Payment bot contains the URL fix${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not verify fix in payment bot build (may be minified)${NC}"
        fi
    else
        echo -e "${RED}❌ Payment bot build file NOT found${NC}"
        echo "   Run: cd /home/gmet/workspace/ton-paywall/payment-bot && npm run build"
    fi

    # Check admin bot build
    if [ -f "$admin_bot_file" ]; then
        echo -e "${GREEN}✅ Admin bot build file exists${NC}"

        # Check if the fix is in the compiled code
        if grep -q "CRITICAL FIX FOR TELEGRAM BOT API" "$admin_bot_file" 2>/dev/null || \
           grep -q "tonConnectParams" "$admin_bot_file" 2>/dev/null; then
            echo -e "${GREEN}✅ Admin bot contains the URL fix${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not verify fix in admin bot build (may be minified)${NC}"
        fi
    else
        echo -e "${RED}❌ Admin bot build file NOT found${NC}"
        echo "   Run: cd /home/gmet/workspace/ton-paywall/admin-bot && npm run build"
    fi
}

# Main verification flow
echo "1. Checking if bots are running..."
echo ""

check_bot_running "payment-bot"
check_bot_running "admin-bot"

echo ""
echo "2. Checking build files..."

check_build_files

echo ""
echo "3. Checking PM2 logs for URL protocols..."
echo ""

# Get PM2 log locations
if command -v pm2 &> /dev/null; then
    PAYMENT_BOT_LOG=$(pm2 info payment-bot 2>/dev/null | grep "out log path" | awk '{print $NF}')
    ADMIN_BOT_LOG=$(pm2 info admin-bot 2>/dev/null | grep "out log path" | awk '{print $NF}')

    if [ -n "$PAYMENT_BOT_LOG" ]; then
        echo "Payment Bot Log: $PAYMENT_BOT_LOG"
        check_tc_protocol "$PAYMENT_BOT_LOG" "payment-bot"
        echo ""
        check_https_urls "$PAYMENT_BOT_LOG" "payment-bot"
    else
        echo -e "${YELLOW}⚠️  Could not find payment-bot logs${NC}"
    fi

    echo ""

    if [ -n "$ADMIN_BOT_LOG" ]; then
        echo "Admin Bot Log: $ADMIN_BOT_LOG"
        check_tc_protocol "$ADMIN_BOT_LOG" "admin-bot"
        echo ""
        check_https_urls "$ADMIN_BOT_LOG" "admin-bot"
    else
        echo -e "${YELLOW}⚠️  Could not find admin-bot logs${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  PM2 not found, cannot check logs${NC}"
    echo "   If using pm2, install it: npm install -g pm2"
fi

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. If bots are not running: pm2 restart payment-bot admin-bot"
echo "2. Test wallet connection in Telegram:"
echo "   - Open payment bot or admin bot"
echo "   - Click 'Connect Wallet'"
echo "   - Click any wallet button (e.g., Tonkeeper)"
echo "   - Verify wallet app opens successfully"
echo "3. Monitor logs: pm2 logs payment-bot (or admin-bot)"
echo ""
