#!/bin/bash

echo "=== PostgreSQL Database Setup for TON Paywall (Fresh Install) ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# PostgreSQL port
PG_PORT=5433

# Database configuration
DB_NAME="ton_subscription_mvp"
DB_USER="tonpaywall"
DB_PASSWORD="tonpaywall_secure_password_123"  # Fixed password

echo -e "${YELLOW}This will:${NC}"
echo "  1. Drop existing database and user (if they exist)"
echo "  2. Create fresh database and user"
echo "  3. Apply schema and migrations"
echo ""
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Password: $DB_PASSWORD"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 1: Dropping existing database and user${NC}"

sudo -u postgres psql -p $PG_PORT << EOF
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cleaned up existing database${NC}"
else
    echo -e "${RED}✗ Failed to clean up (might not exist)${NC}"
fi

echo ""
echo -e "${YELLOW}Step 2: Creating new database and user${NC}"

sudo -u postgres psql -p $PG_PORT << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database and user created${NC}"

    # Connection string
    CONNECTION_STRING="postgresql://$DB_USER:$DB_PASSWORD@localhost:$PG_PORT/$DB_NAME"

    # Update .env file
    echo ""
    echo -e "${YELLOW}Step 3: Updating .env file${NC}"

    if [ -f .env ]; then
        cp .env .env.backup
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" .env
    else
        cp .env.example .env
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" .env
    fi

    # Add TONCONNECT_MANIFEST_URL if not present
    if ! grep -q "TONCONNECT_MANIFEST_URL" .env; then
        echo "" >> .env
        echo "# TON Connect (for wallet connection - users pay deployment fees themselves)" >> .env
        echo "TONCONNECT_MANIFEST_URL=https://raw.githubusercontent.com/yourusername/ton-subscription-paywall/main/tonconnect-manifest.json" >> .env
    fi

    echo -e "${GREEN}✓ Updated .env file${NC}"
    echo -e "${YELLOW}⚠ Don't forget to update TONCONNECT_MANIFEST_URL in .env with your actual manifest URL!${NC}"

    # Apply base schema
    echo ""
    echo -e "${YELLOW}Step 4: Applying base database schema${NC}"

    PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -f shared/database-schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Base schema applied${NC}"

        # Apply TON Connect migration
        echo ""
        echo -e "${YELLOW}Step 5: Applying TON Connect migration${NC}"

        PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -f shared/migrations/001_add_tonconnect_support.sql

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ TON Connect migration applied${NC}"

            # Verify tables
            echo ""
            echo -e "${YELLOW}Step 6: Verifying database tables${NC}"
            PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -c "\dt"

            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}Database setup complete!${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo ""
            echo "Database credentials:"
            echo "  Database: $DB_NAME"
            echo "  User: $DB_USER"
            echo "  Password: $DB_PASSWORD"
            echo "  Port: $PG_PORT"
            echo ""
            echo "Connection string (saved to .env):"
            echo "  $CONNECTION_STRING"
            echo ""
            echo "Next steps:"
            echo "  1. Install dependencies: cd admin-bot && npm install"
            echo "  2. Start admin bot: cd admin-bot && npm run dev"

        else
            echo -e "${RED}✗ Failed to apply TON Connect migration${NC}"
            exit 1
        fi

    else
        echo -e "${RED}✗ Failed to apply base schema${NC}"
        exit 1
    fi

else
    echo -e "${RED}✗ Failed to create database and user${NC}"
    exit 1
fi
