#!/bin/bash

# Fix PostgreSQL authentication to allow password reset
# Must be run with sudo

if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    echo "Usage: sudo ./fix-postgres-auth.sh"
    exit 1
fi

echo "=== PostgreSQL Authentication Fix ==="
echo ""

# Find pg_hba.conf file
PG_HBA=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)

if [ -z "$PG_HBA" ]; then
    echo "Error: Could not find pg_hba.conf"
    echo "PostgreSQL might not be installed or is in a non-standard location"
    exit 1
fi

echo "Found pg_hba.conf at: $PG_HBA"
echo ""

# Backup the original file
cp "$PG_HBA" "${PG_HBA}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✓ Backed up pg_hba.conf"

# Change authentication to trust for local connections temporarily
echo ""
echo "Step 1: Changing authentication method to 'trust' temporarily..."

sed -i 's/^local\s*all\s*postgres\s*peer/local   all             postgres                                trust/' "$PG_HBA"
sed -i 's/^local\s*all\s*postgres\s*md5/local   all             postgres                                trust/' "$PG_HBA"
sed -i 's/^local\s*all\s*all\s*peer/local   all             all                                     trust/' "$PG_HBA"
sed -i 's/^local\s*all\s*all\s*md5/local   all             all                                     trust/' "$PG_HBA"

echo "✓ Authentication method changed to 'trust'"

# Restart PostgreSQL
echo ""
echo "Step 2: Restarting PostgreSQL..."
systemctl restart postgresql

if [ $? -eq 0 ]; then
    echo "✓ PostgreSQL restarted"

    echo ""
    echo "Step 3: Setting new password for postgres user..."
    echo "Enter new password for postgres user:"
    read -s NEW_PASSWORD
    echo ""

    # Set the password
    su - postgres -c "psql -p 5433 -c \"ALTER USER postgres WITH PASSWORD '$NEW_PASSWORD';\"" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "✓ Password set successfully!"

        # Restore md5 authentication
        echo ""
        echo "Step 4: Restoring secure authentication..."
        sed -i 's/^local\s*all\s*postgres\s*trust/local   all             postgres                                md5/' "$PG_HBA"
        sed -i 's/^local\s*all\s*all\s*trust/local   all             all                                     md5/' "$PG_HBA"

        systemctl restart postgresql
        echo "✓ Secure authentication restored"

        echo ""
        echo "=========================================="
        echo "PostgreSQL password reset complete!"
        echo "=========================================="
        echo ""
        echo "New postgres password: $NEW_PASSWORD"
        echo ""
        echo "You can now run:"
        echo "  cd /home/gmet/workspace/ton-paywall"
        echo "  ./setup-database.sh"
        echo ""
        echo "When prompted, enter the postgres password shown above."

    else
        echo "✗ Failed to set password"
        echo "Restoring original pg_hba.conf..."
        mv "${PG_HBA}.backup."* "$PG_HBA"
        systemctl restart postgresql
        exit 1
    fi

else
    echo "✗ Failed to restart PostgreSQL"
    exit 1
fi
