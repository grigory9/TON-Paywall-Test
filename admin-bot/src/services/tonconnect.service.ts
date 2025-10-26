/**
 * TON Connect Service
 * Handles wallet connection via TON Connect 2.0 protocol with PostgreSQL storage
 */

import { TonConnect, WalletInfo, isWalletInfoCurrentlyEmbedded } from '@tonconnect/sdk';
import { IStorage } from '@tonconnect/sdk';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import { Cell } from '@ton/ton';

// Custom PostgreSQL storage adapter for TON Connect sessions
export class TonConnectPostgresStorage implements IStorage {
    private db: Pool;
    private userId: string;
    private ttl = 86400; // 24 hours in seconds

    constructor(db: Pool, userId: string) {
        this.db = db;
        this.userId = userId;
    }

    async setItem(key: string, value: string): Promise<void> {
        try {
            const expiresAt = new Date(Date.now() + this.ttl * 1000);
            await this.db.query(
                `INSERT INTO tonconnect_sessions (telegram_id, session_key, session_value, expires_at, user_id)
                 VALUES ($1, $2, $3, $4, (SELECT id FROM admins WHERE telegram_id = $1))
                 ON CONFLICT (user_id, session_key)
                 DO UPDATE SET session_value = $3, expires_at = $4, updated_at = NOW()`,
                [this.userId, key, value, expiresAt]
            );
        } catch (error) {
            console.error('TON Connect PostgreSQL storage error:', error);
            throw error;
        }
    }

    async getItem(key: string): Promise<string | null> {
        try {
            const result = await this.db.query(
                `SELECT session_value FROM tonconnect_sessions
                 WHERE telegram_id = $1 AND session_key = $2 AND expires_at > NOW()`,
                [this.userId, key]
            );
            return result.rows[0]?.session_value || null;
        } catch (error) {
            console.error('TON Connect PostgreSQL retrieval error:', error);
            return null;
        }
    }

    async removeItem(key: string): Promise<void> {
        try {
            await this.db.query(
                `DELETE FROM tonconnect_sessions
                 WHERE telegram_id = $1 AND session_key = $2`,
                [this.userId, key]
            );
        } catch (error) {
            console.error('TON Connect PostgreSQL deletion error:', error);
        }
    }

    async getKeys(): Promise<string[]> {
        try {
            const result = await this.db.query(
                `SELECT session_key FROM tonconnect_sessions
                 WHERE telegram_id = $1 AND expires_at > NOW()`,
                [this.userId]
            );
            return result.rows.map((row) => row.session_key);
        } catch (error) {
            console.error('TON Connect PostgreSQL keys retrieval error:', error);
            return [];
        }
    }
}

export interface WalletDeepLink {
    name: string;
    imageUrl: string;
    universalUrl?: string;
    deepLink?: string;
}

export interface WalletConnectionOptions {
    userId: string;
    chatId: string;
    returnStrategy?: 'back' | 'none';
}

export interface WalletConnectionStatus {
    connected: boolean;
    address: string | null;
    wallet: {
        name: string;
        imageUrl: string;
        appName?: string;
    } | null;
    connectionMethod: 'ton-connect' | 'manual' | null;
}

export interface TonConnectTransaction {
    messages: Array<{
        address: string;
        amount: string;
        payload?: string;
        stateInit?: string;
        // Note: bounce is NOT a separate field in TON Connect v2
        // Bounce behavior is encoded in the address format itself:
        // - Bounceable addresses start with EQ (mainnet) or kQ (testnet)
        // - Non-bounceable addresses start with UQ (mainnet) or 0Q (testnet)
    }>;
    validUntil?: number;
}

export interface SendTransactionResponse {
    success: boolean;
    hash: string;
    timestamp: number;
}

// Error classes
export class TonConnectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TonConnectError';
    }
}

export class UserRejectedError extends TonConnectError {
    constructor(message: string) {
        super(message);
        this.name = 'UserRejectedError';
    }
}

export class InsufficientFundsError extends TonConnectError {
    constructor(message: string) {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}

export class TransactionError extends TonConnectError {
    constructor(message: string) {
        super(message);
        this.name = 'TransactionError';
    }
}

export class TonConnectService {
    private instances: Map<string, TonConnect> = new Map();
    private storages: Map<string, TonConnectPostgresStorage> = new Map();
    private manifest: {
        url: string;
        name: string;
        iconUrl: string;
        termsOfUseUrl?: string;
        privacyPolicyUrl?: string;
    };

