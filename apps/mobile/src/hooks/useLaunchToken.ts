import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { launchToken } from '@/services/tokenApi';
import type { LaunchTokenRequest, LaunchTokenResponse } from '@/services/tokenApi.types';
import type { ApiError } from '@/services/api';

/**
 * Launch a token. Default backend path is SERVER-SIGNED (returns landed
 * signatures — no client signing). Invalidates the user profile + creator
 * queries on success so the new token surfaces in the profile dashboard.
 *
 * Note: the alt creator-as-poolCreator path returns `transaction` with
 * status 'DEPLOYING'; callers that opt into it must sign-and-send it
 * themselves via useClientSignSubmit. 3B default does not require that.
 */
export function useLaunchToken(): UseMutationResult<
  LaunchTokenResponse,
  ApiError,
  LaunchTokenRequest
> {
  const queryClient = useQueryClient();

  return useMutation<LaunchTokenResponse, ApiError, LaunchTokenRequest>({
    mutationFn: (body) => launchToken(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['creator'] });
    },
  });
}
