import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@momento/onboarding';

export interface OnboardingState {
  dismissedHints: string[];
  hasSeenFundingScreen: boolean;
  completedAt?: string;
}

const DEFAULT_STATE: OnboardingState = {
  dismissedHints: [],
  hasSeenFundingScreen: false,
};

export async function getOnboardingState(): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: OnboardingState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

export async function markFundingScreenSeen(): Promise<void> {
  const state = await getOnboardingState();
  state.hasSeenFundingScreen = true;
  await saveState(state);
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
