import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useOnramp, OnrampProvider, OnrampCoin } from '@/hooks/useOnramp';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface FundWalletModalProps {
  visible: boolean;
  onClose: () => void;
  provider?: OnrampProvider;
  coin?: OnrampCoin;
}

export function FundWalletModal({
  visible,
  onClose,
  provider = 'transak',
  coin = 'USDC',
}: FundWalletModalProps) {
  const { data, isLoading, error } = useOnramp(provider, coin, visible);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const handleClose = useCallback(() => {
    setWebViewLoading(true);
    onClose();
  }, [onClose]);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      // Detect completion URLs from providers
      const url = navState.url.toLowerCase();
      if (
        url.includes('transak.com/complete') ||
        url.includes('status=completed')
      ) {
        // Transaction completed — close after a brief delay so user sees success
        setTimeout(handleClose, 2000);
      }
    },
    [handleClose]
  );

  const providerLabel = provider === 'moonpay' ? 'MoonPay' : 'Transak';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Buy {coin}</Text>
            <Text style={styles.headerSubtitle}>via {providerLabel}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Powered by {providerLabel}. {coin} will be sent directly to your Solana wallet.
          </Text>
        </View>

        {/* WebView or Loading/Error State */}
        <View style={styles.webViewContainer}>
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Preparing checkout...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color={COLORS.error} />
              <Text style={styles.errorTitle}>Unable to load</Text>
              <Text style={styles.errorText}>
                {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
              </Text>
              <Pressable onPress={handleClose} style={styles.retryButton}>
                <Text style={styles.retryText}>Close</Text>
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
      </View>
    </Modal>
  );
}

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
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADII.full,
    backgroundColor: COLORS.backgroundTertiary,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
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
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    zIndex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  errorTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    marginTop: SPACING.md,
  },
  retryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
});
