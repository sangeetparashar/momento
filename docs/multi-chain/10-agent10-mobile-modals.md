# Agent 10: Mobile Swap/Send/Fund Modals

## Mission
Update the SwapModal, SendModal, and FundWalletModal to be chain-aware. Each modal should operate on the currently selected chain, using the appropriate token addresses, transaction signing, and validation.

## Prerequisites
- All Phase 1 agents (types, schema, config) must be merged
- All Phase 2 agents (backend routes) must be merged
- Agent 8 (useAuth with ETH wallet provider) must be merged
- Agent 9 (useChain hook, useWalletBalance chain-aware) must be merged

## Files to Read First
- `apps/mobile/src/components/features/SwapModal.tsx` — current swap UI (FULL READ)
- `apps/mobile/src/components/features/SendModal.tsx` — current send UI (FULL READ)
- `apps/mobile/src/components/features/FundWalletModal.tsx` — current fund UI (FULL READ)
- `apps/mobile/src/hooks/useSwap.ts` — current swap hook (FULL READ)
- `apps/mobile/src/hooks/useOnramp.ts` — current onramp hook
- `apps/mobile/src/hooks/useAuth.ts` — for wallet providers (after Agent 8)
- `packages/shared/src/constants.ts` — CHAIN_CONFIG (after Agent 1)

## Files to Modify
- `apps/mobile/src/hooks/useSwap.ts`
- `apps/mobile/src/hooks/useOnramp.ts`
- `apps/mobile/src/components/features/SwapModal.tsx`
- `apps/mobile/src/components/features/SendModal.tsx`
- `apps/mobile/src/components/features/FundWalletModal.tsx`

---

## Detailed Instructions

### PART A: Swap

### Step 1: Update useSwap Hook

The current `useSwap.ts` hook does:
1. `fetchQuote()` → calls `GET /api/wallet/swap?inputMint=...&outputMint=...&amount=...`
2. `executeSwap()` → calls `POST /api/wallet/swap` with quote, receives base64 tx, signs with Solana provider

**Updated hook should:**

```typescript
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';

export function useSwap() {
  const { chain } = useChain();
  const auth = useAuth();
  const walletBalance = useWalletBalance();

  const fetchQuote = async (params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }) => {
    if (chain === 'base') {
      // Use Base-specific params
      return apiService.get<SwapQuote>('/wallet/swap', {
        chain: 'base',
        sellToken: params.inputMint,    // 0x address or 'ETH'
        buyToken: params.outputMint,
        sellAmount: params.amount,
        slippageBps: params.slippageBps || 50,
      });
    }

    // Solana (existing)
    return apiService.get<SwapQuote>('/wallet/swap', {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps || 50,
    });
  };

  const executeSwap = async (quoteResponse: any) => {
    if (chain === 'base') {
      return executeBaseSwap(quoteResponse);
    }
    return executeSolanaSwap(quoteResponse);
  };

  // --- BASE SWAP EXECUTION ---
  const executeBaseSwap = async (quoteResponse: any) => {
    // 1. Get tx params from backend
    const txParams = await apiService.post('/wallet/swap', {
      chain: 'base',
      quoteResponse,
    });

    // 2. Get ETH wallet provider
    const provider = await auth.getEthWalletProvider();
    if (!provider) throw new Error('ETH wallet not connected');

    // 3. Check if ERC-20 approval is needed
    if (txParams.data?.requiresApproval && txParams.data?.approvalTarget) {
      await handleErc20Approval(
        provider,
        txParams.data.sellTokenAddress,
        txParams.data.approvalTarget,
        quoteResponse.sellAmount || quoteResponse.inAmount
      );
    }

    // 4. Send the swap transaction via provider
    // RESEARCH REQUIRED: Verify the exact Privy ETH provider API
    // It should support something like:
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        to: txParams.data.to,
        data: txParams.data.data,
        value: txParams.data.value,
        gas: txParams.data.gas ? '0x' + parseInt(txParams.data.gas).toString(16) : undefined,
        chainId: '0x' + (8453).toString(16), // Base mainnet
      }],
    });

    return txHash;
  };

  // --- ERC-20 APPROVAL ---
  const handleErc20Approval = async (
    provider: any,
    tokenAddress: string,
    spender: string,
    amount: string
  ) => {
    // Check current allowance first
    // approve(address spender, uint256 amount)
    // Function selector: 0x095ea7b3
    const maxUint256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const spenderPadded = spender.slice(2).padStart(64, '0');
    const data = '0x095ea7b3' + spenderPadded + maxUint256;

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        to: tokenAddress,
        data,
        value: '0x0',
        chainId: '0x' + (8453).toString(16),
      }],
    });

    // Wait for approval to be mined before proceeding with swap
    // RESEARCH: How to wait for tx confirmation with Privy provider
    // Option: poll eth_getTransactionReceipt
    await waitForTransaction(provider, txHash);
  };

  // --- SOLANA SWAP EXECUTION (existing, keep unchanged) ---
  const executeSolanaSwap = async (quoteResponse: any) => {
    // ... keep ALL existing Solana swap logic ...
  };

  return { fetchQuote, executeSwap };
}
```

