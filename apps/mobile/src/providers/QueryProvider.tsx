import React, { useEffect, useRef } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes — keep more data in memory for smoother navigation
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'momento-query-cache',
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        buster: 'v3',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist settled (success) queries — never persist pending/error
            if (query.state.status !== 'success') return false;
            const key = String(query.queryKey[0]);
            return ['feed', 'userProfile', 'creator', 'creators', 'walletBalance'].includes(key);
          },
        },
      }}
      onError={() => {
        // Corrupted cache causes "promise.then is not a function" during restore.
        // Nuke the persisted cache so the next launch starts clean.
        asyncStoragePersister.removeClient();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export { queryClient };

/**
 * Clears all cached query data and persisted storage when userId changes.
 * Place this component INSIDE the auth provider tree so it has access to the current user.
 * Prevents stale data from the previous user flashing on screen after a login switch.
 */
export function QueryCacheCleaner({ userId }: { userId?: string | null }) {
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Skip the first render (mount) — only clear on actual user changes
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = userId ?? null;
      return;
    }

    const prev = prevUserIdRef.current;
    const current = userId ?? null;

    if (prev !== current) {
      console.log(`[QueryCacheCleaner] User changed ${prev} → ${current}, clearing cache`);
      qc.clear();
      try { asyncStoragePersister.removeClient(); } catch { /* noop */ }
    }

    prevUserIdRef.current = current;
  }, [userId, qc]);

  return null;
}
