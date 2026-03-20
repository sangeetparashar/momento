import { useUserProfile } from './useUserProfile';

/**
 * Returns whether the user's profile is "complete" enough
 * (has username, avatar, and at least one social link).
 */
export function useProfileComplete() {
  const { user, isLoading } = useUserProfile();

  if (isLoading || !user) {
    return { isComplete: false, isLoading: true, user };
  }

  const hasUsername = !!user.username && user.username.length >= 3;
  const hasAvatar = !!user.avatarUrl;
  const hasSocial =
    user.socialLinks &&
    typeof user.socialLinks === 'object' &&
    Object.values(user.socialLinks as Record<string, string>).some(
      (v) => typeof v === 'string' && v.trim().length > 0,
    );

  return {
    isComplete: hasUsername && hasAvatar && hasSocial,
    isLoading: false,
    user,
  };
}
