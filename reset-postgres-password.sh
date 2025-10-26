#!/bin/bash

# Reset PostgreSQL postgres user password
# This script must be run as root

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./reset-postgres-password.sh"
    exit 1
fi

echo "=== Reset PostgreSQL postgres Password ==="
echo ""
echo "Enter new password for postgres user:"
read -s POSTGRES_PASSWORD
echo ""
echo "Confirm password:"
read -s POSTGRES_PASSWORD_CONFIRM
echo ""

if [ "$POSTGRES_PASSWORD" != "$POSTGRES_PASSWORD_CONFIRM" ]; then
    echo "Passwords don't match!"
    exit 1
fi

# Reset password
su - postgres -c "psql -p 5433 -c \"ALTER USER postgres WITH PASSWORD '$POSTGRES_PASSWORD';\""

if [ $? -eq 0 ]; then
    echo "✓ Password changed successfully!"
    echo ""
    echo "You can now connect with:"
    echo "  psql -h localhost -p 5433 -U postgres"
else
    echo "✗ Failed to change password"
    exit 1
fi
