import { useCallback, useState } from 'react';
import { useFundSolanaWallet } from '@privy-io/expo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { ENV } from '@/config/env';
import { showErrorToast } from '@/utils/toast';

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
 * Sandbox vs production is derived from SOLANA_NETWORK so we don't add another env var.
 */
export function usePrivyFunding() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  const { fundWallet: fundSolanaWallet } = useFundSolanaWallet();

  const [isFunding, setIsFunding] = useState(false);

  const fund = useCallback(async (): Promise<'completed' | 'cancelled' | 'error'> => {
    const address = walletAddress;

    if (!address) {
      showErrorToast('No Solana wallet found yet. Please try again in a moment.');
      return 'error';
    }

    setIsFunding(true);
    try {
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

      // Funds can take a few minutes to land, but refetch now so the balance
      // updates as soon as the chain confirms. Keyed by userId + chain.
      queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id, 'solana'] });
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
  }, [walletAddress, user?.id, fundSolanaWallet, queryClient]);

  return { fund, isFunding };
}
