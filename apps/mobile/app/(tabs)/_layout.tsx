import React, { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/styles/theme';

/**
 * Animated tab bar button with subtle scale feedback on press.
 * Uses React Native's built-in Animated API (no reanimated/worklets dependency).
 */
let tabPressCount = 0;

function AnimatedTabButton(props: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const { onPressIn, onPressOut, style, children, ...rest } = props;
  const scale = useRef(new Animated.Value(1)).current;
  const lastTapRef = useRef(0);

  const handlePressIn = useCallback(
    (event: any) => {
      if (__DEV__) {
        const now = Date.now();
        const gap = lastTapRef.current ? now - lastTapRef.current : 0;
        lastTapRef.current = now;
        tabPressCount++;
        console.log(`[TAP] TabBar/tab#${tabPressCount} (gap: ${gap || 'first'}ms)`);
      }
      Animated.timing(scale, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }).start();
      onPressIn?.(event);
    },
    [onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: any) => {
      Animated.spring(scale, {
        toValue: 1,
        damping: 15,
        stiffness: 150,
        useNativeDriver: true,
      }).start();
      onPressOut?.(event);
    },
    [onPressOut, scale]
  );

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style as ViewStyle, { alignItems: 'center', justifyContent: 'center' }]}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
          height: 64 + bottomPadding,
          paddingTop: 10,
          paddingBottom: bottomPadding,
        },
        tabBarShowLabel: false,
        // #006: lean into the brand green for the active tab (was white) and
        // brighten the inactive icons (#666 read as nearly invisible on black).
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
        animation: 'none',
        sceneStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="globe" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={28} color={color} />
          ),
        }}
      />
      {/* Hide wallet from tab bar — it's accessed via profile dashboard, not as a tab */}
      <Tabs.Screen
        name="wallet"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