    constructor(private db: Pool) {
        this.manifest = {
            url: process.env.TONCONNECT_MANIFEST_URL || 'https://raw.githubusercontent.com/yourusername/ton-subscription-paywall/main/tonconnect-manifest.json',
            name: 'TON Subscription Paywall',
            iconUrl: 'https://raw.githubusercontent.com/yourusername/ton-subscription-paywall/main/icon.png',
        };

        console.log('🔗 TON Connect Service initialized with manifest:', this.manifest.url);
    }

    /**
     * Get or create TON Connect instance for user
     */
    async getInstance(userId: string): Promise<TonConnect> {
        if (!this.instances.has(userId)) {
            // Create user-specific storage to isolate sessions
            const userStorage = new TonConnectPostgresStorage(this.db, userId);
            this.storages.set(userId, userStorage);

            const connector = new TonConnect({
                manifestUrl: this.manifest.url,
                storage: userStorage,
            });

            // Restore connection from database if exists
            await connector.restoreConnection();

            this.instances.set(userId, connector);
            console.log(`Created new TON Connect instance for user ${userId}, connected: ${connector.connected}`);
        }

        return this.instances.get(userId)!;
    }

    /**
     * Generate connection URL with QR code
     */
    async generateConnectionUrl(options: WalletConnectionOptions): Promise<{
        universalUrl: string;
        qrCodeUrl: string;
        deepLinks: WalletDeepLink[];
    }> {
        console.log('📱 Generating TON Connect URL for user:', options.userId);

        const connector = await this.getInstance(options.userId);

        // Restore connection if exists
        await connector.restoreConnection();

        if (connector.connected) {
            throw new Error('Wallet already connected');
        }

        // Generate connection request
        const walletsList = await connector.getWallets();
        console.log(`📋 Found ${walletsList.length} available wallets`);

        // Generate universal URL that works with ALL wallets
        // Extract bridge URLs and pass them to connect() to get universal connection URL
        const bridgeSources = this.extractBridgeSources(walletsList);
        const universalUrl = connector.connect(bridgeSources) as string;

        console.log('🔗 Generated TON Connect universal URL');

        // Generate QR code
        const qrCodeUrl = await this.generateQRCode(universalUrl);

        // Generate deep links for popular wallets
        const deepLinks = this.generateDeepLinks(walletsList, universalUrl);

        console.log('✅ Connection URLs generated', {
            deepLinksCount: deepLinks.length,
            wallets: deepLinks.map(w => w.name).join(', ')
        });

        return {
            universalUrl,
            qrCodeUrl,
            deepLinks,
        };
    }

    /**
     * Extract bridge sources from wallet list
     * Returns array of unique bridge URLs for generating universal connection URL
     */
    private extractBridgeSources(wallets: WalletInfo[]): Array<{ bridgeUrl: string }> {
        const bridgeUrls = new Set<string>();

        for (const wallet of wallets) {
            // Skip embedded wallets
            if (isWalletInfoCurrentlyEmbedded(wallet)) {
                continue;
            }

            // Extract bridge URL from HTTP wallets
            if ('bridgeUrl' in wallet) {
                const bridgeUrl = (wallet as any).bridgeUrl;
                if (bridgeUrl && typeof bridgeUrl === 'string') {
                    bridgeUrls.add(bridgeUrl);
                }
            }
        }

        const bridgeSources = Array.from(bridgeUrls).map(url => ({ bridgeUrl: url }));
        console.log(`📡 Extracted ${bridgeSources.length} unique bridge URLs`);

        // Fallback to default bridge if none found
        if (bridgeSources.length === 0) {
            console.warn('⚠️ No bridge URLs found, using default bridge');
            bridgeSources.push({ bridgeUrl: 'https://bridge.tonapi.io/bridge' });
        }

        return bridgeSources;
    }

