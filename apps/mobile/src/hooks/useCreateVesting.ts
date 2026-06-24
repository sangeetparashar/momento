import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { createVesting } from '@/services/tokenApi';
import type { VestingCreateRequest, VestingCreateResponse } from '@/services/tokenApi.types';
import type { ApiError } from '@/services/api';

/**
 * Create a vesting/lock schedule. §d.7 returns a `signMode` discriminator:
 *  - 'server': the backend already signed and set createSignature/status=ACTIVE.
 *  - 'client': a fallback that returns an unsigned tx and leaves the row PENDING
 *    until the app self-submits AND logs. Phase 3B has no log endpoint, so this
 *    path is unsupported and rejected (see mutationFn) rather than silently
 *    stranding a PENDING row.
 *
 * Invalidates the vesting list on success.
 */
export function useCreateVesting(): UseMutationResult<
  VestingCreateResponse,
  ApiError,
  VestingCreateRequest
> {
  const queryClient = useQueryClient();

  return useMutation<VestingCreateResponse, ApiError, VestingCreateRequest>({
    mutationFn: async (body) => {
      const res = await createVesting(body);

      // §d.7: the supported path is signMode==='server' — the backend submits and
      // sets createSignature + status=ACTIVE. The 'client' fallback would leave the
      // row PENDING until the app "self-submits + logs", but Phase 3B exposes NO
      // log/confirm endpoint, so signing-and-sending here would silently strand a
      // PENDING row (never flips to ACTIVE in GET /vesting/list). Fail loudly
      // instead of pretending it succeeded.
      if (res.signMode === 'client') {
        throw new Error(
          'Client-signed vesting is not supported yet. Please try again or contact support.',
        );
      }

      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesting'] });
    },
  });
}
