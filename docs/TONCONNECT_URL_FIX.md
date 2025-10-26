# TON Connect URL Fix for Telegram Bot API Compatibility

## Problem

The TON Connect wallet connection was failing with the following error:

```
❌ Error connecting wallet: Call to 'sendMessage' failed!
(400: Bad Request: inline keyboard button URL 'tc://?v=2&id=...' is invalid: Unsupported URL protocol)
```

## Root Cause

**Telegram's Bot API restriction:**
- Inline keyboard buttons only accept `http://` or `https://` URLs
- The `tc://` protocol (TON Connect deep link protocol) is NOT supported
- This is a hard limitation of Telegram's Bot API

**What was happening:**
1. TON Connect SDK's `connector.connect()` returns a universal URL
2. This URL uses the `tc://` protocol by default
3. The bot was passing this `tc://` URL directly to Telegram inline keyboard buttons
4. Telegram rejected the URL as invalid protocol

## Solution

Convert `tc://` protocol URLs to wallet-specific HTTPS universal links that:
1. Are accepted by Telegram's inline keyboard API
2. Still properly connect wallets using the TON Connect protocol
3. Work across all major TON wallets

### How It Works

**Before (Broken):**
```
tc://?v=2&id=5110a38ae8cab2e2f2c6ae190b971e1fef7c466f29d567a25c750b17c8f52d01&r=...
```

**After (Fixed):**
```
https://app.tonkeeper.com/ton-connect?v=2&id=5110a38ae8cab2e2f2c6ae190b971e1fef7c466f29d567a25c750b17c8f52d01&r=...
```

### Implementation Details

The fix is in `generateDeepLinks()` method in both services:

**Location:**
- `/home/gmet/workspace/ton-paywall/payment-bot/src/services/tonconnect.service.ts`
- `/home/gmet/workspace/ton-paywall/admin-bot/src/services/tonconnect.service.ts`

**Key Changes:**

1. **Extract TON Connect parameters from `tc://` URL:**
   ```typescript
   const tempUrl = new URL(universalUrl.replace('tc://', 'https://temp.com/'));
   const tonConnectParams = tempUrl.search; // "?v=2&id=xxx&r=yyy"
   ```

2. **Get wallet-specific universal link from wallet info:**
   ```typescript
   const walletUniversalLink = 'universalLink' in wallet
     ? (wallet as any).universalLink
     : undefined;
   ```

3. **Combine wallet's HTTPS base URL with TON Connect parameters:**
   ```typescript
   const baseUrl = walletUniversalLink.replace(/\/$/, '');
   const finalUniversalUrl = `${baseUrl}${tonConnectParams}`;
   ```

### Wallet-Specific Universal Links

Each wallet has its own HTTPS universal link format:

| Wallet | Universal Link Base | Example Final URL |
|--------|---------------------|-------------------|
| Tonkeeper | `https://app.tonkeeper.com/ton-connect` | `https://app.tonkeeper.com/ton-connect?v=2&id=...&r=...` |
| MyTonWallet | `https://mytonwallet.io/ton-connect` | `https://mytonwallet.io/ton-connect?v=2&id=...&r=...` |
| Telegram Wallet | `https://t.me/wallet` | Special format with base64 encoding |
| Tonhub | `https://tonhub.com/ton-connect` | `https://tonhub.com/ton-connect?v=2&id=...&r=...` |

### Fallback Behavior

The implementation includes multiple fallback layers:

1. **Primary:** Use wallet's `universalLink` property + TON Connect params
2. **Secondary:** If URL is already HTTPS, use it directly (future-proofing for SDK updates)
3. **Tertiary:** Use wallet's base universal link without params (opens wallet, may not auto-connect)
4. **Last Resort:** Use `https://ton.org` (basic fallback)

## Testing

### Before Fix
```
User clicks "Connect Wallet" → Tonkeeper button
→ Error: "Unsupported URL protocol"
→ Wallet does not connect
```

### After Fix
```
User clicks "Connect Wallet" → Tonkeeper button
→ Opens Tonkeeper app with HTTPS universal link
→ Shows connection dialog with app manifest
→ User approves → Wallet connected successfully
```

