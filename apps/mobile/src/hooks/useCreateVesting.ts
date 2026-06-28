import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { createVesting, confirmVesting } from '@/services/tokenApi';
import type { VestingCreateRequest, VestingCreateResponse } from '@/services/tokenApi.types';
import type { ApiError } from '@/services/api';
import { useClientSignSubmit } from './useClientSignSubmit';

/**
 * Create a vesting/lock schedule. §d.7 returns a `signMode` discriminator:
 *  - 'server': the backend already signed and set createSignature/status=ACTIVE.
 *  - 'client': a fallback that returns an unsigned tx and leaves the row PENDING
 *    until the app self-submits AND confirms. The app signs-and-sends the tx,
 *    then POSTs the landed signature to /vesting/[id]/confirm so the backend
 *    re-derives the funded total from chain and flips PENDING→ACTIVE. (Before the
 *    confirm route existed this path was rejected outright to avoid stranding a
 *    PENDING row.)
 *
 * Invalidates the vesting list on success.
 */
export function useCreateVesting(): UseMutationResult<
  VestingCreateResponse,
  ApiError,
  VestingCreateRequest
> {
  const queryClient = useQueryClient();
  const signer = useClientSignSubmit();

  return useMutation<VestingCreateResponse, ApiError, VestingCreateRequest>({
    mutationFn: async (body) => {
      const res = await createVesting(body);

      // §d.7: signMode==='server' — the backend already submitted and set
      // createSignature + status=ACTIVE; nothing more to do here.
      if (res.signMode !== 'client') {
        return res;
      }

      // 'client' fallback: the backend returned an unsigned tx and left the row
      // PENDING. Sign-and-send it ourselves, then POST the landed signature to
      // /vesting/[id]/confirm so the backend re-derives funded from chain and
      // transitions PENDING→ACTIVE. The confirm route NEVER trusts a
      // client-supplied amount — it reads the on-chain stream itself.
      if (!res.transaction) {
        throw new Error('Vesting creation is unavailable. Please try again or contact support.');
      }

      const result = await signer.run({
        transaction: res.transaction,
        mode: 'signAndSend',
        submit: async (signature) => {
          // Bind the landed signature to the row and flip it ACTIVE. If confirm
          // fails the tx still landed, so surface the create as failed only if
          // the backend cannot reconcile — re-throw so the caller doesn't treat
          // a stuck-PENDING row as a clean success.
          await confirmVesting(res.vestingId, signature);
          return { signature, status: undefined };
        },
      });

      if (!result) {
        throw new Error(signer.error ?? 'Failed to sign and submit vesting transaction.');
      }

      return { ...res, createSignature: result.signature };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesting'] });
    },
  });
}
