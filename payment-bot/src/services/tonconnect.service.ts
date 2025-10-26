/**
 * TON Connect Service for Payment Bot
 * Handles wallet connection and payment transactions for subscribers
 *
 * This service is adapted from the admin bot's TON Connect implementation
 * but uses the subscribers table instead of admins table for session storage
 */

import { TonConnect, WalletInfo, isWalletInfoCurrentlyEmbedded } from '@tonconnect/sdk';
import { IStorage } from '@tonconnect/sdk';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import { Cell } from '@ton/ton';

/**
 * Custom PostgreSQL storage adapter for TON Connect sessions
 * Stores session data in tonconnect_sessions_subscribers table
 *
 * SECURITY: Each user has isolated session storage in the database
 * Sessions expire after 24 hours to prevent stale connections
 */
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

            // Store in subscriber-specific sessions table
            // ON CONFLICT ensures we update existing sessions rather than fail
            await this.db.query(
                `INSERT INTO tonconnect_sessions_subscribers (telegram_id, session_key, session_value, expires_at, user_id)
                 VALUES ($1, $2, $3, $4, (SELECT id FROM subscribers WHERE telegram_id = $1))
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
            // Only return non-expired sessions
            const result = await this.db.query(
                `SELECT session_value FROM tonconnect_sessions_subscribers
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
                `DELETE FROM tonconnect_sessions_subscribers
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
                `SELECT session_key FROM tonconnect_sessions_subscribers
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

/**
 * Transaction message format for TON Connect
 *
 * IMPORTANT: Bounce behavior is encoded in the address format:
 * - Bounceable addresses: EQ (mainnet) or kQ (testnet)
 * - Non-bounceable addresses: UQ (mainnet) or 0Q (testnet)
 */
export interface TonConnectTransaction {
    messages: Array<{
        address: string;      // Subscription contract address
        amount: string;       // Amount in nanotons (e.g., "10000000000" for 10 TON)
        payload?: string;     // Optional base64-encoded BOC cell for message body
        stateInit?: string;   // Optional state init for contract deployment
    }>;
    validUntil?: number;      // Unix timestamp when transaction expires
}

export interface SendTransactionResponse {
    success: boolean;
    hash: string;             // Transaction hash (extracted from BOC)
    timestamp: number;        // When transaction was sent
}

// Custom error classes for better error handling
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

/**
 * TON Connect Service
 *
 * Manages wallet connections and payment transactions for subscribers
 * Uses PostgreSQL for session persistence instead of Redis
 *
 * KEY FEATURES:
 * - Wallet connection via QR code or deep links
 * - Transaction signing through TON Connect protocol
 * - Session persistence across bot restarts
 * - Automatic session cleanup for expired connections
 */
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
        // TON Connect manifest configuration
        // PRODUCTION: Replace with your actual manifest URL
        this.manifest = {
            url: process.env.TONCONNECT_MANIFEST_URL || 'https://www.ton-connect.com/ton-paywall-client-manifest.json',
            name: 'TON Subscription Paywall',
            iconUrl: 'https://raw.githubusercontent.com/ton-community/ton-connect/main/assets/ton-icon-256.png',
        };

        console.log('🔗 TON Connect Service (Payment Bot) initialized with manifest:', this.manifest.url);
    }

    /**
     * Get or create TON Connect instance for user
     *
     * Each user has their own TonConnect instance with isolated session storage
     * Instances are cached in memory and restored from database on bot restart
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
            // This allows maintaining wallet connection across bot restarts
            await connector.restoreConnection();

            this.instances.set(userId, connector);
            console.log(`[Payment Bot] Created TON Connect instance for user ${userId}, connected: ${connector.connected}`);
        }

        return this.instances.get(userId)!;
    }

    /**
     * Generate connection URL with QR code for wallet connection
     *
     * Returns universal URL that works with all TON wallets
     * Also provides specific deep links for popular wallets (Tonkeeper, MyTonWallet, etc.)
     *
     * CRITICAL FIX: In TON Connect SDK v3, connector.connect() with a wallet parameter
     * returns a Promise<void> and initiates connection via the bridge. To get the universal
     * URL for QR codes and deep links, we need to pass the full wallets list, which triggers
     * the SDK to return the universal connection URL as a string.
     */
    async generateConnectionUrl(options: WalletConnectionOptions): Promise<{
        universalUrl: string;
        qrCodeUrl: string;
        deepLinks: WalletDeepLink[];
    }> {
        console.log('📱 Generating TON Connect URL for subscriber:', options.userId);

        const connector = await this.getInstance(options.userId);

        // Restore connection if exists
        await connector.restoreConnection();

        if (connector.connected) {
            throw new Error('Wallet already connected');
        }

        // Get list of available wallets
        const walletsList = await connector.getWallets();
        console.log(`📋 Found ${walletsList.length} available wallets`);

        // IMPORTANT: connector.connect() behavior in TON Connect SDK v3:
        // - connect(wallet) → Returns Promise<void>, initiates connection to specific wallet
        // - connect([{bridgeUrl}]) → Returns string (universal URL) for showing in QR/buttons
        //
        // To generate a universal URL that works with ALL wallets, we extract unique
        // bridge URLs from the wallets list and pass them to connect()
        const bridgeSources = this.extractBridgeSources(walletsList);
        const universalUrl = connector.connect(bridgeSources) as string;

        console.log('🔗 Generated TON Connect universal URL');

        // Generate QR code for desktop wallet apps
        const qrCodeUrl = await this.generateQRCode(universalUrl);

        // Generate deep links for popular mobile wallets
        // Each wallet-specific deep link wraps the universal URL
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
     *
     * TON Connect SDK requires an array of objects with bridgeUrl property
     * to generate a universal URL that works with all wallets
     */
    private extractBridgeSources(wallets: WalletInfo[]): Array<{ bridgeUrl: string }> {
        const bridgeUrls = new Set<string>();

        for (const wallet of wallets) {
            // Skip embedded wallets (browser extensions, Telegram wallet, etc.)
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

        // Convert Set to array of objects
        const bridgeSources = Array.from(bridgeUrls).map(url => ({ bridgeUrl: url }));

        console.log(`📡 Extracted ${bridgeSources.length} unique bridge URLs from ${wallets.length} wallets`);

        // If no bridge URLs found, return a default bridge (fallback)
        if (bridgeSources.length === 0) {
            console.warn('⚠️ No bridge URLs found in wallets list, using default TON API bridge');
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
     * Used for desktop wallet apps to scan
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
     *
     * Returns current wallet connection state including address and wallet info
     * Automatically cleans up stale sessions
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

            // Validate connection integrity
            if (!wallet || !account || !account.address) {
                console.warn(`Stale TON Connect session detected for subscriber ${userId}, clearing...`);
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
            console.error(`Error checking TON Connect connection for subscriber ${userId}:`, error);

            // Clean up broken connection
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
     * Clear database wallet record for subscriber
     */
    private async clearDatabaseWallet(userId: string): Promise<void> {
        try {
            await this.db.query(
                `UPDATE subscribers SET wallet_address = NULL, wallet_connected = false WHERE telegram_id = $1`,
                [userId]
            );
            console.log(`[Payment Bot] Cleared database wallet for subscriber ${userId}`);
        } catch (error) {
            console.error(`Failed to clear database wallet for subscriber ${userId}:`, error);
        }
    }

    /**
     * Disconnect wallet
     *
     * Clears all session data from database and memory
     * User will need to reconnect wallet for future transactions
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
                console.log(`Clearing ${allKeys.length} TON Connect session keys for subscriber ${userId}`);

                for (const key of allKeys) {
                    await userStorage.removeItem(key);
                }

                // Remove storage from cache
                this.storages.delete(userId);
            }

            // Clear from cache
            this.instances.delete(userId);

            console.log(`[Payment Bot] Wallet disconnected for subscriber ${userId}`);
        } catch (error) {
            console.error(`Error disconnecting wallet for subscriber ${userId}:`, error);
            // Force clear anyway
            this.instances.delete(userId);
            this.storages.delete(userId);
            throw error;
        }
    }

    /**
     * Send transaction through TON Connect
     *
     * CRITICAL: This is the main payment flow for subscriptions
     *
     * Process:
     * 1. Validate transaction parameters
     * 2. Send transaction request to connected wallet
     * 3. Wait for user confirmation (2 minute timeout)
     * 4. Extract transaction hash from signed BOC
     * 5. Return transaction details for payment monitoring
     *
     * SECURITY:
     * - Validates wallet is connected before sending
     * - Validates transaction format (address, amount)
     * - Sets reasonable timeout to prevent indefinite waiting
     * - Handles user rejection gracefully
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
            // Validate transaction parameters
            this.validateTransaction(transaction);

            // Set expiry time (10 minutes from now)
            const validUntil = transaction.validUntil || Math.floor(Date.now() / 1000) + 600;

            console.log(`[Payment Bot] Sending transaction via TON Connect to subscriber ${userId}...`, {
                messages: transaction.messages.length,
                amount: transaction.messages[0]?.amount,
                destination: transaction.messages[0]?.address,
                validUntil,
            });

            // Create timeout promise (2 minutes)
            // IMPORTANT: User must confirm transaction within this window
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

            console.log(`✅ Transaction confirmed by subscriber ${userId}`);

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
            console.error('[Payment Bot] TON Connect transaction error:', error);

            // Categorize errors for better user feedback
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
     *
     * Ensures:
     * - Transaction has messages
     * - Each message has valid address and amount
     * - Amount is positive
     * - Address format is valid
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
     *
     * Accepts:
     * - EQ/UQ (mainnet bounceable/non-bounceable)
     * - kQ/0Q (testnet bounceable/non-bounceable)
     */
    private isValidAddress(address: string): boolean {
        const pattern = /^(EQ|UQ|0Q|kQ)[A-Za-z0-9_-]{46}$/;
        return pattern.test(address);
    }

    /**
     * Get wallet deep link for transaction confirmation
     *
     * Generates a URL that opens the connected wallet app
     * The wallet will automatically show the pending transaction
     *
     * HOW IT WORKS:
     * In TON Connect, transaction requests are sent via the bridge server
     * We provide a link that simply opens the wallet app
     * The pending transaction will be visible there automatically
     */
    async getWalletDeepLink(userId: string): Promise<{
        walletName: string;
        deepLink: string | null;
    } | null> {
        const connector = await this.getInstance(userId);

        if (!connector.connected) {
            console.warn(`Cannot generate deep link: wallet not connected for subscriber ${userId}`);
            return null;
        }

        const wallet = connector.wallet;
        if (!wallet) {
            console.warn(`Cannot generate deep link: wallet info not available for subscriber ${userId}`);
            return null;
        }

        try {
            // Extract wallet info
            const walletDevice = wallet.device as any;
            const walletName = walletDevice.appName || 'Unknown Wallet';

            // Get universal link or deep link from wallet info
            let deepLink: string | null = null;

            // Try universal link first (preferred for TON wallets)
            if (walletDevice.universalLink) {
                deepLink = walletDevice.universalLink;
                console.log(`Using universal link for ${walletName}: ${deepLink}`);
            }
            // Fall back to deep link (older format)
            else if (walletDevice.deepLink) {
                deepLink = walletDevice.deepLink;
                console.log(`Using deep link for ${walletName}: ${deepLink}`);
            }
            // Generate wallet-specific deep links based on wallet name
            else {
                const walletNameLower = walletName.toLowerCase();

                if (walletNameLower.includes('tonkeeper')) {
                    deepLink = 'https://app.tonkeeper.com/';
                } else if (walletNameLower.includes('tonhub') || walletNameLower.includes('sandbox')) {
                    deepLink = 'https://tonhub.com/';
                } else if (walletNameLower.includes('openmask')) {
                    // OpenMask (browser extension) - no mobile app
                    deepLink = null;
                } else if (walletNameLower.includes('mytonwallet')) {
                    deepLink = 'https://mytonwallet.io/';
                } else if (walletNameLower.includes('telegram')) {
                    // Telegram Wallet (built into Telegram app)
                    deepLink = 'https://t.me/wallet';
                    console.log(`Using Telegram Wallet deep link for ${walletName}`);
                } else {
                    // Generic fallback - return null if we don't know the wallet
                    console.log(`No specific deep link available for wallet: ${walletName}`);
                    deepLink = null;
                }
            }

            if (deepLink) {
                console.log(`✅ Generated wallet deep link for subscriber ${userId}: ${walletName}`);
            } else {
                console.log(`⚠️ No deep link available for ${walletName} - wallet may be browser extension`);
            }

            return {
                walletName,
                deepLink
            };
        } catch (error) {
            console.error(`Error generating wallet deep link for subscriber ${userId}:`, error);
            return null;
        }
    }
}

/**
 * Export function to create service instance
 */
export function createTonConnectService(db: Pool): TonConnectService {
    return new TonConnectService(db);
}
