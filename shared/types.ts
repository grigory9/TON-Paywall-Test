// ============================================================================
// Shared TypeScript Types for One-Time Access Model
// ============================================================================

/**
 * Admin user (channel owner)
 * No changes needed for access model
 */
export interface Admin {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  wallet_address?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Protected channel with paywall
 * Changed from recurring subscription to one-time access
 */
export interface ProtectedChannel {
  id: number;
  telegram_id: number;
  title: string;
  username?: string; // NULL for private channels
  admin_id: number;
  subscription_contract_address?: string; // Access gate contract address
  access_price_ton: number; // Changed from monthly_price_ton
  invite_link?: string; // Telegram invite link with join requests
  channel_type: 'private' | 'public';
  requires_approval: boolean;
  total_members: number;
  total_revenue_ton: number;
  is_active: boolean;
  payment_bot_added: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use ProtectedChannel instead
 */
export type Channel = ProtectedChannel;

/**
 * User who purchases channel access
 * No changes needed
 */
export interface Subscriber {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  wallet_address?: string;
  created_at: Date;
}

/**
 * One-time access purchase record
 * Changed from time-based subscription to permanent access
 */
export interface AccessPurchase {
  id: number;
  subscriber_id: number;
  channel_id: number;
  status: 'pending' | 'active' | 'pending_approval' | 'failed' | 'expired';
  transaction_hash?: string;
  amount_ton?: number;
  purchase_type: 'lifetime'; // Always lifetime for one-time model
  approved_at?: Date; // When join request was approved
  access_revoked: boolean; // Admin can revoke access
  revoked_at?: Date;
  revoked_reason?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use AccessPurchase instead
 */
export type Subscription = AccessPurchase;

/**
 * Pending join request tracking
 * New table for managing Telegram join requests
 */
export interface PendingJoinRequest {
  id: number;
  user_id: number; // Telegram user ID
  channel_id: number; // Database channel ID
  requested_at: Date;
  expires_at: Date; // Expires after 48 hours
  payment_sent: boolean;
  payment_link_sent: boolean;
  payment_notified: boolean;
}

/**
 * Payment transaction record
 * Updated to reference access_purchases instead of subscriptions
 */
export interface Payment {
  id: number;
  subscription_id: number; // References access_purchases.id
  transaction_hash?: string;
  amount_ton: number;
  status: 'pending' | 'confirmed' | 'failed';
  from_address?: string;
  to_address?: string;
  confirmed_at?: Date;
  created_at: Date;
}

/**
 * Analytics summary for channel owners
 * Simplified for one-time access model
 */
export interface ChannelAnalytics {
  channel_id: number;
  telegram_id: number;
  title: string;
  access_price_ton: number;
  total_members: number;
  paid_members: number; // Users who have purchased access
  pending_requests: number; // Active join requests awaiting payment
  total_revenue_ton: number;
  conversion_rate: number; // (paid_members / total_requests) * 100
  created_at: Date;
}

/**
 * Legacy analytics interface
 * @deprecated Use ChannelAnalytics instead
 */
export interface AnalyticsSummary {
  channelTitle: string;
  totalSubscribers: number;
  activeSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
  totalRevenue: number;
  monthlyRevenue: number;
  arpu: number;
}

// TON Connect types
export interface TonConnectWallet {
  address: string;
  chain: string;
  walletStateInit: string;
  publicKey?: string;
}

export interface TransactionRequest {
  validUntil: number;
  messages: Array<{
    address: string;
    amount: string;
    payload?: string;
  }>;
}
