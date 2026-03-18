import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import type { User } from '@momento/shared';
import { KycStatus } from '@momento/shared';
import { apiService } from '@/services/api';

interface KycApplicationPayload {
  /** Optional first name for Veriff KYC verification. */
  firstName?: string;
  /** Optional last name for Veriff KYC verification. */
  lastName?: string;
  /** Creator's desired token symbol (3-5 chars). */
  tokenSymbol?: string;
  /** Brief pitch or reason for applying as a creator. */
  applicationText?: string;
  /** Optional social proof links. */
  socialLinks?: {
    youtube?: string;
    instagram?: string;
    twitter?: string;
    spotify?: string;
    soundcloud?: string;
    tiktok?: string;
    website?: string;
  };
}

interface KycApplicationResponse {
  status: string;
  verificationUrl?: string;
  sessionId?: string;
  message?: string;
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

    onError: (_err, _vars, context) => {
      if (context && 'previous' in context) {
        queryClient.setQueryData(
          ['userProfile'],
          (context as { previous: User }).previous,
        );
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