    /**
     * Generate deep links for specific wallets
     * Returns top 4 most popular wallets with properly formatted TON Connect URLs
     *
     * CRITICAL FIX FOR TELEGRAM BOT API:
     * Telegram's inline keyboard buttons only accept http:// or https:// URLs.
     * The tc:// protocol is NOT supported and causes "Unsupported URL protocol" error.
     *
     * We must convert the tc:// protocol URL to wallet-specific HTTPS universal links.
     *
     * TON Connect URL format:
     * - TON Connect protocol: tc://?v=2&id=...&r=...
     * - Tonkeeper universal link: https://app.tonkeeper.com/ton-connect?v=2&id=...&r=...
     * - Telegram Wallet: https://t.me/wallet?attach=wallet&startattach=<base64_params>
     * - MyTonWallet: https://mytonwallet.io/ton-connect?v=2&id=...&r=...
     */
    private generateDeepLinks(wallets: WalletInfo[], universalUrl: string): WalletDeepLink[] {
        // Parse the tc:// URL to extract TON Connect parameters
        // The universalUrl format is: tc://?v=2&id=xxx&r=yyy
        let tonConnectParams = '';

        try {
            // Extract query parameters from tc:// URL
            // Replace tc:// with https://temp.com/ temporarily to parse as URL
            const tempUrl = new URL(universalUrl.replace('tc://', 'https://temp.com/'));
            tonConnectParams = tempUrl.search; // Includes the '?' prefix
            console.log('Extracted TON Connect parameters:', tonConnectParams);
        } catch (error) {
            console.error('Failed to parse TON Connect URL:', error);
            // Fallback: if URL already starts with https://, use it directly
            if (universalUrl.startsWith('https://') || universalUrl.startsWith('http://')) {
                console.log('Universal URL is already HTTPS, using directly');
                tonConnectParams = '';
            }
        }

        return wallets
            .filter((w) => !isWalletInfoCurrentlyEmbedded(w))
            .slice(0, 4) // Top 4 wallets
            .map((wallet) => {
                // Get the wallet's universal link base URL
                const walletUniversalLink = 'universalLink' in wallet ? (wallet as any).universalLink : undefined;

                let finalUniversalUrl: string;

                // Convert tc:// URL to wallet-specific HTTPS universal link
                if (walletUniversalLink && tonConnectParams) {
                    // Append TON Connect parameters to wallet's universal link
                    // Remove trailing slash from universal link if present
                    const baseUrl = walletUniversalLink.replace(/\/$/, '');
                    finalUniversalUrl = `${baseUrl}${tonConnectParams}`;
                    console.log(`Generated HTTPS link for ${wallet.name}: ${finalUniversalUrl}`);
                } else if (universalUrl.startsWith('https://') || universalUrl.startsWith('http://')) {
                    // URL is already HTTPS (TON Connect SDK v3 may return HTTPS directly)
                    finalUniversalUrl = universalUrl;
                } else {
                    // Fallback: use wallet's base universal link without parameters
                    // This will open the wallet app, but may not auto-connect
                    finalUniversalUrl = walletUniversalLink || 'https://ton.org';
                    console.warn(`Could not generate proper TON Connect link for ${wallet.name}, using base URL`);
                }

                return {
                    name: wallet.name,
                    imageUrl: wallet.imageUrl,
                    universalUrl: finalUniversalUrl,  // HTTPS URL compatible with Telegram Bot API
                    deepLink: finalUniversalUrl,      // Same HTTPS URL for consistency
                };
            });
    }

    /**
     * Generate QR code for connection URL
     */
    private async generateQRCode(data: string): Promise<string> {
        try {
            return await QRCode.toDataURL(data, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                width: 512,
                margin: 1,
            });
        } catch (error) {
            console.error('QR code generation error:', error);
            throw new Error('Failed to generate QR code');
        }
    }

