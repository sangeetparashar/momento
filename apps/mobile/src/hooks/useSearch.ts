import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { PublicCreator, PostWithCreator } from '@momento/shared';

interface SearchResults {
  creators: PublicCreator[];
  posts: PostWithCreator[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useSearch(query: string, type: 'all' | 'creators' | 'posts' = 'all') {
  const debouncedQuery = useDebounce(query.trim(), 300);

  const searchQuery = useQuery<SearchResults>({
    queryKey: ['search', debouncedQuery, type],
    queryFn: () =>
      apiService.get<SearchResults>('/search', {
        q: debouncedQuery,
        type,
      }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  return {
    results: searchQuery.data ?? { creators: [], posts: [] },
    isSearching: searchQuery.isFetching,
    isActive: debouncedQuery.length >= 2,
  };
}