### Step 2: Update SwapModal Component

In `apps/mobile/src/components/features/SwapModal.tsx`:

**2a. Import chain context:**
```typescript
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';
```

**2b. Update token options based on chain:**

The current swap modal hardcodes SOL and USDC as input/output tokens. Make this chain-aware:

```typescript
const { chain } = useChain();

// Token options based on chain
const tokenOptions = chain === 'base'
  ? [
      { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH', name: 'Ether', decimals: 18 },
      { address: CHAIN_CONFIG.base.usdcAddress, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ]
  : [
      { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9 },
      { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ];
```

**2c. Update explorer link on success:**

```typescript
// Replace Solscan link with chain-appropriate explorer
const explorerUrl = chain === 'base'
  ? `https://basescan.org/tx/${signature}`
  : `https://solscan.io/tx/${signature}${ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : ''}`;
```

**2d. Update balance display:**

Replace references to `solBalance` with chain-aware native balance:
```typescript
const nativeBalance = balance?.nativeBalance ?? balance?.solBalance ?? 0;
const nativeSymbol = CHAIN_CONFIG[chain].symbol;
```

**2e. Update fee warning:**

```typescript
// "Keep at least 0.005 SOL for fees" → dynamic
const feeWarning = chain === 'base'
  ? 'Keep some ETH for gas fees (~$0.01 per tx)'
  : 'Keep at least 0.005 SOL for fees';
```

### PART B: Send

### Step 3: Update SendModal Component

In `apps/mobile/src/components/features/SendModal.tsx`:

**3a. Import chain context:**
```typescript
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';
```

**3b. Update token toggle:**

Current: toggles between SOL and USDC. Update:
```typescript
const { chain } = useChain();
const nativeSymbol = CHAIN_CONFIG[chain].symbol; // 'SOL' or 'ETH'

// Token toggle: native token or USDC
const [selectedToken, setSelectedToken] = useState<string>(nativeSymbol);

// When chain changes, reset token to native
useEffect(() => {
  setSelectedToken(CHAIN_CONFIG[chain].symbol);
}, [chain]);
```

**3c. Update address validation:**

Current: validates Solana address (32-44 chars, base58). Add Base validation:
```typescript
const isValidAddress = (address: string) => {
  if (chain === 'base') {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  // Solana: 32-44 base58 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};
```

**3d. Update transaction execution:**

The current send flow:
1. POST to `/api/wallet/send` to get unsigned tx
2. Sign with Solana provider
3. Send via Solana Connection

For Base chain:
1. POST to `/api/wallet/send` with `chain: 'base'` to get EVM tx params
2. Send via ETH provider

```typescript
const executeSend = async () => {
  if (chain === 'base') {
    return executeBaseSend();
  }
  return executeSolanaSend(); // existing logic
};

const executeBaseSend = async () => {
  const { data } = await apiService.post('/wallet/send', {
    chain: 'base',
    recipientAddress,
    amount: parseFloat(amount),
    token: selectedToken,
  });

  const provider = await auth.getEthWalletProvider();
  if (!provider) throw new Error('ETH wallet not connected');

  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      to: data.to,
      value: data.value,
      data: data.data || '0x',
      chainId: '0x' + (8453).toString(16),
    }],
  });

  return txHash;
};
```

**3e. Update success screen explorer link:**
```typescript
const explorerUrl = chain === 'base'
  ? `https://basescan.org/tx/${signature}`
  : `https://solscan.io/tx/${signature}${ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : ''}`;
```

**3f. Update minimum amounts:**
```typescript
const minAmount = chain === 'base'
  ? (selectedToken === 'ETH' ? 0.0001 : 0.01)  // ETH or USDC
  : (selectedToken === 'SOL' ? 0.001 : 0.01);   // SOL or USDC