    /**
     * Check wallet connection status
     */
    async checkConnection(userId: string): Promise<WalletConnectionStatus> {
        const connector = await this.getInstance(userId);

        try {
            await connector.restoreConnection();

            if (!connector.connected) {
                return {
                    connected: false,
                    address: null,
                    wallet: null,
                    connectionMethod: null,
                };
            }

            const wallet = connector.wallet;
            const account = connector.account;

            if (!wallet || !account || !account.address) {
                console.warn(`Stale TON Connect session detected for user ${userId}, clearing...`);
                await connector.disconnect();
                await this.clearDatabaseWallet(userId);

                return {
                    connected: false,
                    address: null,
                    wallet: null,
                    connectionMethod: null,
                };
            }

            return {
                connected: true,
                address: account.address,
                wallet: {
                    name: (wallet.device as any).appName || 'Unknown Wallet',
                    imageUrl: (wallet.device as any).iconUrl || '',
                    appName: (wallet.device as any).appName || 'Unknown',
                },
                connectionMethod: 'ton-connect' as const,
            };
        } catch (error) {
            console.error(`Error checking TON Connect connection for user ${userId}:`, error);

            try {
                await connector.disconnect();
                await this.clearDatabaseWallet(userId);
            } catch (disconnectError) {
                console.error('Error disconnecting stale session:', disconnectError);
            }

            return {
                connected: false,
                address: null,
                wallet: null,
                connectionMethod: null,
            };
        }
    }

    /**
     * Clear database wallet record for user
     */
    private async clearDatabaseWallet(userId: string): Promise<void> {
        try {
            await this.db.query(
                `UPDATE admins SET wallet_address = NULL, wallet_connected = false WHERE telegram_id = $1`,
                [userId]
            );
            console.log(`Cleared database wallet for user ${userId}`);
        } catch (error) {
            console.error(`Failed to clear database wallet for user ${userId}:`, error);
        }
    }

    /**
     * Disconnect wallet
     */
    async disconnect(userId: string): Promise<void> {
        try {
            const connector = await this.getInstance(userId);

            if (connector.connected) {
                await connector.disconnect();
            }

            // Get user-specific storage
            const userStorage = this.storages.get(userId);

            if (userStorage) {
                // Clear ALL session keys for this user
                const allKeys = await userStorage.getKeys();
                console.log(`Clearing ${allKeys.length} TON Connect session keys for user ${userId}`);

                for (const key of allKeys) {
                    await userStorage.removeItem(key);
                }

                // Remove storage from cache
                this.storages.delete(userId);
            }

            // Clear from cache
            this.instances.delete(userId);

            console.log(`Wallet disconnected for user ${userId}`);
        } catch (error) {
            console.error(`Error disconnecting wallet for user ${userId}:`, error);
            // Force clear anyway
            this.instances.delete(userId);
            this.storages.delete(userId);
            throw error;
        }
    }

