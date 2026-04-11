import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useChain } from '@/hooks/useChain';
import { useAuth } from '@/hooks/useAuth';

export interface WalletTransactionItem {
  id: string;
  chain: string;
  signature: string;
  type: 'swap' | 'send' | 'receive' | 'fund';
  label: string;
  inputToken?: string | null;
  outputToken?: string | null;
  inputAmount?: string | null;
  outputAmount?: string | null;
  recipientAddress?: string | null;
  status: string;
  createdAt: string;
}

interface TransactionsResponse {
  items: WalletTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Fetches the user's transaction history from the server.
 * Chain-aware — re-fetches when the selected chain changes.
 */
export function useWalletTransactions() {
  const { chain } = useChain();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<TransactionsResponse>({
    queryKey: ['walletTransactions', userId, chain],
    queryFn: () => apiService.get<TransactionsResponse>(`/wallet/transactions?chain=${chain}`),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