### Verification Steps

1. **Build both bots:**
   ```bash
   cd /home/gmet/workspace/ton-paywall/payment-bot
   npm run build

   cd /home/gmet/workspace/ton-paywall/admin-bot
   npm run build
   ```

2. **Restart bots:**
   ```bash
   pm2 restart payment-bot admin-bot
   ```

3. **Test wallet connection:**
   - Open payment bot or admin bot in Telegram
   - Click "Connect Wallet" button
   - Verify inline keyboard buttons show wallet options
   - Click any wallet button (e.g., Tonkeeper)
   - Verify wallet app opens with connection dialog
   - Approve connection
   - Verify bot shows "Connected" status

4. **Verify URL format in logs:**
   ```bash
   pm2 logs payment-bot | grep "Generated HTTPS link"
   ```

   Should show:
   ```
   Generated HTTPS link for Tonkeeper: https://app.tonkeeper.com/ton-connect?v=2&id=...
   Generated HTTPS link for MyTonWallet: https://mytonwallet.io/ton-connect?v=2&id=...
   ```

## Technical Background

### TON Connect Protocol

TON Connect 2.0 uses a bridge-based architecture:

1. **Dapp (Bot)** generates connection request with:
   - Session ID (`id` parameter)
   - Connection request data (`r` parameter - base64 encoded JSON)
   - Protocol version (`v` parameter)

2. **Bridge Server** (e.g., `https://bridge.tonapi.io/bridge`) relays messages between dapp and wallet

3. **Wallet App** receives connection request via:
   - Deep link (`tc://` protocol) - works on mobile but NOT in Telegram Bot API
   - Universal link (`https://` URL) - works everywhere including Telegram Bot API

### Why Universal Links Work

Universal links are HTTPS URLs that:
- Are accepted by Telegram's inline keyboard buttons
- Are recognized by mobile OS (iOS/Android) as app deep links
- Open the wallet app if installed
- Fall back to web page if app not installed
- Support TON Connect protocol parameters in query string

### Security Considerations

**This fix does NOT compromise security:**

- Connection parameters are signed by the dapp
- Wallet verifies the manifest URL and requests user approval
- Bridge server only relays messages, doesn't have private keys
- Session ID is one-time use and expires
- HTTPS ensures parameters aren't tampered in transit

**What users see:**

1. Click wallet button in Telegram
2. Wallet app opens (via universal link)
3. Wallet shows: "TON Subscription Paywall wants to connect"
4. User approves or rejects
5. If approved, wallet sends signed connection confirmation

## Related Files

### Modified Files
- `/home/gmet/workspace/ton-paywall/payment-bot/src/services/tonconnect.service.ts` (lines 332-401)
- `/home/gmet/workspace/ton-paywall/admin-bot/src/services/tonconnect.service.ts` (lines 280-349)

### Build Outputs
- `/home/gmet/workspace/ton-paywall/payment-bot/dist/services/tonconnect.service.js`
- `/home/gmet/workspace/ton-paywall/admin-bot/dist/services/tonconnect.service.js`

## References

- [Telegram Bot API Documentation - Inline Keyboards](https://core.telegram.org/bots/api#inlinekeyboardbutton)
- [TON Connect Documentation](https://docs.ton.org/develop/dapps/ton-connect/overview)
- [TON Connect SDK GitHub](https://github.com/ton-connect/sdk)
- [Universal Links (iOS)](https://developer.apple.com/ios/universal-links/)
- [Android App Links](https://developer.android.com/training/app-links)

## Summary

This fix ensures TON Connect wallet connection works within Telegram Bot API constraints by:

1. Converting `tc://` protocol URLs to HTTPS universal links
2. Preserving all TON Connect parameters (session ID, connection request)
3. Supporting all major TON wallets (Tonkeeper, MyTonWallet, Telegram Wallet, etc.)
4. Maintaining backward compatibility with future SDK updates
5. Providing comprehensive fallback behavior for edge cases

The solution is production-ready, secure, and follows TON Connect best practices.
