> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Phase 3 Agent Prompts — Mobile (Agent 8 first, then 9 and 10 in parallel)

---

### AGENT 8 PROMPT: Mobile Auth + Chain Context

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is the MOST CRITICAL mobile change: creating the chain context provider, enabling dual embedded wallets (Solana + Ethereum), and adding SIWE login support.

CONTEXT: The mobile app uses Privy for authentication and embedded wallet creation. Currently only Solana embedded wallets are created. OAuth users (Google/Instagram) should now get BOTH a Solana AND an Ethereum wallet. External wallet users (Phantom) only get their specific chain. The chain context provider lets the app know which chain is currently selected.

PREREQUISITES ALREADY MERGED:
- packages/shared/src/types.ts has ChainType = 'solana' | 'base'
- apps/mobile/src/config/env.ts has BASE_RPC_URL, BASE_CHAIN_ID, BASE_NETWORK

STEP-BY-STEP:

1. Read these files FULLY (every line):
   - apps/mobile/src/hooks/useAuth.ts
   - apps/mobile/src/providers/PrivyGuard.tsx
   - apps/mobile/src/providers/AuthBridge.tsx
   - apps/mobile/app/_layout.tsx
   - apps/mobile/app/login.tsx

2. RESEARCH PRIVY SDK: Before writing code, check what Privy exports:
   Run these commands to discover the available hooks:
   - grep -r "useEmbeddedEthereumWallet\|useEmbeddedEvmWallet" node_modules/@privy-io/expo/ --include="*.d.ts" -l
   - grep -r "useLoginWithSiwe" node_modules/@privy-io/expo/ --include="*.d.ts" -l
   - grep -r "export.*useEmbedded" node_modules/@privy-io/expo/dist/ --include="*.d.ts"
   - grep -r "embeddedWallets.*ethereum\|embeddedWallets.*evm" node_modules/@privy-io/expo/ --include="*.d.ts"
   
   This tells you:
   a) The exact hook name for ETH embedded wallets (useEmbeddedEthereumWallet or useEmbeddedEvmWallet)
   b) Whether useLoginWithSiwe exists
   c) The config shape for enabling ETH wallets in PrivyProvider
   
   If hooks don't exist in current version, check package.json for @privy-io/expo version and add a comment noting an upgrade may be needed.

3. CREATE apps/mobile/src/providers/ChainProvider.tsx:
   
   This is a React context provider that stores the selected chain in AsyncStorage.
   
   Interface:
   - chain: ChainType (default 'solana')
   - setChain(chain: ChainType): void (persists to AsyncStorage key 'momento_selected_chain')
   - availableChains: ChainType[] (default ['solana'])
   - setAvailableChains(chains: ChainType[]): void
   
   Behavior:
   - On mount, load chain from AsyncStorage
   - When availableChains changes, if current chain is not in the list, switch to first available
   - Export both ChainProvider component and useChain() hook from same file
   
   See docs/multi-chain/08-agent8-mobile-auth.md Step 1 for complete implementation.

4. CREATE apps/mobile/src/hooks/useChain.ts:
   Single line re-export: export { useChain } from '@/providers/ChainProvider';

5. MODIFY apps/mobile/app/_layout.tsx:
   Import ChainProvider and wrap it around the children/Slot INSIDE PrivyGuard but OUTSIDE AuthBridge.
   Read the file to understand the current provider nesting, then add ChainProvider in the right place.

6. MODIFY apps/mobile/src/providers/PrivyGuard.tsx:
   Find the PrivyProvider config object (look for embeddedWallets or similar).
   Add Ethereum wallet config alongside the existing Solana one:
   
   Based on your research in step 2, add the ethereum embedded wallet config.
   Expected shape (verify against SDK types):
   embeddedWallets: {
     solana: { createOnLogin: 'users-without-wallets' },
     ethereum: { createOnLogin: 'users-without-wallets' },
   }
   
   If the config key is 'evm' instead of 'ethereum', use that.

