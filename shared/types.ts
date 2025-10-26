// Shared TypeScript types
export interface Admin {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  wallet_address?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Channel {
  id: number;
  telegram_id: number;
  title: string;
  username?: string;
  admin_id: number;
  subscription_contract_address?: string;
  monthly_price_ton: number;
  is_active: boolean;
  payment_bot_added: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Subscriber {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  wallet_address?: string;
  created_at: Date;
}

export interface Subscription {
  id: number;
  subscriber_id: number;
  channel_id: number;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  starts_at?: Date;
  expires_at?: Date;
  transaction_hash?: string;
  amount_ton?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Payment {
  id: number;
  subscription_id: number;
  transaction_hash?: string;
  amount_ton: number;
  status: 'pending' | 'confirmed' | 'failed';
  from_address?: string;
  to_address?: string;
  confirmed_at?: Date;
  created_at: Date;
}

export interface SetupProgress {
  id: number;
  admin_id: number;
  channel_id: number;
  step: string;
  completed: boolean;
  completed_at?: Date;
  data?: any;
  created_at: Date;
}

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
