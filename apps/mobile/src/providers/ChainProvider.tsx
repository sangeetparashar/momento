import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChainType } from '@momento/shared';

interface ChainContextValue {
  /** Currently selected chain */
  chain: ChainType;
  /** Switch to a different chain (persists to AsyncStorage) */
  setChain: (chain: ChainType) => void;
  /** Chains available to this user (both for OAuth, single for external wallet) */
  availableChains: ChainType[];
  /** Set available chains (called by useAuth when wallet status is known) */
  setAvailableChains: (chains: ChainType[]) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: 'solana',
  setChain: () => {},
  availableChains: ['solana'],
  setAvailableChains: () => {},
});

const CHAIN_STORAGE_KEY = 'momento_selected_chain';

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [chain, setChainState] = useState<ChainType>('solana');
  const [availableChains, setAvailableChainsState] = useState<ChainType[]>(['solana']);

  // Load persisted chain preference on mount
  useEffect(() => {
    AsyncStorage.getItem(CHAIN_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'solana' || stored === 'base') {
          setChainState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setChain = useCallback((newChain: ChainType) => {
    setChainState(newChain);
    AsyncStorage.setItem(CHAIN_STORAGE_KEY, newChain).catch(() => {});
  }, []);

  const setAvailableChains = useCallback((chains: ChainType[]) => {
    setAvailableChainsState((prev) => {
      // Avoid unnecessary state updates if chains are identical
      if (prev.length === chains.length && prev.every((c, i) => c === chains[i])) {
        return prev;
      }
      return chains;
    });
  }, []);

  // If selected chain is not available, switch to first available
  useEffect(() => {
    if (availableChains.length > 0 && !availableChains.includes(chain)) {
      setChain(availableChains[0]);
    }
  }, [availableChains, chain, setChain]);

  return (
    <ChainContext.Provider value={{ chain, setChain, availableChains, setAvailableChains }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  return useContext(ChainContext);
}
