-- Simplified database schema for MVP (no Redis cache needed)

CREATE DATABASE ton_subscription_mvp;

\c ton_subscription_mvp;

-- Admin users (channel owners)
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    wallet_address VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channels managed by admins
CREATE TABLE channels (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    username VARCHAR(255), -- @channelname
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    subscription_contract_address VARCHAR(255),
    monthly_price_ton DECIMAL(20,9) DEFAULT 10.0,
    is_active BOOLEAN DEFAULT false, -- Active after contract deployment
    payment_bot_added BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscribers (users who pay for subscriptions)
CREATE TABLE subscribers (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    wallet_address VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription records
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, expired
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    transaction_hash VARCHAR(255),
    amount_ton DECIMAL(20,9),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subscriber_id, channel_id)
);

-- Payment transactions
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    transaction_hash VARCHAR(255) UNIQUE,
    amount_ton DECIMAL(20,9) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, failed
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin setup progress tracking
CREATE TABLE setup_progress (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    step VARCHAR(50) NOT NULL, -- 'channel_verified', 'bot_added', 'wallet_connected', 'contract_deployed'
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    data JSONB, -- Store step-specific data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(admin_id, channel_id, step)
);

-- Analytics summary (updated periodically)
CREATE TABLE analytics_summary (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_subscribers INTEGER DEFAULT 0,
    active_subscribers INTEGER DEFAULT 0,
    new_subscribers INTEGER DEFAULT 0,
    churned_subscribers INTEGER DEFAULT 0,
    total_revenue_ton DECIMAL(20,9) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, date)
);

-- Indexes for performance
CREATE INDEX idx_channels_admin ON channels(admin_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_channel ON subscriptions(channel_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE INDEX idx_analytics_channel_date ON analytics_summary(channel_id, date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