    /**
     * Send transaction through TON Connect
     */
    async sendTransaction(
        userId: string,
        transaction: TonConnectTransaction
    ): Promise<SendTransactionResponse> {
        const connector = await this.getInstance(userId);

        if (!connector.connected) {
            throw new Error('Wallet not connected');
        }

        try {
            // Validate transaction
            this.validateTransaction(transaction);

            const validUntil = transaction.validUntil || Math.floor(Date.now() / 1000) + 600;

            console.log(`Sending transaction via TON Connect to user ${userId}...`, {
                messages: transaction.messages.length,
                validUntil,
            });

            // Create timeout promise (2 minutes)
            const timeoutMs = 120000;
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(
                        'Transaction confirmation timeout. ' +
                        'Please try again and confirm the transaction in your wallet within 2 minutes.'
                    ));
                }, timeoutMs);
            });

            // Send transaction with timeout
            const result = await Promise.race([
                connector.sendTransaction({
                    messages: transaction.messages,
                    validUntil,
                }),
                timeoutPromise
            ]);

            console.log(`✅ Transaction confirmed by user ${userId}`);

            // Extract transaction hash from BOC
            let hash: string;
            try {
                const cell = Cell.fromBase64(result.boc);
                hash = cell.hash().toString('hex');
                console.log(`Extracted transaction hash: ${hash}`);
            } catch (error) {
                // Fallback: use BOC slice + timestamp for uniqueness
                console.warn('Failed to parse BOC, using fallback hash generation:', error);
                const bocHex = Buffer.from(result.boc, 'base64').toString('hex').slice(0, 32);
                const timestamp = Date.now().toString(16);
                hash = `${bocHex}${timestamp}`;
            }

            return {
                success: true,
                hash,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            console.error('TON Connect transaction error:', error);

            if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
                throw new TransactionError('Transaction confirmation timed out. Please try again.');
            }

            if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
                throw new UserRejectedError('Transaction rejected by user');
            }

            if (error.message?.includes('Insufficient funds') || error.message?.includes('insufficient')) {
                throw new InsufficientFundsError('Insufficient wallet balance');
            }

            throw new TransactionError(`Transaction failed: ${error.message}`);
        }
    }

    /**
     * Validate transaction before sending
     */
    private validateTransaction(transaction: TonConnectTransaction): void {
        if (!transaction.messages || transaction.messages.length === 0) {
            throw new Error('No messages in transaction');
        }

        for (const message of transaction.messages) {
            if (!message.address || !message.amount) {
                throw new Error('Invalid message format');
            }

            const amount = BigInt(message.amount);
            if (amount <= 0n) {
                throw new Error('Invalid transaction amount');
            }

            if (!this.isValidAddress(message.address)) {
                throw new Error('Invalid recipient address');
            }
        }
    }

    /**
     * Validate TON address format
     */
    private isValidAddress(address: string): boolean {
        const pattern = /^(EQ|UQ|0Q|kQ)[A-Za-z0-9_-]{46}$/;
        return pattern.test(address);
    }

    /**
     * Get wallet deep link for transaction confirmation
     * This generates a URL that opens the connected wallet app to confirm pending transactions
     *
     * IMPORTANT: Deep links in TON Connect work differently than traditional app deep links.
     * The wallet app automatically receives the transaction request via the bridge server.
     * We simply provide a link that opens the wallet app - it will automatically show the pending transaction.
     */
    async getWalletDeepLink(userId: string): Promise<{
        walletName: string;
        deepLink: string | null;
    } | null> {
        const connector = await this.getInstance(userId);

        if (!connector.connected) {
            console.warn(`Cannot generate deep link: wallet not connected for user ${userId}`);
            return null;
        }

        const wallet = connector.wallet;
        if (!wallet) {
            console.warn(`Cannot generate deep link: wallet info not available for user ${userId}`);
            return null;
        }

        try {
            // Extract wallet info
            const walletDevice = wallet.device as any;
            const walletName = walletDevice.appName || 'Unknown Wallet';

            // Get universal link or deep link from wallet info
            let deepLink: string | null = null;

            // Try to get universal link first (preferred for TON wallets)
            // Universal links are the proper way to open TON wallets
            if (walletDevice.universalLink) {
                deepLink = walletDevice.universalLink;
                console.log(`Using universal link for ${walletName}: ${deepLink}`);
            }
            // Fall back to deep link (older format)
            else if (walletDevice.deepLink) {
                deepLink = walletDevice.deepLink;
                console.log(`Using deep link for ${walletName}: ${deepLink}`);
            }
            // Generate wallet-specific deep links based on wallet name as last resort
            else {
                const walletNameLower = walletName.toLowerCase();

                if (walletNameLower.includes('tonkeeper')) {
                    // Tonkeeper universal link - opens app on mobile, web app on desktop
                    deepLink = 'https://app.tonkeeper.com/';
                } else if (walletNameLower.includes('tonhub') || walletNameLower.includes('sandbox')) {
                    // Tonhub/Sandbox deep link
                    deepLink = 'https://tonhub.com/';
                } else if (walletNameLower.includes('openmask')) {
                    // OpenMask (browser extension) - no mobile app
                    deepLink = null;
                } else if (walletNameLower.includes('mytonwallet')) {
                    // MyTonWallet
                    deepLink = 'https://mytonwallet.io/';
                } else if (walletNameLower.includes('telegram')) {
                    // Telegram Wallet (built into Telegram app)
                    // Deep link to open Telegram Wallet - pending transaction will be visible there
                    deepLink = 'https://t.me/wallet';
                    console.log(`Using Telegram Wallet deep link for ${walletName}`);
                } else {
                    // Generic fallback - return null if we don't know the wallet
                    console.log(`No specific deep link available for wallet: ${walletName}`);
                    deepLink = null;
                }
            }

            if (deepLink) {
                console.log(`✅ Generated wallet deep link for user ${userId}: ${walletName}`);
            } else {
                console.log(`⚠️ No deep link available for ${walletName} - wallet may be browser extension`);
            }

            return {
                walletName,
                deepLink
            };
        } catch (error) {
            console.error(`Error generating wallet deep link for user ${userId}:`, error);
            return null;
        }
    }
}

// Export function to create service instance
export function createTonConnectService(db: Pool): TonConnectService {
    return new TonConnectService(db);
}
