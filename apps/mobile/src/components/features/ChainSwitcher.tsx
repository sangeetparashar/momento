import React, { useState } from 'react';
import { View, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';
import type { ChainType } from '@momento/shared';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

/**
 * Dropdown component that displays the currently selected chain and lets the
 * user switch between any chains they have wallets for.
 *
 * - With a single available chain: shows just the chain name + colored dot
 *   (no chevron, not tappable).
 * - With multiple chains: tappable, opens a modal listing each chain.
 */
export function ChainSwitcher() {
  const { chain, setChain, availableChains } = useChain();
  const [showDropdown, setShowDropdown] = useState(false);

  // Single-chain users: render a static label.
  if (availableChains.length <= 1) {
    return (
      <View style={styles.singleChain}>
        <View
          style={[
            styles.chainDot,
            { backgroundColor: CHAIN_CONFIG[chain].iconColor },
          ]}
        />
        <Text style={styles.chainName}>{CHAIN_CONFIG[chain].name}</Text>
      </View>
    );
  }

  const handleSelect = (selected: ChainType) => {
    setChain(selected);
    setShowDropdown(false);
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setShowDropdown(true)}
        style={styles.selector}
        hitSlop={8}
      >
        <View
          style={[
            styles.chainDot,
            { backgroundColor: CHAIN_CONFIG[chain].iconColor },
          ]}
        />
        <Text style={styles.chainName}>{CHAIN_CONFIG[chain].name}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
      </Pressable>

      <Modal
        visible={showDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdown(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowDropdown(false)}
        >
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>SELECT NETWORK</Text>
            {availableChains.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.dropdownItem,
                  c === chain && styles.dropdownItemActive,
                ]}
                onPress={() => handleSelect(c)}
              >
                <View
                  style={[
                    styles.chainDot,
                    { backgroundColor: CHAIN_CONFIG[c].iconColor },
                  ]}
                />
                <View style={styles.dropdownItemText}>
                  <Text style={styles.dropdownItemName}>
                    {CHAIN_CONFIG[c].name}
                  </Text>
                  <Text style={styles.dropdownItemSymbol}>
                    {CHAIN_CONFIG[c].symbol} network
                  </Text>
                </View>
                {c === chain && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  singleChain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chainDot: {
    width: 10,
    height: 10,
    borderRadius: RADII.full,
  },
  chainName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.md,
    fontSize: 11,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.xs,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primary + '15',
  },
  dropdownItemText: {
    flex: 1,
  },
  dropdownItemName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  dropdownItemSymbol: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 12,
  },
});