7. MODIFY apps/mobile/src/hooks/useAuth.ts:

   This is the most complex change. Make these modifications:

   a) Update getPrivyHooks() to also load the ETH wallet hook and SIWE hook:
      Based on your research, add:
      useEmbeddedEthereumWallet: privy.useEmbeddedEthereumWallet, (or whatever name you found)
      useLoginWithSiwe: privy.useLoginWithSiwe, (if it exists)

   b) Inside useAuth(), AFTER the existing solanaWallet setup, add ETH wallet:
      const ethWallet = hooks.useEmbeddedEthereumWallet({ ... callbacks ... });
      
   c) Add auto-create effect for ETH wallet (mirror the Solana one, with 2000ms delay):
      const ethCreatingRef = useRef(false);
      useEffect matching privy.user && ethWallet.status === 'not-created'
      
   d) Extract ETH wallet address:
      const ethWalletAddress = ethWallet.status === 'connected' && ethWallet.wallets?.length > 0
        ? ethWallet.wallets[0].address : null;
      
   e) Add getEthWalletProvider function (same pattern as getWalletProvider but for ETH)
   
   f) Import useChain and update available chains:
      const { setAvailableChains } = useChain();
      useEffect that builds chains array based on walletAddress and ethWalletAddress
   
   g) If useLoginWithSiwe exists, add loginWithEthWallet method:
      - generateMessage with wallet address, domain 'momento.app', uri 'https://momento.app'
      - Sign with external wallet
      - Call siwe.login with signature + message
      If useLoginWithSiwe doesn't exist, create a stub that throws 'SIWE not available in this SDK version'
   
   h) Update the return object to include all new fields:
      ethWalletAddress, ethWalletStatus, getEthWalletProvider, loginWithEthWallet
   
   i) Update GUEST_AUTH to include all new fields with null/stub values

8. MODIFY apps/mobile/app/login.tsx:
   Add a "CONNECT BASE WALLET" button section after the existing Phantom/MWA sections.
   
   For MVP: If you confirmed WalletConnect/SIWE support exists in the Privy SDK, implement it fully.
   If NOT: Add the button with a "Coming Soon" alert on press. Still add the button UI so the flow is visible.
   
   Style the button similarly to the existing wallet connection buttons but with Base branding (blue #0052FF color).

VERIFICATION:
- Run: cd apps/mobile && npx tsc --noEmit (zero errors)
- ChainProvider.tsx exists and exports ChainProvider + useChain
- useChain.ts exists and re-exports useChain
- _layout.tsx has ChainProvider in the provider tree
- PrivyGuard has ethereum embedded wallet config
- useAuth returns ethWalletAddress, ethWalletStatus, getEthWalletProvider
- GUEST_AUTH has all new fields
- login.tsx has Base wallet button (even if coming-soon)

COMMIT with message:
feat(mobile): add multi-chain auth with ETH wallet and chain context
```

---

### AGENT 9 PROMPT: Mobile Wallet UI + Chain Switcher

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to create a chain switcher dropdown component and update the wallet screen to display chain-appropriate data.

CONTEXT: The wallet screen currently shows Solana wallet info (SOL balance, USDC, Solscan links, "Solana Wallet" label). After your changes, it will show a dropdown at the top to switch between Solana and Base, with all labels, balances, and links updating accordingly.

PREREQUISITES ALREADY MERGED:
- packages/shared/ has ChainType, CHAIN_CONFIG with name/symbol/iconColor/explorerName/explorerUrl/nativeIcon
- apps/mobile/src/providers/ChainProvider.tsx exists with useChain() hook
- apps/mobile/src/hooks/useAuth.ts returns ethWalletAddress
- apps/mobile/src/config/env.ts has BASE_NETWORK

STEP-BY-STEP:

1. Read these files FULLY:
   - apps/mobile/app/wallet.tsx (703 lines — read ALL of it)
   - apps/mobile/src/hooks/useWalletBalance.ts
   - apps/mobile/src/hooks/useAuth.ts (to see ethWalletAddress in return type)
   - apps/mobile/src/utils/formatters.ts
   - packages/shared/src/constants.ts (for CHAIN_CONFIG)
   - Check if apps/mobile/src/components/features/index.ts exists (barrel export)

2. MODIFY apps/mobile/src/hooks/useWalletBalance.ts:
   
   a) Add import: import { useChain } from '@/hooks/useChain';
   b) Inside the hook function, get chain: const { chain } = useChain();
   c) Update queryKey to include chain: queryKey: ['walletBalance', chain],
   d) Update queryFn to pass chain: queryFn: () => apiService.get<WalletBalance>(`/wallet/balance?chain=${chain}`),
   e) Keep everything else (polling, fast polling, app state) unchanged.

3. CREATE apps/mobile/src/components/features/ChainSwitcher.tsx:
   
   A dropdown component that shows current chain and lets users switch.
   
   Behavior:
   - If only 1 chain available: show chain name + colored dot (no dropdown arrow, not tappable)
   - If 2+ chains available: show chain name + colored dot + chevron-down icon, tappable
   - On tap: open a Modal (transparent, fade animation) with backdrop
   - Modal shows "SELECT NETWORK" title and a list of available chains
   - Each item shows: colored dot, chain name, "ETH network" or "SOL network" subtitle
   - Active chain has a checkmark icon
   - Tapping a chain calls setChain and closes modal
   
   Use these style constants (imported from @/styles/theme):
   - COLORS.surface, COLORS.border, COLORS.textPrimary, COLORS.textSecondary, COLORS.textTertiary, COLORS.primary
   - SPACING.xs, SPACING.sm, SPACING.md, SPACING.lg
   - RADII.md, RADII.lg, RADII.full
   - TYPOGRAPHY.body, TYPOGRAPHY.caption, TYPOGRAPHY.label
   
   Use CHAIN_CONFIG[chain].iconColor for the colored dot, CHAIN_CONFIG[chain].name for the label.
   
   See docs/multi-chain/09-agent9-wallet-ui.md Step 2 for the complete implementation.

4. MODIFY apps/mobile/app/wallet.tsx:

   a) Add imports:
      import { ChainSwitcher } from '@/components/features/ChainSwitcher'; (or from the barrel export)
      import { useChain } from '@/hooks/useChain';
      import { CHAIN_CONFIG } from '@momento/shared';
      import type { ChainType } from '@momento/shared';

   b) Inside WalletScreen component, add:
      const { chain } = useChain();
      const chainConfig = CHAIN_CONFIG[chain];

   c) Replace the getSolscanUrl function (around line 44) with:
      function getExplorerUrl(chain: ChainType, addressOrTx: string, type: 'address' | 'tx' = 'address'): string {
        if (chain === 'base') {
          return `https://basescan.org/${type}/${addressOrTx}`;
        }
        const cluster = ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : '';
        const solType = type === 'address' ? 'account' : 'tx';
        return `https://solscan.io/${solType}/${addressOrTx}${cluster}`;
      }

   d) Update wallet address resolution (around line 82-86):
      const { walletAddress: solWalletAddress, ethWalletAddress } = useAuth();
      const walletAddress = chain === 'base'
        ? ethWalletAddress
        : (solWalletAddress || (profile?.walletAddress && !profile.walletAddress.startsWith('pending-') ? profile.walletAddress : null));

   e) Replace the wallet address card (around lines 158-193):
      - Replace <Text style={styles.addressLabel}>Solana Wallet</Text> with <ChainSwitcher />
      - Update network badge: show BASE_NETWORK for base chain, SOLANA_NETWORK for solana
      - Replace "View on Solscan" with "View on {chainConfig.explorerName}"

   f) Update handleOpenSolscan (rename to handleOpenExplorer):
      Linking.openURL(getExplorerUrl(chain, walletAddress, 'address'));
      Update the dependency array to include chain.

   g) Replace the SOL asset card (around lines 222-240):
      Use chainConfig.iconColor, chainConfig.nativeIcon, chainConfig.symbol, chainConfig.name
      Use balance.nativeBalance ?? balance.solBalance for amount
      Use balance.nativePriceUsd ?? balance.solPriceUsd for price

   h) Update recent transactions explorer links (around line 311):
      Replace getSolscanUrl(tx.signature, 'tx') with getExplorerUrl(chain, tx.signature, 'tx')

   i) Update the header Solscan button (around line 135):
      Replace handleOpenSolscan with handleOpenExplorer

