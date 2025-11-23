# Account Abstraction Micropayment System - Deployment Guide

## 🎯 Overview

This system enables **gasless AI micropayments** with **zero popups** after initial wallet connection.

## 📦 Contracts

### 1. **SessionKeyRegistry.sol**

- Stores and validates session keys
- Tracks spending limits (per-prompt & total)
- Validates UserOperations before execution

### 2. **MicropaymentManager.sol**

- Handles X402 token transfers for AI prompts
- Called by SmartAccount with session key signature
- Emits events for tracking

### 3. **MicropaymentPaymaster.sol**

- Sponsors gas for micropayment transactions
- Verifies UserOps call `chargeX402` only
- Deposit ETH to sponsor gas

### 4. **SmartAccountV2.sol**

- ERC-4337 compatible smart account
- Validates session key signatures
- Executes micropayment calls

## 🚀 Deployment Steps

### Prerequisites

- Foundry or Hardhat installed
- Deployer wallet with ARB Sepolia ETH
- X402 token contract deployed

### Step 1: Deploy SessionKeyRegistry

```bash
forge create --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  src/SessionKeyRegistry.sol:SessionKeyRegistry
```

### Step 2: Deploy MicropaymentManager

```bash
forge create --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args \
    $X402_TOKEN_ADDRESS \
    $TREASURY_ADDRESS \
    1000000000000000 \
    100000000000000000 \
  src/MicropaymentManager.sol:MicropaymentManager
```

Parameters:

- `_paymentToken`: X402 token address
- `_treasury`: Platform wallet receiving payments
- `_minPayment`: Min payment per prompt (0.001 X402)
- `_maxPayment`: Max payment per prompt (0.1 X402)

### Step 3: Deploy MicropaymentPaymaster

```bash
forge create --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args \
    0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 \
    $MICROPAYMENT_MANAGER_ADDRESS \
  src/MicropaymentPaymaster.sol:MicropaymentPaymaster
```

### Step 4: Deploy SmartAccountV2 Implementation

```bash
forge create --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args \
    0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 \
  src/SmartAccountV2.sol:SmartAccountV2
```

### Step 5: Fund Paymaster

```bash
cast send $PAYMASTER_ADDRESS \
  --rpc-url $ARB_SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --value 0.1ether \
  "deposit()"
```

## 🔧 Backend Integration

### Update `.env`

```bash
# Add these to devs-backend/.env
AA_SESSION_KEY_REGISTRY_ADDRESS="0x..."
AA_MICROPAYMENT_MANAGER_ADDRESS="0x..."
AA_MICROPAYMENT_PAYMASTER_ADDRESS="0x..."
AA_SMART_ACCOUNT_V2_IMPLEMENTATION="0x..."
```

### Update UserOpBuilder Service

Replace the current paymaster logic:

```typescript
buildPaymasterAndData(): string {
  // Use deployed paymaster
  return AA_MICROPAYMENT_PAYMASTER_ADDRESS;
}
```

Update callData to call MicropaymentManager:

```typescript
buildCallData(smartAccountAddress: string, credits: number, promptId: string): string {
  const micropaymentManager = new ethers.Interface([
    'function chargeX402(uint256 amount, string calldata promptId)'
  ]);

  const creditsWei = ethers.parseUnits(credits.toString(), 18); // Adjust decimals

  return micropaymentManager.encodeFunctionData('chargeX402', [
    creditsWei,
    promptId
  ]);
}
```

## 📝 Frontend Flow

### 1. First Time Setup (One Signature)

```typescript
// Generate session key pair
const sessionKeyWallet = ethers.Wallet.createRandom();

// Ask user to sign authorization message
const message = `I authorize session key: ${sessionKeyWallet.address}
to spend up to 10 X402 per prompt
until ${expiryDate}
for gasless micropayments on EvolvX.`;

const signature = await signer.signMessage(message);

// Backend stores sessionKeyWallet.privateKey (encrypted)
// Backend calls SmartAccount.registerSessionKey(...)
```

### 2. Every Prompt (No Signature)

```typescript
// User types prompt
const prompt = "Explain quantum computing";

// Backend calculates cost
const cost = calculatePromptCost(prompt); // e.g., 5 X402

// Backend builds UserOperation
const userOp = {
  sender: smartAccountAddress,
  callData: micropaymentManager.chargeX402(cost, promptId),
  signature: sessionKeyWallet.signMessage(userOpHash), // ← Backend signs
  paymasterAndData: paymasterAddress,
};

// Backend sends to bundler
await bundler.sendUserOperation(userOp);

// AI runs, user sees response
```

## 🎉 Result

- ✅ **Zero wallet popups** after initial setup
- ✅ **Gasless micropayments** (paymaster sponsors gas)
- ✅ **Per-prompt charging** based on complexity
- ✅ **Session key security** with spending limits
- ✅ **Revocable keys** for compromised scenarios

## 🔒 Security Features

1. **Spending Limits**

   - Max per prompt: 0.1 X402
   - Max total: 1000 X402
   - Expiry: 30 days

2. **Function Restrictions**

   - Session key can ONLY call `MicropaymentManager.chargeX402`
   - Cannot transfer tokens directly
   - Cannot call other contracts

3. **Revocation**
   - User can revoke session key anytime
   - SmartAccount rejects operations from revoked keys

## 📊 Monitoring

Track micropayments via events:

```solidity
event Micropaid(
    address indexed user,
    address indexed smartAccount,
    uint256 amount,
    string promptId,
    uint256 timestamp
);
```

Query from frontend:

```typescript
const filter = micropaymentManager.filters.Micropaid(null, smartAccountAddress);
const events = await micropaymentManager.queryFilter(filter);
```

## 🧪 Testing

Test on Arbitrum Sepolia:

1. Deploy all contracts
2. Create test smart account
3. Register session key
4. Send test prompt
5. Verify X402 transfer
6. Check paymaster gas sponsorship

## 🚨 Troubleshooting

**AA20: Account not deployed**

- Deploy SmartAccount via factory first

**AA30: Paymaster not deployed**

- Ensure paymaster contract exists
- Fund paymaster with ETH

**AA31: Paymaster deposit too low**

- Call `paymaster.deposit()` with more ETH

**Session key validation failed**

- Check expiry timestamp
- Verify spending limits
- Ensure calling correct function

## 📚 Next Steps

1. Deploy contracts to Arbitrum Sepolia
2. Update backend with contract addresses
3. Test session key registration flow
4. Test micropayment execution
5. Monitor gas costs and optimize
6. Deploy to mainnet when ready
