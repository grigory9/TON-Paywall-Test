#!/bin/bash

echo "=== PostgreSQL Database Setup for TON Paywall ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# PostgreSQL port (detected as 5433)
PG_PORT=5433

# Database configuration
DB_NAME="ton_subscription_mvp"
DB_USER="tonpaywall"
DB_PASSWORD="tonpaywall_secure_$(date +%s)"

echo -e "${YELLOW}Step 1: Creating PostgreSQL user and database${NC}"
echo "This will create:"
echo "  - Database: $DB_NAME"
echo "  - User: $DB_USER"
echo "  - Password: $DB_PASSWORD"
echo ""

# Create SQL commands file
cat > /tmp/setup_tonpaywall.sql << EOF
-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to the database and grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

echo -e "${YELLOW}Running SQL setup commands...${NC}"
echo "You will be prompted for your sudo password."
echo ""

# Execute SQL as postgres user
sudo -u postgres psql -p $PG_PORT -f /tmp/setup_tonpaywall.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database and user created successfully${NC}"

    # Clean up SQL file
    rm /tmp/setup_tonpaywall.sql

    # Create .env file
    echo ""
    echo -e "${YELLOW}Step 2: Creating .env file${NC}"

    # Connection string
    CONNECTION_STRING="postgresql://$DB_USER:$DB_PASSWORD@localhost:$PG_PORT/$DB_NAME"

    # Check if .env exists
    if [ -f .env ]; then
        echo -e "${YELLOW}Warning: .env file already exists${NC}"
        echo "Backing up to .env.backup"
        cp .env .env.backup
    fi

    # Update or create .env
    if [ -f .env ]; then
        # Update DATABASE_URL in existing .env
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" .env
        echo -e "${GREEN}✓ Updated DATABASE_URL in .env${NC}"
    else
        # Create new .env from example
        cp .env.example .env
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" .env
        echo -e "${GREEN}✓ Created .env file${NC}"
    fi

    echo ""
    echo -e "${YELLOW}Step 3: Applying database schema${NC}"

    # Apply schema
    PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -f shared/database-schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database schema applied successfully${NC}"

        # Verify tables
        echo ""
        echo -e "${YELLOW}Step 4: Verifying database tables${NC}"
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
        echo -e "${YELLOW}Important: Save these credentials securely!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Deploy smart contracts: cd contracts && npm run deploy"
        echo "  2. Start admin bot: cd admin-bot && npm run dev"
        echo "  3. Start payment bot: cd payment-bot && npm run dev"

    else
        echo -e "${RED}✗ Failed to apply database schema${NC}"
        echo "Please check the error messages above"
        exit 1
    fi

else
    echo -e "${RED}✗ Failed to create database and user${NC}"
    echo "Please check the error messages above"
    rm /tmp/setup_tonpaywall.sql
    exit 1
fi
