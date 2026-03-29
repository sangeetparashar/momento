import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = '@momento/onboarding';

/** Current user ID — set via setOnboardingUser() when auth state changes. */
let currentUserId: string | null = null;

function getStorageKey(): string {
  return currentUserId
    ? `${STORAGE_KEY_PREFIX}/${currentUserId}`
    : STORAGE_KEY_PREFIX;
}

/**
 * Call this when the authenticated user changes (login/logout).
 * This ensures onboarding state is scoped per-user.
 */
export function setOnboardingUser(userId: string | null): void {
  currentUserId = userId;
}

export interface OnboardingState {
  dismissedHints: string[];
  hasSeenFundingScreen: boolean;
  hasCompletedProfileSetup: boolean;
  completedAt?: string;
}

const DEFAULT_STATE: OnboardingState = {
  dismissedHints: [],
  hasSeenFundingScreen: false,
  hasCompletedProfileSetup: false,
};

export async function getOnboardingState(): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey());
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: OnboardingState): Promise<void> {
  await AsyncStorage.setItem(getStorageKey(), JSON.stringify(state));
}

export async function dismissHint(hintId: string): Promise<void> {
  const state = await getOnboardingState();
  if (!state.dismissedHints.includes(hintId)) {
    state.dismissedHints.push(hintId);
    await saveState(state);
  }
}

export async function isHintDismissed(hintId: string): Promise<boolean> {
  const state = await getOnboardingState();
  return state.dismissedHints.includes(hintId);
}

export async function markProfileSetupComplete(): Promise<void> {
  const state = await getOnboardingState();
  state.hasCompletedProfileSetup = true;
  await saveState(state);
}

export async function markFundingScreenSeen(): Promise<void> {
  const state = await getOnboardingState();
  state.hasSeenFundingScreen = true;
  await saveState(state);
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey());
}
