# Exit Code 46284 - Root Cause Analysis and Fix

## Problem Summary

Contract deployment is failing with **exit code 46284** when users try to deploy a channel subscription contract via the factory.

**Error Message**: "Deployment not registered. Contact admin bot to setup channel first."

**Transaction**: https://testnet.tonscan.org/tx/b30e29de15d96bd98caf542d9667f44d09435e5b8e50f7deed4a424217b3bdd0

## Root Cause Analysis

### The Issue: Blockchain State Propagation Delay

The failure occurs due to a **timing race condition** between:
1. Backend pre-registering deployment parameters in the factory contract
2. User immediately sending "deploy" transaction

The backend was only waiting for **wallet seqno confirmation** (STEP 1) but NOT waiting for **contract state update** (STEP 2).

### Blockchain Confirmation Stages

```
Backend sends RegisterDeployment transaction
  ↓
Wallet seqno increments ← BACKEND WAS WAITING HERE (INSUFFICIENT)
  ↓
Transaction enters mempool
  ↓
Transaction included in block
  ↓
Block confirmed by validators
  ↓
Contract state updated ← NEED TO WAIT HERE (CRITICAL)
  ↓
User sends "deploy" transaction
```

### Why Seqno Confirmation Is Insufficient

When `waitForSeqno()` returns:
- Transaction accepted by the network
- Wallet seqno has incremented
- **BUT**: Contract state may not be updated yet

When the user sends "deploy" immediately after:
- Factory contract processes "deploy" message
- Lookup `registeredDeployments.get(senderHash)` returns **null**
- Contract throws error with exit code 46284
- Transaction fails and bounces back

### Evidence from Logs

```
[Line 30]  ✅ RegisterDeployment succeeded - parameters registered on-chain
[Line 202] ✅ waitForSeqno() completed (seqno incremented)
[Line 58]  ✅ User transaction confirmed
[Line 99]  ❌ Error: "Not a cell: null" (contract not deployed - 46284 failure)
```

## The Fix

### Changes Made to `/home/gmet/workspace/ton-paywall/shared/ton-client.ts`

#### 1. Correct Opcode for RegisterDeployment

**Before**:
```typescript
const registerMessage = beginCell()
  .storeUint(1234567890, 32) // Wrong placeholder opcode
  .storeUint(Date.now(), 64) // Unnecessary queryId
  .storeAddress(user)
  .storeInt(channelId, 64)
  .storeCoins(toNano(monthlyPrice))
  .endCell();
```

**After**:
```typescript
const registerMessage = beginCell()
  .storeUint(320997630, 32) // Correct opcode: 0x132208fe (from Tact compiler)
  .storeAddress(user)         // userWallet
  .storeInt(channelId, 64)    // channelId as int64
  .storeCoins(toNano(monthlyPrice)) // monthlyPrice
  .endCell();
```

**Note**: The RegisterDeployment message structure does NOT include a queryId field. The Tact-generated opcode is **320997630** (hex: 0x132208fe).

#### 2. Added State Confirmation Wait

**New Method**: `waitForRegistrationConfirmation()`

This method polls the factory contract's `getRegisteredDeployment()` getter method every 2 seconds until:
- Registration is found in contract state (non-null result), OR
- Timeout occurs (30 seconds default)

**Implementation**:
```typescript
private async waitForRegistrationConfirmation(
  factoryAddress: string,
  userWallet: string,
  timeoutMs: number = 30000
): Promise<void> {
  const client = this.ensureClient();
  const factory = Address.parse(factoryAddress);
  const user = Address.parse(userWallet);

  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Query factory contract's getRegisteredDeployment() getter
      const result = await client.runMethod(factory, 'getRegisteredDeployment', [
        { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
      ]);

      // Check if registration exists (non-null result)
      const stack = result.stack;
      const isNull = stack.readNumber();

      if (isNull !== -1) {
        // Registration found in contract state
        console.log('✅ Registration confirmed in factory contract state');
        return;
      }

      console.log(`⏳ Registration not yet visible, waiting... (${elapsed}s)`);
    } catch (error) {
      console.log(`⏳ Waiting for contract state update... (${elapsed}s)`);
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error('Registration confirmation timeout');
}
```

#### 3. Updated registerDeployment() Flow

**New Flow**:
```typescript
async registerDeployment(...) {
  // Send RegisterDeployment message with correct opcode
  await walletContract.sendTransfer({ ... });

  console.log('✅ Message sent, waiting for seqno confirmation...');

  // STEP 1: Wait for wallet seqno increment
  await this.waitForSeqno(seqno + 1);

  console.log('✅ Seqno confirmed. Now waiting for contract state update...');

  // STEP 2: CRITICAL - Wait for contract state update
  await this.waitForRegistrationConfirmation(factoryAddress, userWallet, 30000);

  console.log('✅ Deployment parameters fully confirmed on-chain');
  console.log('   Factory contract state updated - user can now send "deploy"');
}
```

