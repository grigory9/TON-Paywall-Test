-- Migration: Add TON Connect support
-- Description: Add wallet connection tracking and TON Connect session storage

-- Update admins table to track wallet connection status
ALTER TABLE admins
ADD COLUMN wallet_connected BOOLEAN DEFAULT false,
ADD COLUMN wallet_connection_method VARCHAR(50) DEFAULT 'manual'; -- 'ton-connect' or 'manual'

-- TON Connect session storage (replaces Redis in reference implementation)
CREATE TABLE tonconnect_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    session_key VARCHAR(255) NOT NULL,
    session_value TEXT NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_key)
);

-- Index for faster lookups
CREATE INDEX idx_tonconnect_sessions_user_id ON tonconnect_sessions(user_id);
CREATE INDEX idx_tonconnect_sessions_telegram_id ON tonconnect_sessions(telegram_id);
CREATE INDEX idx_tonconnect_sessions_expires_at ON tonconnect_sessions(expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_tonconnect_sessions_updated_at
BEFORE UPDATE ON tonconnect_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired sessions periodically (can be run as a cron job)
-- DELETE FROM tonconnect_sessions WHERE expires_at < NOW();
