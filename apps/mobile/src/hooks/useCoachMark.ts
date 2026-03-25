import { useState, useEffect, useCallback } from 'react';
import { isHintDismissed, dismissHint } from '@/services/onboardingStorage';

/**
 * Hook to manage a single coach mark's visibility.
 * Reads dismiss state from AsyncStorage on mount and caches in memory.
 */
export function useCoachMark(hintId: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    isHintDismissed(hintId).then((dismissed) => {
      if (mounted && !dismissed) setVisible(true);
    });
    return () => { mounted = false; };
  }, [hintId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    dismissHint(hintId);
  }, [hintId]);

  return { visible, dismiss };
}
