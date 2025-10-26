#!/bin/bash

# Test Factory Contract - Diagnostic Script
# This script helps verify your factory contract is working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== TON Factory Contract Diagnostic ===${NC}\n"

# Load environment variables
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create .env file with FACTORY_CONTRACT_ADDRESS and TON_NETWORK"
    exit 1
fi

source .env

# Check required variables
if [ -z "$FACTORY_CONTRACT_ADDRESS" ]; then
    echo -e "${RED}❌ Error: FACTORY_CONTRACT_ADDRESS not set in .env${NC}"
    exit 1
fi

if [ -z "$TON_NETWORK" ]; then
    echo -e "${YELLOW}⚠️  Warning: TON_NETWORK not set, defaulting to testnet${NC}"
    TON_NETWORK="testnet"
fi

echo -e "${GREEN}Configuration:${NC}"
echo "Network: $TON_NETWORK"
echo "Factory: $FACTORY_CONTRACT_ADDRESS"
echo ""

# Set API endpoint based on network
if [ "$TON_NETWORK" = "mainnet" ]; then
    API_URL="https://toncenter.com/api/v2"
    EXPLORER_URL="https://tonscan.org"
else
    API_URL="https://testnet.toncenter.com/api/v2"
    EXPLORER_URL="https://testnet.tonscan.org"
fi

echo -e "${BLUE}1. Checking factory contract state...${NC}"

STATE_RESPONSE=$(curl -s "${API_URL}/getAddressInformation?address=${FACTORY_CONTRACT_ADDRESS}")

if echo "$STATE_RESPONSE" | grep -q "\"ok\":true"; then
    STATE=$(echo "$STATE_RESPONSE" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)

    if [ "$STATE" = "active" ]; then
        echo -e "${GREEN}✅ Factory contract is ACTIVE${NC}"
    elif [ "$STATE" = "uninitialized" ]; then
        echo -e "${RED}❌ Factory contract is NOT DEPLOYED (uninitialized)${NC}"
        echo -e "\nPlease deploy the factory contract first:"
        echo -e "  cd contracts"
        echo -e "  npm run deploy:testnet  # or npm run deploy for mainnet"
        exit 1
    else
        echo -e "${YELLOW}⚠️  Factory contract state: $STATE${NC}"
    fi

    BALANCE=$(echo "$STATE_RESPONSE" | grep -o '"balance":"[^"]*"' | cut -d'"' -f4)
    BALANCE_TON=$(echo "scale=2; $BALANCE / 1000000000" | bc)
    echo -e "Balance: ${BALANCE_TON} TON"
else
    echo -e "${RED}❌ Failed to get contract state${NC}"
    echo "Response: $STATE_RESPONSE"
    exit 1
fi

echo -e "\n${BLUE}2. Testing getDeploymentFee method...${NC}"

FEE_RESPONSE=$(curl -s "${API_URL}/runGetMethod?address=${FACTORY_CONTRACT_ADDRESS}&method=getDeploymentFee")

if echo "$FEE_RESPONSE" | grep -q "\"ok\":true"; then
    FEE=$(echo "$FEE_RESPONSE" | grep -o '\["num","[^"]*"\]' | head -1 | cut -d'"' -f4)
    FEE_TON=$(echo "scale=2; $FEE / 1000000000" | bc)
    echo -e "${GREEN}✅ Deployment fee: ${FEE_TON} TON${NC}"

    if [ "$FEE" != "100000000" ]; then
        echo -e "${YELLOW}⚠️  Warning: Expected 0.1 TON (100000000 nanotons), got ${FEE_TON} TON${NC}"
    fi
else
    echo -e "${RED}❌ Failed to get deployment fee${NC}"
    echo "Response: $FEE_RESPONSE"
    echo -e "\nThis could mean:"
    echo "- Contract is not deployed"
    echo "- Contract has different interface"
    echo "- Network connectivity issue"
fi

echo -e "\n${BLUE}3. Testing getTotalDeployed method...${NC}"

TOTAL_RESPONSE=$(curl -s "${API_URL}/runGetMethod?address=${FACTORY_CONTRACT_ADDRESS}&method=getTotalDeployed")

if echo "$TOTAL_RESPONSE" | grep -q "\"ok\":true"; then
    TOTAL=$(echo "$TOTAL_RESPONSE" | grep -o '\["num","[^"]*"\]' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✅ Total deployed contracts: ${TOTAL}${NC}"
else
    echo -e "${YELLOW}⚠️  Could not get total deployed count${NC}"
fi

echo -e "\n${BLUE}4. Testing getSubscriptionAddress for test channel...${NC}"

# Test with a sample channel ID
TEST_CHANNEL_ID="-1001234567890"
ENCODED_ID=$(node -e "console.log(BigInt('$TEST_CHANNEL_ID').toString())")

ADDR_RESPONSE=$(curl -s "${API_URL}/runGetMethod?address=${FACTORY_CONTRACT_ADDRESS}&method=getSubscriptionAddress&stack=\[\{\"type\":\"num\",\"value\":\"${ENCODED_ID}\"\}\]")

if echo "$ADDR_RESPONSE" | grep -q "\"ok\":true"; then
    # Check if address is null or exists
    if echo "$ADDR_RESPONSE" | grep -q "\"type\":\"null\""; then
        echo -e "${GREEN}✅ Method works (no contract deployed for test channel $TEST_CHANNEL_ID)${NC}"
    else
        TEST_ADDR=$(echo "$ADDR_RESPONSE" | grep -o '\["slice","[^"]*"\]' | head -1 | cut -d'"' -f4)
        echo -e "${GREEN}✅ Method works (found contract for test channel: ${TEST_ADDR})${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not test getSubscriptionAddress${NC}"
    echo "Response: $ADDR_RESPONSE"
fi

echo -e "\n${BLUE}5. Summary${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Factory Address: ${FACTORY_CONTRACT_ADDRESS}"
echo -e "Explorer Link: ${EXPLORER_URL}/address/${FACTORY_CONTRACT_ADDRESS}"
echo -e "Network: ${TON_NETWORK}"
echo -e "\n${GREEN}Required transaction amount for deployment:${NC}"
echo -e "  Deployment fee: 0.1 TON"
echo -e "  Contract init:  0.6 TON"
echo -e "  Gas estimate:   ~0.05 TON"
echo -e "  ${YELLOW}Total needed:   ~0.75 TON${NC}"

echo -e "\n${BLUE}Test Results:${NC}"
if [ "$STATE" = "active" ]; then
    echo -e "${GREEN}✅ Factory is deployed and active${NC}"
    echo -e "${GREEN}✅ Ready to deploy subscription contracts${NC}"
    echo -e "\n${GREEN}You can now use the /setup command in the admin bot${NC}"
else
    echo -e "${RED}❌ Factory is not ready${NC}"
    echo -e "${YELLOW}Please deploy the factory contract first${NC}"
fi

echo ""