5. If apps/mobile/src/components/features/index.ts exists, add:
   export { ChainSwitcher } from './ChainSwitcher';

VERIFICATION:
- Run: cd apps/mobile && npx tsc --noEmit (zero errors)
- ChainSwitcher.tsx exists
- wallet.tsx uses chain-dynamic labels (no hardcoded "Solana Wallet", "Solscan", "SOL")
- Balance hook includes chain in queryKey
- All getSolscanUrl calls replaced with getExplorerUrl

COMMIT with message:
feat(mobile): add chain switcher dropdown and chain-aware wallet screen
```

---

### AGENT 10 PROMPT: Mobile Swap/Send/Fund Modals

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to update the SwapModal, SendModal, and FundWalletModal to work with both Solana and Base chains.

CONTEXT: These modals currently only work with Solana. They need to check the current chain (via useChain hook) and use the appropriate tokens, addresses, validation, and transaction signing for each chain.

PREREQUISITES ALREADY MERGED:
- useChain() hook returns { chain } where chain is 'solana' | 'base'
- useAuth() returns { getWalletProvider (Solana), getEthWalletProvider (Base) }
- API routes accept ?chain=base or chain in body
- CHAIN_CONFIG has base.usdcAddress, base.symbol ('ETH'), etc.
- useWalletBalance already fetches per-chain balances

STEP-BY-STEP:

1. Read these files FULLY:
   - apps/mobile/src/hooks/useSwap.ts
   - apps/mobile/src/hooks/useOnramp.ts
   - apps/mobile/src/components/features/SwapModal.tsx
   - apps/mobile/src/components/features/SendModal.tsx
   - apps/mobile/src/components/features/FundWalletModal.tsx
   - apps/mobile/src/hooks/useAuth.ts (for provider API)

2. MODIFY apps/mobile/src/hooks/useSwap.ts:

   a) Import: import { useChain } from '@/hooks/useChain';
   b) Get chain inside hook: const { chain } = useChain();
   c) In fetchQuote: if chain === 'base', call API with params: chain, sellToken, buyToken, sellAmount instead of inputMint, outputMint, amount
   d) In executeSwap: if chain === 'base':
      - POST to /wallet/swap with { chain: 'base', quoteResponse }
      - Get ETH provider via auth.getEthWalletProvider()
      - If response has requiresApproval === true: send an approve tx first (ERC-20 approve(spender, maxUint256) where spender is approvalTarget)
      - Send swap tx via provider.request({ method: 'eth_sendTransaction', params: [{ to, data, value, chainId: '0x2105' }] })
      - Return tx hash
   e) Keep ALL existing Solana swap logic in else branch — do not modify it
   f) Add a waitForTransaction helper:
      async function waitForTransaction(provider, txHash, timeout = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
          if (receipt) return receipt;
          await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('Transaction confirmation timeout');
      }

3. MODIFY apps/mobile/src/components/features/SwapModal.tsx:

   a) Import useChain and CHAIN_CONFIG
   b) Get chain: const { chain } = useChain();
   c) Make token list dynamic:
      Base: [{ address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', symbol: 'ETH', decimals: 18 }, { address: CHAIN_CONFIG.base.usdcAddress, symbol: 'USDC', decimals: 6 }]
      Solana: keep existing SOL/USDC tokens
   d) Replace any hardcoded 'SOL' labels with CHAIN_CONFIG[chain].symbol
   e) Replace Solscan links with chain-appropriate explorer: chain === 'base' ? `https://basescan.org/tx/${sig}` : existing solscan URL
   f) Update fee warnings to be chain-appropriate

