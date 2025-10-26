-- Migration: Add TON Connect support for subscribers (payment bot users)
-- Description: Extend TON Connect session storage to support both admins and subscribers

-- Update subscribers table to track wallet connection status
ALTER TABLE subscribers
ADD COLUMN wallet_connected BOOLEAN DEFAULT false,
ADD COLUMN wallet_connection_method VARCHAR(50) DEFAULT 'manual'; -- 'ton-connect' or 'manual'

-- Create a separate TON Connect session table for subscribers
-- (Keeps admin and subscriber sessions isolated for security)
CREATE TABLE tonconnect_sessions_subscribers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    session_key VARCHAR(255) NOT NULL,
    session_value TEXT NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_key)
);

-- Index for faster lookups
CREATE INDEX idx_tonconnect_sessions_subscribers_user_id ON tonconnect_sessions_subscribers(user_id);
CREATE INDEX idx_tonconnect_sessions_subscribers_telegram_id ON tonconnect_sessions_subscribers(telegram_id);
CREATE INDEX idx_tonconnect_sessions_subscribers_expires_at ON tonconnect_sessions_subscribers(expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_tonconnect_sessions_subscribers_updated_at
BEFORE UPDATE ON tonconnect_sessions_subscribers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired sessions periodically (can be run as a cron job)
-- DELETE FROM tonconnect_sessions_subscribers WHERE expires_at < NOW();
