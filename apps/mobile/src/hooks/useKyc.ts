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
 * KYC status to PENDING.
 */
export function useKyc() {
  const queryClient = useQueryClient();

  return useMutation<KycApplicationResponse, Error, KycApplicationPayload>({
    mutationFn: (payload) =>
      apiService.post<KycApplicationResponse>('/creators/apply', payload),

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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },

    onSuccess: async (data) => {
      if (data.verificationUrl) {
        await WebBrowser.openBrowserAsync(data.verificationUrl);
      }
    },
  });
}
