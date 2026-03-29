/**
 * Lightweight press diagnostics logger.
 * Logs button taps with timestamps, screen, and button ID to help debug
 * multi-click / unresponsive button issues on device.
 *
 * Usage:
 *   const logPress = usePressLogger('WalletScreen');
 *   <Pressable onPress={() => { logPress('FUND_ACCOUNT'); handleBuyCrypto(); }}>
 *
 * Remove or disable in production by setting __DEV__ check.
 */

import { useCallback, useRef } from 'react';

interface PressEvent {
  screen: string;
  button: string;
  timestamp: number;
  timeSinceLastPress: number | null;
}

// Keep a rolling buffer of recent presses for debugging
const recentPresses: PressEvent[] = [];
const MAX_BUFFER = 50;

export function usePressLogger(screen: string) {
  const lastPressRef = useRef<number>(0);

  const logPress = useCallback(
    (button: string) => {
      if (!__DEV__) return;

      const now = Date.now();
      const timeSinceLastPress = lastPressRef.current
        ? now - lastPressRef.current
        : null;
      lastPressRef.current = now;

      const event: PressEvent = {
        screen,
        button,
        timestamp: now,
        timeSinceLastPress,
      };

      recentPresses.push(event);
      if (recentPresses.length > MAX_BUFFER) recentPresses.shift();

      const gap = timeSinceLastPress != null ? `${timeSinceLastPress}ms` : 'first';
      console.log(`[TAP] ${screen}/${button} (gap: ${gap})`);

      // Warn if rapid repeated taps on same button (potential multi-click issue)
      if (timeSinceLastPress != null && timeSinceLastPress < 300) {
        console.warn(
          `[TAP] Rapid re-tap detected: ${screen}/${button} after ${timeSinceLastPress}ms — possible unresponsive button`
        );
      }
    },
    [screen]
  );

  return logPress;
}

/** Get recent press log for debugging */
export function getRecentPresses(): PressEvent[] {
  return [...recentPresses];
}
