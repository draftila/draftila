import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FontFamilyDto, FontVariantDto } from '@draftila/shared';
import {
  isCustomFontsReady,
  mapDtoToEngine,
  markCustomFontsReady,
  registerCustomFonts,
} from '@draftila/engine/custom-fonts';
import { api, ApiError } from '@/lib/api-client';

export const FONTS_KEY = ['fonts'] as const;

export interface UploadFontResponse {
  data: FontFamilyDto;
  /** The variant this request created — NOT inferrable from `data.variants`, which is weight-sorted. */
  variant: FontVariantDto;
  warnings: string[];
}

export function useFonts() {
  return useQuery({
    queryKey: FONTS_KEY,
    queryFn: () => api.get<{ data: FontFamilyDto[] }>('/api/fonts').then((r) => r.data),
    // A FUNCTION, never a bare `retry: 3` — a number would REPLACE the default retry predicate in
    // `query-client.ts` and re-poll `/api/fonts` (auth-gated) three times on an expired session.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && failureCount < 3,
  });
}

/**
 * Feeds the engine's custom-font registry from the `['fonts']` query. Mounted in the dashboard and
 * editor layouts. Until this (or its error path) makes the registry ready, `ensureFontsLoaded`
 * parks every non-curated family, so it must be mounted wherever the canvas can render.
 */
export function CustomFontsLoader() {
  const { data, isError } = useFonts();

  useEffect(() => {
    // Any success, INCLUDING `[]` — an empty payload is data ("no fonts exist") and legitimately
    // evicts. No-change refetches are silent inside the registry diff.
    if (data) registerCustomFonts(mapDtoToEngine(data));
  }, [data]);

  useEffect(() => {
    // Terminal error: open the gate WITHOUT touching the registry. Never `registerCustomFonts([])`,
    // which would evict a populated registry on a transient failure. TanStack keeps `data` through
    // refetch errors and window-focus refetching recovers automatically.
    if (isError && !isCustomFontsReady()) markCustomFontsReady();
  }, [isError]);

  return null;
}

/**
 * Uploads ONE file per request. Returned as a plain callback rather than a mutation so the admin
 * page can drive a sequential queue with its own per-file rows and 429 auto-resume, without the
 * global mutation error toast firing once per file.
 *
 * Does NOT invalidate: the caller invalidates once after its whole queue drains, so an 18-file drop
 * costs one refetch rather than 18 serialized round-trips.
 */
export function useUploadFont() {
  return useCallback(async (file: File, name?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    return api.postForm<UploadFontResponse>('/api/fonts', formData);
  }, []);
}

export function useDeleteFontFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (familyId: string) => api.delete(`/api/fonts/${familyId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FONTS_KEY }),
  });
}

export function useDeleteFontVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, variantId }: { familyId: string; variantId: string }) =>
      api.delete(`/api/fonts/${familyId}/variants/${variantId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FONTS_KEY }),
  });
}
