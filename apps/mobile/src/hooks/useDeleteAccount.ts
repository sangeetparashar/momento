import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, void>({
    mutationFn: () =>
      apiService.post<{ deleted: boolean }>('/users/me/delete', {
        confirmation: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
