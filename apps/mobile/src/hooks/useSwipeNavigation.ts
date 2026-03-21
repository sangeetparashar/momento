import { useRef, useCallback } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Screen order for swipe navigation.
 * Home is included for index positioning but should NOT use this hook.
 */
const SCREEN_ORDER = [
  '/(tabs)/home',
  '/(tabs)/explore',
  '/(tabs)/profile',
  '/wallet',
] as const;

const SWIPE_THRESHOLD = 80;

interface SwipeNavigationOptions {
  currentScreen: string;
}

/**
 * Hook for swipe-to-navigate between screens with slide animation.
 *
 * Returns:
 * - `translateX`: Animated.Value to apply as a translateX transform on the screen wrapper
 * - `onTouchStart` / `onTouchEnd`: attach to the outermost View
 *
 * The gesture is tracked via simple touch start/end (no PanResponder) to avoid
 * conflicting with ScrollViews, FlatLists, and sub-tab swiping.
 * Only triggers on fast, decisive horizontal swipes from the screen edges.
 */
export function useSwipeNavigation({ currentScreen }: SwipeNavigationOptions) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const currentIndex = SCREEN_ORDER.findIndex(
    (s) => currentScreen === s || s.endsWith(currentScreen)
  );

  const navigateTo = useCallback(
    (target: string, direction: 'left' | 'right') => {
      // Animate slide out
      Animated.timing(translateX, {
        toValue: direction === 'left' ? -width : width,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Navigate
        if (target.startsWith('/(tabs)')) {
          router.navigate(target as any);
        } else {
          router.push(target as any);
        }
        // Reset position instantly for when user comes back
        translateX.setValue(0);
      });
    },
    [router, translateX, width]
  );

  const onTouchStart = useCallback(
    (e: any) => {
      const touch = e.nativeEvent;
      touchStart.current = {
        x: touch.pageX,
        y: touch.pageY,
        time: Date.now(),
      };
    },
    []
  );

  const onTouchEnd = useCallback(
    (e: any) => {
      if (!touchStart.current) return;
      const touch = e.nativeEvent;
      const dx = touch.pageX - touchStart.current.x;
      const dy = touch.pageY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      touchStart.current = null;

      // Must be a fast, horizontal swipe
      if (dt > 400) return; // too slow
      if (Math.abs(dx) < SWIPE_THRESHOLD) return; // too short
      if (Math.abs(dy) > Math.abs(dx) * 0.6) return; // too vertical

      if (dx < 0 && currentIndex < SCREEN_ORDER.length - 1) {
        // Swipe left → go forward
        navigateTo(SCREEN_ORDER[currentIndex + 1], 'left');
      } else if (dx > 0 && currentIndex > 0) {
        // Swipe right → go backward
        navigateTo(SCREEN_ORDER[currentIndex - 1], 'right');
      }
    },
    [currentIndex, navigateTo]
  );

  return {
    translateX,
    onTouchStart,
    onTouchEnd,
  };
}
