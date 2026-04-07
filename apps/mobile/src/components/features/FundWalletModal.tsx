import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Share,
  ScrollView,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useOnramp } from '@/hooks/useOnramp';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { useChain } from '@/hooks/useChain';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { ENV } from '@/config/env';
import { CHAIN_CONFIG } from '@momento/shared';
import type { ChainType, OnrampProvider } from '@momento/shared';

type FundingMethod = 'picker' | OnrampProvider | 'onchain';

const HEADER_TITLES: Record<FundingMethod, string> = {
  picker: 'Fund Your Account',
  ramp: 'Buy USDC via Ramp',
  moonpay: 'Buy USDC via MoonPay',
  transak: 'Buy USDC via Transak',
  onchain: 'Transfer from Wallet',
};

interface FundWalletModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FundWalletModal({ visible, onClose }: FundWalletModalProps) {
  const insets = useSafeAreaInsets();
  const { chain } = useChain() as { chain: 'solana' | 'base' };
  const [method, setMethod] = useState<FundingMethod>('picker');

  const handleClose = useCallback(() => {
    setMethod('picker');
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    setMethod('picker');
  }, []);

  const isWebView = method === 'ramp' || method === 'moonpay' || method === 'transak';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          {method !== 'picker' ? (
            <Pressable onPress={handleBack} hitSlop={12} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
            </Pressable>
          ) : (
            <Pressable onPress={handleClose} hitSlop={12} style={styles.headerButton}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{HEADER_TITLES[method]}</Text>
          {method !== 'picker' ? (
            <Pressable onPress={handleClose} hitSlop={12} style={styles.headerButton}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        {method === 'picker' && <MethodPicker chain={chain} onSelect={setMethod} />}
        {isWebView && (
          <OnrampWebView
            provider={method as OnrampProvider}
            chain={chain}
            onClose={handleClose}
          />
        )}
        {method === 'onchain' && <OnChainTransfer chain={chain} />}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Method Picker
// ---------------------------------------------------------------------------

function MethodPicker({
  chain,
  onSelect,
}: {
  chain: ChainType;
  onSelect: (m: FundingMethod) => void;
}) {
  const chainName = CHAIN_CONFIG[chain].name;
  return (
    <ScrollView style={styles.pickerContainer} contentContainerStyle={styles.pickerContent}>
      <Text style={styles.pickerSubtitle}>
        Choose how you'd like to add USDC to your {chainName} wallet
      </Text>

      <Pressable style={styles.methodCard} onPress={() => onSelect('transak')}>
        <View style={[styles.methodIcon, { backgroundColor: '#4643E8' }]}>
          <Ionicons name="logo-usd" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.methodInfo}>
          <View style={styles.methodTitleRow}>
            <Text style={styles.methodTitle}>Transak</Text>
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedText}>RECOMMENDED</Text>
            </View>
          </View>
          <Text style={styles.methodDesc}>
            Apple Pay, Google Pay, card, or bank transfer. Lite KYC available.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
      </Pressable>

      <Pressable style={styles.methodCard} onPress={() => onSelect('onchain')}>
        <View
          style={[
            styles.methodIcon,
            { backgroundColor: CHAIN_CONFIG[chain].iconColor },
          ]}
        >
          <Ionicons name="wallet" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodTitle}>Transfer from Wallet</Text>
          <Text style={styles.methodDesc}>
            {chain === 'base'
              ? 'Send ETH or USDC from Coinbase, MetaMask, or any Base-compatible wallet'
              : 'Send SOL or USDC from Phantom, Solflare, or any Solana wallet'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
      </Pressable>

      <Pressable style={[styles.methodCard, styles.methodCardDisabled]} onPress={() => onSelect('ramp')}>
        <View style={[styles.methodIcon, { backgroundColor: '#21BF73' }]}>
          <Ionicons name="flash" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.methodInfo}>
          <View style={styles.methodTitleRow}>
            <Text style={styles.methodTitle}>Ramp</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
          </View>
          <Text style={styles.methodDesc}>
            Apple Pay, Google Pay, card, or bank transfer. Lowest fees.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
      </Pressable>

      <Pressable style={[styles.methodCard, styles.methodCardDisabled]} onPress={() => onSelect('moonpay')}>
        <View style={[styles.methodIcon, { backgroundColor: '#7B61FF' }]}>
          <Ionicons name="card" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.methodInfo}>
          <View style={styles.methodTitleRow}>
            <Text style={styles.methodTitle}>MoonPay</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
          </View>
          <Text style={styles.methodDesc}>
            Apple Pay, Google Pay, PayPal, Venmo, card, or bank transfer
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
      </Pressable>

      <View style={styles.pickerFooter}>
        <Ionicons name="shield-checkmark" size={14} color={COLORS.textTertiary} />
        <Text style={styles.pickerFooterText}>
          All purchases deliver USDC on the {chainName} network directly to your wallet. Third-party providers may charge a small fee.
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Onramp WebView (Ramp, MoonPay, or Transak)
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<OnrampProvider, string> = {
  ramp: 'Ramp',
  moonpay: 'MoonPay',
  transak: 'Transak',
};

function OnrampWebView({
  provider,
  chain,
  onClose,
}: {
  provider: OnrampProvider;
  chain: ChainType;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useOnramp({ provider, chain, enabled: true });
  const [webViewLoading, setWebViewLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url.toLowerCase();
      if (
        url.includes('transak.com/complete') ||
        url.includes('status=completed') ||
        url.includes('moonpay.com/transaction_receipt') ||
        url.includes('rampnetwork.com/success')
      ) {
        setTimeout(onClose, 2000);
      }
    },
    [onClose]
  );

  const label = PROVIDER_LABELS[provider];

  return (
    <>
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
        <Text style={styles.infoText}>
          Powered by {label}. USDC on {CHAIN_CONFIG[chain].name} will be sent directly to your wallet.
        </Text>
      </View>

      <View style={styles.webViewContainer}>
        {isLoading && (
          <View style={styles.centeredContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.centeredText}>Preparing checkout...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centeredContainer}>
            <Ionicons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorTitle}>Unable to load</Text>
            <Text style={styles.centeredText}>
              {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
            </Text>
            <Pressable onPress={onClose} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Close</Text>
            </Pressable>
          </View>
        )}

        {data?.url && !error && (
          <>
            {webViewLoading && (
              <View style={styles.webViewOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: data.url }}
              style={styles.webView}
              onLoadEnd={() => setWebViewLoading(false)}
              onNavigationStateChange={handleNavigationStateChange}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState={false}
              scalesPageToFit
              allowsInlineMediaPlayback
              mediaCapturePermissionGrantType="grant"
              originWhitelist={['*']}
            />
          </>
        )}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// On-Chain Transfer
// ---------------------------------------------------------------------------

function OnChainTransfer({ chain }: { chain: ChainType }) {
  const auth = useAuth();
  const { walletAddress: clientWalletAddress, ethWalletAddress } = auth;
  const { user: profile } = useUserProfile();
  const [copied, setCopied] = useState(false);

  const solAddress =
    clientWalletAddress ||
    (profile?.walletAddress && !profile.walletAddress.startsWith('pending-')
      ? profile.walletAddress
      : null);

  const walletAddress = chain === 'base' ? ethWalletAddress : solAddress;

  const chainName = CHAIN_CONFIG[chain].name;
  const network =
    chain === 'base'
      ? 'mainnet'
      : ENV.SOLANA_NETWORK === 'devnet'
      ? 'devnet'
      : 'mainnet';

  const handleCopy = useCallback(async () => {
    if (!walletAddress) return;
    try {
      // Use Share API as clipboard — avoids expo-clipboard native module dependency
      await Share.share({ message: walletAddress, title: 'Wallet Address' });
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [walletAddress]);

  const handleShare = useCallback(async () => {
    if (!walletAddress) return;
    try {
      await Share.share({
        message: walletAddress,
        title: `My ${chainName} Wallet Address`,
      });
    } catch {
      // cancelled
    }
  }, [walletAddress, chainName]);

  if (!walletAddress) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centeredText}>Loading wallet address...</Text>
      </View>
    );
  }

  const instructions =
    chain === 'base'
      ? [
          'Copy your wallet address above',
          'Open Coinbase, MetaMask, or any ETH wallet',
          'Select the Base network and send ETH or USDC',
          'Funds arrive in ~1 minute',
        ]
      : [
          'Copy your wallet address above',
          'Open Phantom, Solflare, or any Solana wallet',
          'Send SOL or USDC to the address above',
          'Your balance will update automatically',
        ];

  return (
    <ScrollView style={styles.onchainContainer} contentContainerStyle={styles.onchainContent}>
      <View style={styles.onchainCard}>
        <Text style={styles.onchainLabel}>
          YOUR {chainName.toUpperCase()} WALLET ADDRESS
        </Text>

        <View style={styles.addressBox}>
          <Text style={styles.onchainAddress} selectable>
            {walletAddress}
          </Text>
        </View>

        <View style={styles.onchainActions}>
          <Pressable
            style={[styles.onchainButton, copied && styles.onchainButtonSuccess]}
            onPress={handleCopy}
          >
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy'}
              size={20}
              color={COLORS.background}
            />
            <Text style={styles.onchainButtonText}>
              {copied ? 'Copied!' : 'Copy Address'}
            </Text>
          </Pressable>

          <Pressable style={styles.onchainButtonSecondary} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={COLORS.textPrimary} />
            <Text style={styles.onchainButtonSecondaryText}>Share</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.onchainInstructions}>
        <Text style={styles.instructionTitle}>How to transfer</Text>

        {instructions.map((instr, idx) => (
          <View key={idx} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{idx + 1}</Text>
            </View>
            <Text style={styles.stepText}>{instr}</Text>
          </View>
        ))}
      </View>

      <View style={styles.networkBanner}>
        <Ionicons name="information-circle" size={16} color={COLORS.warning} />
        <Text style={styles.networkBannerText}>
          {chain === 'base'
            ? 'Make sure to send on the Base network. Sending on other networks (Ethereum, Polygon, etc.) may result in lost funds.'
            : `Make sure to send on the Solana ${network} network. Sending on the wrong network may result in lost funds.`}
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADII.full,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },

  // Method Picker
  pickerContainer: {
    flex: 1,
  },
  pickerContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  pickerSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: RADII.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: SPACING.md,
    marginRight: SPACING.sm,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 2,
  },
  methodTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: 2,
  },
  methodDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  recommendedBadge: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.sm,
    marginBottom: 2,
  },
  recommendedText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  methodCardDisabled: {
    opacity: 0.5,
  },
  comingSoonBadge: {
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.sm,
    marginBottom: 2,
  },
  comingSoonText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  pickerFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xs,
    gap: SPACING.sm,
  },
  pickerFooterText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    flex: 1,
    lineHeight: 18,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  infoText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: 12,
  },

  // WebView
  webViewContainer: { flex: 1 },
  webView: { flex: 1, backgroundColor: COLORS.background },
  webViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    zIndex: 1,
  },

  // Shared centered states
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  centeredText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  actionButton: {
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    marginTop: SPACING.md,
  },
  actionButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },

  // On-Chain Transfer
  onchainContainer: { flex: 1 },
  onchainContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  onchainCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  onchainLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    marginBottom: SPACING.sm,
  },
  addressBox: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  onchainAddress: {
    ...TYPOGRAPHY.mono,
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  onchainActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  onchainButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.full,
    gap: SPACING.xs,
  },
  onchainButtonSuccess: { backgroundColor: COLORS.success },
  onchainButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 15,
  },
  onchainButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundTertiary,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.full,
    gap: SPACING.xs,
  },
  onchainButtonSecondaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },

  // Instructions
  onchainInstructions: { marginTop: SPACING.xl },
  instructionTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '700',
  },
  stepText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    flex: 1,
  },

  // Network warning
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  networkBannerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
