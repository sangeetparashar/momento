import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/styles/theme';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/**
 * Animated tab bar button with subtle scale feedback on press.
 * Replaces the default tab bar button for a more premium feel.
 */
function AnimatedTabButton(props: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const { onPressIn, onPressOut, style, children, ...rest } = props;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (event: any) => {
      scale.value = withTiming(0.85, { duration: 80 });
      onPressIn?.(event);
    },
    [onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: any) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      onPressOut?.(event);
    },
    [onPressOut, scale]
  );

  return (
    <AnimatedPressableBase
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
          height: 85,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
        animation: 'fade',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="globe" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
