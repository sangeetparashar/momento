import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { PricePoint, PortfolioPoint } from '@momento/shared';

type TimeRange = '24H' | '7D' | '1M' | '3M' | '1Y';

export function usePriceHistory(range: TimeRange = '1M') {
  return useQuery<PricePoint[]>({
    queryKey: ['priceHistory', range],
    queryFn: () => apiService.get<PricePoint[]>(`/wallet/history?range=${range}`),
    staleTime: range === '24H' ? 60_000 : 300_000,
  });
}

export function usePortfolioSnapshots(range: TimeRange = '1M') {
  return useQuery<PortfolioPoint[]>({
    queryKey: ['portfolioSnapshots', range],
    queryFn: () => apiService.get<PortfolioPoint[]>(`/wallet/snapshots?range=${range}`),
    staleTime: 60_000,
  });
}
