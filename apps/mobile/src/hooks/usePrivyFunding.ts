import { useCallback, useState } from 'react';
import { useFundWallet, useFundSolanaWallet } from '@privy-io/expo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useChain } from '@/hooks/useChain';
import { ENV } from '@/config/env';
import { showErrorToast } from '@/utils/toast';
import type { ChainType } from '@momento/shared';

/**
 * Privy-native fiat onramp ("buy USDC") using Privy's prebuilt funding modal.
 *
 * Replaces the bespoke MoonPay/Ramp/Transak WebView-URL flow. Privy routes to
 * its configured card/onramp providers (MoonPay, Coinbase) inside its own modal
 * — provider selection, KYC, and the payment UI are all handled by Privy, so we
 * need no provider accounts, no server URL-builders, and no webhooks.
 *
 * Requires:
 *   - <PrivyElements/> mounted (done in PrivyGuard) — else throws
 *     'privy_elements_not_ready'.
 *   - The MoonPay fiat-onramp plugin enabled in the Privy dashboard (Phase 0).
 *
 * Sandbox vs production is derived from the existing network flags so we don't
 * add another env var: Solana uses SOLANA_NETWORK, Base uses BASE_NETWORK.
 */
export function usePrivyFunding() {
  const queryClient = useQueryClient();
  const { chain } = useChain() as { chain: ChainType };
  const { walletAddress, ethWalletAddress, user } = useAuth();

  // Both hooks expose `fundWallet(config)`. They must be called
  // unconditionally (rules of hooks); we pick which to invoke at call time.
  const { fundWallet: fundEvmWallet } = useFundWallet();
  const { fundWallet: fundSolanaWallet } = useFundSolanaWallet();

  const [isFunding, setIsFunding] = useState(false);

  const fund = useCallback(async (): Promise<'completed' | 'cancelled' | 'error'> => {
    const isBase = chain === 'base';
    const address = isBase ? ethWalletAddress : walletAddress;

    if (!address) {
      showErrorToast(
        `No ${isBase ? 'Base' : 'Solana'} wallet found yet. Please try again in a moment.`,
      );
      return 'error';
    }

    setIsFunding(true);
    try {
      if (isBase) {
        const useSandbox = ENV.BASE_NETWORK !== 'mainnet';
        await fundEvmWallet({
          address,
          asset: 'USDC',
          defaultPaymentMethod: 'card',
          card: { preferredProvider: 'moonpay' },
          moonpay: {
            useSandbox,
            uiConfig: { theme: 'dark', accentColor: '#00FF88' },
          },
        });
      } else {
        const useSandbox = ENV.SOLANA_NETWORK !== 'mainnet-beta';
        await fundSolanaWallet({
          address,
          asset: 'USDC',
          // SolanaCluster is an object ({ name, rpcUrl? }), not a bare string.
          cluster: { name: useSandbox ? 'devnet' : 'mainnet-beta' },
          defaultPaymentMethod: 'card',
          card: { preferredProvider: 'moonpay' },
          moonpay: {
            useSandbox,
            uiConfig: { theme: 'dark', accentColor: '#00FF88' },
          },
        });
      }

      // Funds can take a few minutes to land, but refetch now so the balance
      // updates as soon as the chain confirms. Keyed by userId + chain.
      queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id, chain] });
      return 'completed';
    } catch (err: any) {
      // funding_flow_cancelled is a normal user action, not an error.
      const code = err?.code ?? err?.message ?? '';
      if (typeof code === 'string' && code.includes('cancel')) {
        return 'cancelled';
      }
      console.warn('[usePrivyFunding] fund failed:', code || err);
      showErrorToast('Could not start the purchase. Please try again.');
      return 'error';
    } finally {
      setIsFunding(false);
    }
  }, [chain, ethWalletAddress, walletAddress, user?.id, fundEvmWallet, fundSolanaWallet, queryClient]);

  return { fund, isFunding };
}
