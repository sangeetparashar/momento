import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import type { User, KycApplicationResponse } from '@momento/shared';
import { KycStatus } from '@momento/shared';
import { apiService } from '@/services/api';

interface KycApplicationPayload {
  firstName?: string;
  lastName?: string;
}

/**
 * Submit a KYC / creator application. Optimistically sets the user's
 * KYC status to PENDING. Guards against re-application when already
 * PENDING or VERIFIED — shows info alert instead.
 */
export function useKyc() {
  const queryClient = useQueryClient();

  return useMutation<KycApplicationResponse, Error, KycApplicationPayload>({
    mutationFn: (payload) => {
      // Guard at mutation level — prevent API call if already applied
      const cached = queryClient.getQueryData<User>(['userProfile']);
      const status = cached?.kycStatus;
      if (status === KycStatus.PENDING) {
        Alert.alert(
          'Verification In Progress',
          'Our admins will review your profile and verify your account to become a creator. This usually takes 24-48 hours.'
        );
        return Promise.reject({ __skipped: true });
      }
      if (status === KycStatus.VERIFIED) {
        Alert.alert(
          "You're Verified!",
          'Your account has been verified. You have full creator access.'
        );
        return Promise.reject({ __skipped: true });
      }
      return apiService.post<KycApplicationResponse>('/creators/apply', payload);
    },

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['userProfile'] });

      const previous = queryClient.getQueryData<User>(['userProfile']);

      if (previous) {
        queryClient.setQueryData<User>(['userProfile'], {
          ...previous,
          kycStatus: KycStatus.PENDING,
        });
      }

      return { previous };
    },

    onError: (err: any, _vars, context) => {
      // Don't show error or rollback for intentionally skipped mutations
      if (err?.__skipped) return;

      const ctx = context as { previous?: User } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(['userProfile'], ctx.previous);
      }
      // Show user-friendly error for rate limit
      const status = err?.status ?? err?.body?.status;
      if (status === 429) {
        Alert.alert('Please Wait', 'You can only apply once per hour. Please try again later.');
      } else {
        Alert.alert('Error', err?.body?.error || 'Failed to submit application. Please try again.');
      }
    },

    onSettled: (_data, err) => {
      if (err?.__skipped) return;
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },

    onSuccess: async (data) => {
      if (data.verificationUrl) {
        await WebBrowser.openBrowserAsync(data.verificationUrl);
      }
    },
  });
}
