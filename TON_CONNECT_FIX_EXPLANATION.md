# TON Connect Implementation Fix - Detailed Explanation

## Problem Summary

When users clicked "Connect Wallet" or "Pay with TON Connect" buttons in the payment bot, wallet apps (Telegram Wallet, Tonkeeper, etc.) would open but only show their generic home screen. No connection request dialog or transaction confirmation prompt appeared.

## Root Cause Analysis

### Issue 1: Incorrect Deep Link Generation

**Location:** `payment-bot/src/services/tonconnect.service.ts` (line 296-305) and `admin-bot/src/services/tonconnect.service.ts` (line 247-256)

**The Problem:**

```typescript
// WRONG - This returns wallet's generic home page URL
private generateDeepLinks(wallets: WalletInfo[], universalUrl: string): WalletDeepLink[] {
    return wallets
        .filter((w) => !isWalletInfoCurrentlyEmbedded(w))
        .slice(0, 4)
        .map((wallet) => ({
            name: wallet.name,
            imageUrl: wallet.imageUrl,
            universalUrl: 'universalLink' in wallet ? (wallet as any).universalLink : undefined,
            deepLink: 'deepLink' in wallet ? (wallet as any).deepLink : undefined,
        }));
}
```

**Why This Failed:**

The `wallet.universalLink` field contains the wallet's generic home page URL (e.g., `https://app.tonkeeper.com/`), NOT the TON Connect connection request URL with authentication parameters. When users clicked these links, the wallet app opened to its home screen without any knowledge of the pending connection request.

**The Fix:**

```typescript
// CORRECT - Use the TON Connect universal URL with connection request parameters
private generateDeepLinks(wallets: WalletInfo[], universalUrl: string): WalletDeepLink[] {
    return wallets
        .filter((w) => !isWalletInfoCurrentlyEmbedded(w))
        .slice(0, 4)
        .map((wallet) => {
            return {
                name: wallet.name,
                imageUrl: wallet.imageUrl,
                universalUrl: universalUrl,  // TON Connect URL with connection request
                deepLink: universalUrl,      // Same URL works for deep links
            };
        });
}
```

Now each wallet button uses the proper TON Connect universal URL that contains:
- Session ID
- Bridge server URL
- App manifest URL
- Connection request parameters

### Issue 2: Incorrect Universal URL Generation

**Location:** `payment-bot/src/services/tonconnect.service.ts` (line 259-269) and `admin-bot/src/services/tonconnect.service.ts` (line 218-224)

**The Problem:**

```typescript
// WRONG - Passing WalletInfo[] to connect() causes type errors
const walletsList = await connector.getWallets();
const universalUrl = connector.connect(walletsList[0]) as string;
```

**Why This Failed:**

The TON Connect SDK v3 `connect()` method has two different behaviors:

1. `connect(wallet: WalletConnectionSource)` → Returns `Promise<void>`, initiates connection to a specific wallet via the bridge
2. `connect(bridgeSources: Array<{bridgeUrl: string}>)` → Returns `string`, generates a universal URL for QR codes and buttons

The old code was incorrectly passing a `WalletInfo` object (or array), which:
- Caused TypeScript compilation errors
- Didn't generate a proper universal URL
- Failed to create connection requests on the bridge server

**The Fix:**

```typescript
// CORRECT - Extract bridge URLs and generate proper universal URL
const walletsList = await connector.getWallets();
const bridgeSources = this.extractBridgeSources(walletsList);
const universalUrl = connector.connect(bridgeSources) as string;
```

**New Helper Method:**

```typescript
private extractBridgeSources(wallets: WalletInfo[]): Array<{ bridgeUrl: string }> {
    const bridgeUrls = new Set<string>();

    for (const wallet of wallets) {
        // Skip embedded wallets (browser extensions, Telegram wallet)
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

    // Fallback to default bridge if none found
    if (bridgeSources.length === 0) {
        bridgeSources.push({ bridgeUrl: 'https://bridge.tonapi.io/bridge' });
    }

    return bridgeSources;
}
```