4. MODIFY apps/mobile/src/components/features/SendModal.tsx:

   a) Import useChain and CHAIN_CONFIG
   b) Get chain: const { chain } = useChain();
   c) Update token toggle: use CHAIN_CONFIG[chain].symbol instead of hardcoded 'SOL'
   d) Reset selected token when chain changes: useEffect(() => setSelectedToken(CHAIN_CONFIG[chain].symbol), [chain])
   e) Update address validation:
      Base: /^0x[a-fA-F0-9]{40}$/.test(address)
      Solana: keep existing validation
   f) For Base sends:
      - POST to /wallet/send with { chain: 'base', recipientAddress, amount, token }
      - Sign via getEthWalletProvider().request({ method: 'eth_sendTransaction', params: [{ to, value, data, chainId: '0x2105' }] })
   g) Update explorer links
   h) Update minimum amounts: ETH min 0.0001, SOL min 0.001, USDC min 0.01

5. MODIFY apps/mobile/src/hooks/useOnramp.ts:

   a) Add chain parameter to hook: function useOnramp({ provider, chain, enabled })
   b) Include chain in queryKey: ['onramp', provider, chain]
   c) Pass chain to API: apiService.get('/wallet/onramp', { provider, chain })

6. MODIFY apps/mobile/src/components/features/FundWalletModal.tsx:

   a) Import useChain: const { chain } = useChain();
   b) Pass chain to useOnramp hook
   c) Update on-chain transfer section:
      - Display correct wallet address for chain (ethWalletAddress for base)
      - Update transfer instructions for chain (Base: "Open Coinbase/MetaMask", "Select Base network")
      - Update network warning for chain
   d) Keep existing onramp WebView logic — just the URLs change (handled by backend)

VERIFICATION:
- Run: cd apps/mobile && npx tsc --noEmit (zero errors)
- SwapModal shows ETH/USDC on Base, SOL/USDC on Solana
- SendModal validates 0x addresses for Base, base58 for Solana
- SendModal token toggle shows ETH on Base, SOL on Solana
- FundWalletModal passes chain to onramp
- All existing Solana flows still work unchanged

COMMIT with message:
feat(mobile): chain-aware swap, send, and fund modals
```

---
