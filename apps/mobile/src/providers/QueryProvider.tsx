import React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 2 * 60 * 1000, // 2 minutes — aggressively reclaim memory on mobile
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
        buster: 'v2',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist feed, profile, and creator queries
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