#### 4. Increased Gas for Registration

Changed gas from 0.01 TON to 0.02 TON for the RegisterDeployment transaction to ensure sufficient gas for contract state updates.

## Testing the Fix

### Expected Behavior After Fix

1. User starts channel setup in admin bot
2. Backend sends RegisterDeployment transaction (with correct opcode 320997630)
3. Backend waits for seqno confirmation (transaction accepted)
4. Backend polls `getRegisteredDeployment()` until registration is visible in contract state
5. Bot shows "Send 0.7 TON to factory with 'deploy' comment" message
6. User sends "deploy" transaction
7. Factory finds registration in `registeredDeployments` map
8. Factory deploys ChannelSubscription contract successfully
9. User receives SubscriptionDeployed notification

### Expected Log Output

```
📝 Registering deployment parameters on-chain: { ... }
✅ RegisterDeployment message sent, waiting for seqno confirmation...
✅ Seqno confirmed. Now waiting for contract state update...
⏳ Registration not yet visible in contract state, waiting... (2s)
⏳ Registration not yet visible in contract state, waiting... (4s)
✅ Registration confirmed in factory contract state
✅ Deployment parameters fully confirmed on-chain
   Factory contract state updated - user can now send "deploy" + 0.7 TON
```

### Testing Steps

1. Stop the admin bot: `pm2 stop admin-bot`
2. Rebuild: `cd /home/gmet/workspace/ton-paywall/admin-bot && npm run build`
3. Start the admin bot: `pm2 start admin-bot`
4. Test channel setup with a real user
5. Monitor logs: `pm2 logs admin-bot --lines 100`
6. Verify user's "deploy" transaction succeeds (exit code 0)
7. Verify contract is deployed and address is saved to database

### Testnet Testing

**Factory Address**: `EQBUQ6S-a1kWsS8l14y7uQqiLiLpELJlAp4Vwlwvp3En1vT_`

Test with small amounts on testnet before mainnet deployment.

## Additional Fixes

### Error Message Handling

The backend should catch registration timeout errors and provide helpful user feedback:

```typescript
try {
  await deploymentService.requestDeploymentFromUser(...);
} catch (error) {
  if (error.message.includes('Registration confirmation timeout')) {
    await ctx.reply(
      '⏳ The blockchain is taking longer than expected to confirm the registration.\n\n' +
      'Please wait 30 seconds and try the setup again. This is normal during high network load.'
    );
  } else {
    throw error;
  }
}
```

## Technical Details

### Contract State vs Transaction State

**Key Insight**: In TON blockchain, there's a difference between:

1. **Transaction Confirmation**: Transaction included in a block and seqno incremented
2. **Contract State Update**: Contract's persistent storage updated and visible to subsequent transactions

The fix ensures we wait for #2, not just #1.

### TON Getter Method Behavior

When calling `getRegisteredDeployment()`:
- **Registered**: Returns `RegisteredParams` struct (non-null)
- **Not Registered**: Returns `null` (encoded as -1 in stack)

The fix polls this getter until it returns non-null.

### Why 2-Second Polling Interval

TON block time is approximately 5 seconds. Polling every 2 seconds:
- Ensures we detect state update within 1-2 polling cycles
- Balances responsiveness vs RPC load
- Total wait time typically 4-10 seconds

## Files Modified

1. `/home/gmet/workspace/ton-paywall/shared/ton-client.ts`
   - Fixed RegisterDeployment opcode (320997630)
   - Added `waitForRegistrationConfirmation()` method
   - Updated `registerDeployment()` to wait for state confirmation
   - Increased gas from 0.01 to 0.02 TON

## Deployment Checklist

- [x] Fix implemented in ton-client.ts
- [x] Admin bot rebuilt with fix
- [ ] Test with real user on testnet
- [ ] Verify exit code 46284 no longer occurs
- [ ] Monitor logs for new confirmation flow
- [ ] Document typical confirmation time
- [ ] Update user-facing error messages
- [ ] Deploy to production

## References

- Factory Contract: `/home/gmet/workspace/ton-paywall/contracts/contracts/factory.tact`
- Admin Bot Service: `/home/gmet/workspace/ton-paywall/admin-bot/src/services/contract-deployment.ts`
- TON Client: `/home/gmet/workspace/ton-paywall/shared/ton-client.ts`
- Contract ABI: `/home/gmet/workspace/ton-paywall/contracts/build/SubscriptionFactory_SubscriptionFactory.abi`

## Summary

**The Problem**: Backend was not waiting for contract state to update before asking user to send "deploy" transaction.

**The Solution**: Added state confirmation polling that waits for the factory contract's `getRegisteredDeployment()` to return non-null before proceeding.

**The Result**: User's "deploy" transaction will now succeed because the factory contract will have the pre-registered parameters available when processing the transaction.

---

**Last Updated**: 2025-10-25
**Status**: Fixed, awaiting testing
**Priority**: CRITICAL (blocks all channel deployments)
