import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

const ADMIN_USERS_KEY = ['admin', 'users'] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: async () => {
      const response = await authClient.admin.listUsers({
        query: { limit: 100 },
      });
      return response.data;
    },
  });
}

export function useAdminCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; name: string; password: string; role: string }) => {
      const response = await authClient.admin.createUser({
        email: data.email,
        name: data.name,
        password: data.password,
        role: data.role as 'user' | 'admin',
      });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
  });
}

export function useAdminUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; name?: string; role?: string }) => {
      const promises: Promise<unknown>[] = [];
      if (data.role) {
        promises.push(
          authClient.admin.setRole({
            userId: data.userId,
            role: data.role as 'user' | 'admin',
          }),
        );
      }
      if (data.name) {
        promises.push(
          authClient.admin.updateUser({
            userId: data.userId,
            data: { name: data.name },
          }),
        );
      }
      await Promise.all(promises);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
  });
}

export function useAdminRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await authClient.admin.removeUser({ userId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
  });
}

export function useAdminSetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; newPassword: string }) => {
      await authClient.admin.setUserPassword({
        userId: data.userId,
        newPassword: data.newPassword,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
  });
}