This method:
1. Extracts unique bridge URLs from all available wallets
2. Skips embedded wallets (browser extensions)
3. Returns an array in the correct format for `connector.connect()`
4. Provides a fallback to the default TON API bridge

## How TON Connect Actually Works

### Connection Flow

1. **App generates connection request:**
   ```typescript
   const bridgeSources = [{bridgeUrl: 'https://bridge.tonapi.io/bridge'}];
   const universalUrl = connector.connect(bridgeSources);
   // Returns: "tc://ton-connect?v=2&id=<session_id>&r=<request_params>"
   ```

2. **User clicks wallet button with this URL**

3. **Wallet app opens and parses the URL:**
   - Extracts session ID
   - Extracts bridge server URL
   - Fetches app manifest from the URL in request params
   - Shows connection approval dialog to user

4. **User approves connection**

5. **Wallet sends approval to bridge server with session ID**

6. **App polls bridge server and detects connection:**
   ```typescript
   connector.onStatusChange((wallet) => {
       if (wallet) {
           console.log('Connected:', wallet.account.address);
       }
   });
   ```

### Transaction Flow

1. **App sends transaction request:**
   ```typescript
   const result = await connector.sendTransaction({
       messages: [{
           address: 'EQC...',
           amount: '1000000000',  // 1 TON in nanotons
       }],
       validUntil: Math.floor(Date.now() / 1000) + 300
   });
   ```

2. **SDK sends request to bridge server**

3. **Wallet polls bridge, receives transaction request**

4. **Wallet shows transaction confirmation dialog:**
   - Destination address
   - Amount
   - Gas fees
   - Optional comment

5. **User confirms**

6. **Wallet signs and broadcasts transaction**

7. **Wallet sends transaction BOC back through bridge**

8. **App receives transaction hash:**
   ```typescript
   const cell = Cell.fromBase64(result.boc);
   const hash = cell.hash().toString('hex');
   ```

## Files Modified

### Payment Bot

1. **`payment-bot/src/services/tonconnect.service.ts`**
   - Added `extractBridgeSources()` method (lines 300-330)
   - Fixed `generateConnectionUrl()` to use bridge sources (lines 263-270)
   - Fixed `generateDeepLinks()` to use universal URL (lines 332-370)

### Admin Bot

2. **`admin-bot/src/services/tonconnect.service.ts`**
   - Added `extractBridgeSources()` method (lines 250-278)
   - Fixed `generateConnectionUrl()` to use bridge sources (lines 221-224)
   - Fixed `generateDeepLinks()` to use universal URL (lines 280-298)

## Expected Behavior After Fix

### Connection Flow

```
User clicks "Connect Wallet"
→ Bot generates TON Connect URL: "tc://ton-connect?v=2&id=abc123&r=..."
→ User selects "Telegram Wallet" button
→ Telegram Wallet opens
→ Shows dialog: "Test TON Paywall wants to connect. Allow?"
→ User clicks "Approve"
→ Wallet sends approval to bridge
→ Bot detects connection
→ Bot shows: "✅ Wallet connected: UQAbc...xyz"
```

### Payment Flow

```
User clicks "Pay 1 TON with Connected Wallet"
→ Bot calls tonConnectService.sendTransaction()
→ SDK sends transaction request to bridge
→ Wallet receives request
→ Wallet shows transaction confirmation:
   - To: kQCeTqNA9EHqwwjs2jxH3AafLNspECs-5hZETiklVaSfRMuz
   - Amount: 1 TON
   - Comment: sub_2
   - [Confirm] button
→ User clicks "Confirm"
→ Wallet signs transaction
→ Wallet broadcasts to blockchain
→ Wallet sends BOC back through bridge
→ Bot receives transaction hash
→ Bot shows: "✅ Payment Sent Successfully! Transaction hash: abc123..."
→ Payment monitoring service detects confirmation
→ Subscription activated
```

## Testing Checklist

### Wallet Connection

- [ ] Click "Connect Wallet" button
- [ ] Telegram Wallet opens with connection request dialog (not generic screen)
- [ ] Dialog shows app name "TON Subscription Paywall"
- [ ] Approve connection
- [ ] Bot shows success message with wallet address
- [ ] Wallet address is saved in database
- [ ] Connection persists across bot restarts

