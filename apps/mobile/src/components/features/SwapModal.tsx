import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { ComingSoonModal } from './ComingSoonModal';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface SwapModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TokenSelection {
  symbol: string;
  name: string;
  balance: string;
}

const DEFAULT_SELL_TOKEN: TokenSelection = {
  symbol: 'SOL',
  name: 'Solana',
  balance: '0.00',
};

const DEFAULT_BUY_TOKEN: TokenSelection = {
  symbol: 'USDC',
  name: 'USD Coin',
  balance: '0.00',
};

export function SwapModal({ visible, onClose }: SwapModalProps) {
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellToken] = useState<TokenSelection>(DEFAULT_SELL_TOKEN);
  const [buyToken] = useState<TokenSelection>(DEFAULT_BUY_TOKEN);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleSwapPress = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  const handleSellAmountChange = useCallback((text: string) => {
    setSellAmount(text);
    const num = parseFloat(text);
    if (!isNaN(num)) {
      setBuyAmount((num * 150.25).toFixed(2));
    } else {
      setBuyAmount('');
    }
  }, []);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.handle} />
              <Text style={styles.title}>Swap</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            {/* SELL Section */}
            <View style={styles.tokenSection}>
              <Text style={styles.sectionLabel}>SELL</Text>
              <View style={styles.tokenRow}>
                <Pressable style={styles.tokenSelector}>
                  <View style={styles.tokenIcon}>
                    <Text style={styles.tokenIconText}>
                      {sellToken.symbol.charAt(0)}
                    </Text>
                  </View>
                  <Text style={styles.tokenSymbol}>{sellToken.symbol}</Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
                <TextInput
                  style={styles.amountInput}
                  value={sellAmount}
                  onChangeText={handleSellAmountChange}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.balanceText}>
                Balance: {sellToken.balance} {sellToken.symbol}
              </Text>
            </View>

            {/* Swap Icon */}
            <View style={styles.swapIconContainer}>
              <Pressable style={styles.swapIconButton}>
                <Ionicons
                  name="swap-vertical"
                  size={24}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>

            {/* BUY Section */}
            <View style={styles.tokenSection}>
              <Text style={styles.sectionLabel}>BUY</Text>
              <View style={styles.tokenRow}>
                <Pressable style={styles.tokenSelector}>
                  <View style={[styles.tokenIcon, styles.buyTokenIcon]}>
                    <Text style={styles.tokenIconText}>
                      {buyToken.symbol.charAt(0)}
                    </Text>
                  </View>
                  <Text style={styles.tokenSymbol}>{buyToken.symbol}</Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
                <TextInput
                  style={styles.amountInput}
                  value={buyAmount}
                  onChangeText={setBuyAmount}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="decimal-pad"
                  editable={false}
                />
              </View>
              <Text style={styles.balanceText}>
                Balance: {buyToken.balance} {buyToken.symbol}
              </Text>
            </View>

            {/* Swap Button */}
            <Pressable
              onPress={handleSwapPress}
              style={[
                styles.swapButton,
                !sellAmount && styles.swapButtonDisabled,
              ]}
            >
              <Text style={styles.swapButtonText}>SWAP</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Swap Coming Soon!"
        message="Token swaps will be available in the next update. Stay tuned!"
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl + 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: SPACING.md,
    padding: SPACING.xs,
  },
  tokenSection: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
  },
  tokenIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9945FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyTokenIcon: {
    backgroundColor: '#2775CA',
  },
  tokenIconText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  tokenSymbol: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  amountInput: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.md,
    padding: 0,
  },
  balanceText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
  swapIconContainer: {
    alignItems: 'center',
    zIndex: 1,
    marginVertical: -SPACING.sm,
  },
  swapIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  swapButtonDisabled: {
    opacity: 0.5,
  },
  swapButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 18,
  },
});
