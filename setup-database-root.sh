#!/bin/bash

# This script should be run as ROOT
# Usage: su - then run this script

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use: su -)"
    exit 1
fi

echo "=== PostgreSQL Database Setup for TON Paywall (Root) ==="
echo ""

# PostgreSQL port
PG_PORT=5433

# Database configuration
DB_NAME="ton_subscription_mvp"
DB_USER="tonpaywall"
DB_PASSWORD="tonpaywall_$(date +%s)"

PROJECT_DIR="/home/gmet/workspace/ton-paywall"

echo "Step 1: Creating PostgreSQL user and database"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""

# Create database and user
su - postgres -c "psql -p $PG_PORT" << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
\q
EOF

if [ $? -eq 0 ]; then
    echo "✓ Database and user created"

    echo ""
    echo "Step 2: Applying database schema"

    # Apply schema as the tonpaywall user
    PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -f $PROJECT_DIR/shared/database-schema.sql

    if [ $? -eq 0 ]; then
        echo "✓ Schema applied"

        # Update .env file
        CONNECTION_STRING="postgresql://$DB_USER:$DB_PASSWORD@localhost:$PG_PORT/$DB_NAME"

        cd $PROJECT_DIR

        if [ ! -f .env ]; then
            cp .env.example .env
        fi

        # Update DATABASE_URL
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" .env

        # Set ownership to gmet
        chown gmet:gmet .env
        chmod 600 .env

        echo "✓ Updated .env file"

        echo ""
        echo "Step 3: Verifying setup"
        PGPASSWORD=$DB_PASSWORD psql -h localhost -p $PG_PORT -U $DB_USER -d $DB_NAME -c "\dt"

        echo ""
        echo "========================================"
        echo "Database setup complete!"
        echo "========================================"
        echo ""
        echo "Credentials:"
        echo "  Database: $DB_NAME"
        echo "  User: $DB_USER"
        echo "  Password: $DB_PASSWORD"
        echo "  Port: $PG_PORT"
        echo ""
        echo "Connection string (saved to .env):"
        echo "  $CONNECTION_STRING"
        echo ""
        echo "Next: Exit root (type 'exit') and continue as user 'gmet'"

    else
        echo "✗ Failed to apply schema"
        exit 1
    fi
else
    echo "✗ Failed to create database"
    exit 1
fi