```

### PART C: Fund/Onramp

### Step 4: Update FundWalletModal

In `apps/mobile/src/components/features/FundWalletModal.tsx`:

**4a. Pass chain to onramp URL:**

```typescript
import { useChain } from '@/hooks/useChain';

const { chain } = useChain();

// Update onramp hook call to include chain
const onrampQuery = useOnramp({ provider: selectedProvider, chain });
```

**4b. Update useOnramp hook:**

In `apps/mobile/src/hooks/useOnramp.ts`:

```typescript
export function useOnramp({ provider, chain, enabled }: {
  provider: string;
  chain: ChainType;
  enabled?: boolean;
}) {
  return useQuery<OnrampUrlResponse>({
    queryKey: ['onramp', provider, chain],
    queryFn: () => apiService.get('/wallet/onramp', { provider, chain }),
    enabled: enabled !== false,
    staleTime: 0,
    gcTime: 0,
  });
}
```

**4c. Update on-chain transfer instructions:**

The FundWalletModal has an "On-Chain Transfer" option that shows wallet address and transfer instructions. Update for chain awareness:

```typescript
// Transfer instructions
const transferInstructions = chain === 'base'
  ? [
      'Open your Coinbase, MetaMask, or other ETH wallet',
      'Select Base network',
      'Send USDC to the address above',
      'Funds arrive in ~1 minute',
    ]
  : [
      'Open your Phantom or Solflare wallet',
      'Send SOL or USDC to the address above',
      'Select Solana network',
      'Funds arrive in ~30 seconds',
    ];
```

**4d. Update wallet address display for on-chain transfer:**

```typescript
const { walletAddress: solAddress, ethWalletAddress } = useAuth();
const displayAddress = chain === 'base' ? ethWalletAddress : solAddress;
```

**4e. Update network warning:**

```typescript
const networkWarning = chain === 'base'
  ? `Only send assets on the Base network. Sending on other networks may result in permanent loss.`
  : `Only send assets on Solana ${ENV.SOLANA_NETWORK}. Sending on other networks may result in permanent loss.`;
```

---

## Research Required

1. **Privy ETH provider API**: How does `provider.request()` work for `eth_sendTransaction`? Check:
   - `node_modules/@privy-io/expo` for EIP-1193 provider interface
   - Privy docs: https://docs.privy.io/guide/expo/embedded/ethereum/usage
   - The provider should implement standard EIP-1193 `request({ method, params })`

2. **Transaction confirmation**: After `eth_sendTransaction`, how to wait for confirmation:
   - Option A: Poll `eth_getTransactionReceipt` via provider
   - Option B: Use provider events if available
   - Implement a simple polling helper:
   ```typescript
   async function waitForTransaction(provider: any, txHash: string, timeout = 60000) {
     const start = Date.now();
     while (Date.now() - start < timeout) {
       const receipt = await provider.request({
         method: 'eth_getTransactionReceipt',
         params: [txHash],
       });
       if (receipt) return receipt;
       await new Promise(r => setTimeout(r, 2000));
     }
     throw new Error('Transaction confirmation timeout');
   }
   ```

3. **ERC-20 approval UX**: For swap, the user may need to approve token spending before swap. How to make this seamless:
   - Show "Approving..." step in progress UI
   - Then "Swapping..." after approval confirms
   - Only needed for ERC-20 → anything swaps (not ETH → anything)

---

## Verification Checklist

1. **SwapModal works on Solana**: No regression — existing Solana swap flow unchanged
2. **SwapModal works on Base**: Shows ETH/USDC tokens, executes via ETH provider
3. **ERC-20 approval handled**: When swapping USDC, approval is requested first
4. **SendModal works on Solana**: No regression
5. **SendModal works on Base**: ETH and USDC sends via ETH provider
6. **Address validation per chain**: Base rejects non-0x, Solana rejects non-base58
7. **FundWalletModal works on both**: Correct onramp URLs, correct instructions
8. **Explorer links per chain**: BaseScan for Base, Solscan for Solana
9. **Token labels per chain**: ETH/SOL correctly shown
10. **TypeScript compiles**: `cd apps/mobile && npx tsc --noEmit`

## What to Commit
```
feat(mobile): chain-aware swap, send, and fund modals

- Update SwapModal with Base chain token options and ETH provider signing
- Add ERC-20 approval flow for Base chain swaps
- Update SendModal with Base address validation and ETH/USDC sends
- Update FundWalletModal with chain-specific onramp URLs and instructions
- Dynamic token labels and explorer links based on selected chain
- Preserve all existing Solana modal functionality
```