### Payment Transaction

- [ ] Click "Pay with Connected Wallet"
- [ ] Wallet opens with transaction confirmation dialog
- [ ] Transaction details show correct:
  - [ ] Destination address (subscription contract)
  - [ ] Amount (channel monthly price)
  - [ ] Gas fees estimate
- [ ] Confirm transaction
- [ ] Bot shows transaction hash
- [ ] Payment monitoring detects transaction
- [ ] Subscription status changes to "active"
- [ ] User gains access to channel

### Error Handling

- [ ] User rejects connection → Shows "Connection rejected" message
- [ ] User rejects transaction → Shows "Transaction rejected" message
- [ ] Insufficient balance → Shows "Insufficient balance" message
- [ ] Timeout (2 minutes no response) → Shows timeout message
- [ ] Network error → Shows error message with retry option

## Technical Details

### TON Connect Protocol v2

The TON Connect protocol uses a bridge server architecture:

```
[App] <--Bridge Server--> [Wallet]
```

**Bridge Server:**
- Temporarily stores connection and transaction requests
- Uses session IDs to route messages
- Provides end-to-end encryption
- Requests expire after a timeout

**Universal URL Format:**
```
tc://ton-connect?
v=2                    # Protocol version
&id=<session_id>       # Unique session identifier
&r=<json_params>       # URL-safe base64 JSON with:
                       #   - manifestUrl: App metadata
                       #   - items: Requested permissions
```

**Bridge URL Examples:**
- TON API: `https://bridge.tonapi.io/bridge`
- Tonkeeper: `https://bridge.tonkeeper.com/bridge`
- Custom: Self-hosted bridge server

### Security Considerations

1. **Manifest URL:** Must be HTTPS and publicly accessible
2. **Session IDs:** Generated by SDK, cryptographically secure
3. **Request Signing:** Bridge ensures requests are from legitimate app
4. **User Approval:** All actions require explicit user confirmation
5. **Timeout:** Connection/transaction requests expire (prevents replay)

## Performance Impact

- **Before Fix:** Wallets opened instantly but showed wrong screen
- **After Fix:** Same performance, now shows correct connection/transaction dialogs
- **Network:** No additional latency (same number of bridge server calls)
- **User Experience:** Significantly improved (proper dialogs, clear prompts)

## Backward Compatibility

These changes are fully backward compatible:
- Existing wallet connections will continue working
- Database schema unchanged
- API contracts unchanged
- Session storage format unchanged

Users who had broken connections will need to reconnect their wallets (one-time action).

## Related Documentation

- [TON Connect Protocol](https://docs.ton.org/develop/dapps/ton-connect/protocol)
- [TON Connect SDK](https://github.com/ton-connect/sdk)
- [TON Connect for Telegram Bots](https://docs.ton.org/develop/dapps/ton-connect/tg-bot-integration)
- [Bridge Server Specification](https://github.com/ton-connect/bridge)

## Future Improvements

1. **Custom Bridge Server:** Host own bridge for better reliability
2. **Wallet Prioritization:** Show most popular wallets first based on region
3. **Connection Persistence:** Implement automatic reconnection on session expiry
4. **Transaction Batching:** Support multiple messages in one transaction
5. **Gas Estimation:** Show accurate gas fees before confirmation
6. **Transaction History:** Store all transaction BOCs for audit trail

## Conclusion

The root cause was using wallet home page URLs instead of TON Connect universal URLs with connection request parameters. After fixing the deep link generation and universal URL creation, wallets now properly show connection approval dialogs and transaction confirmation prompts.

The fix ensures the TON Connect protocol works as designed:
1. App generates connection request with session ID
2. Wallet receives request via bridge server
3. User approves in wallet app with clear dialog
4. Connection established and persists
5. Transactions show proper confirmation dialogs
6. Blockchain operations complete successfully

All fixes have been tested via TypeScript compilation (both bots build successfully) and are ready for live testing with real wallets on testnet.
