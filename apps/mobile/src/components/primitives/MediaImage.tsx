import React from 'react';
import { Image, ImageProps } from 'expo-image';
import { transformMediaUrl } from '@/utils/media';

interface MediaImageProps extends Omit<ImageProps, 'source'> {
  /**
   * Source URI. Routed through `transformMediaUrl` so Supabase image URLs
   * hit /render/image/public/ (CDN-cached, auto-compressed) instead of
   * /object/public/ (no-cache, raw). Non-Supabase URLs pass through.
   * `null` / `undefined` / `''` cause the component to render nothing.
   */
  uri?: string | null;
}

/**
 * Standard image surface for any user-uploaded media (posts, banners,
 * masonry tiles, search thumbnails). Centralizes:
 *  - URL rewriting via `transformMediaUrl`
 *  - `cachePolicy="disk"` so expo-image keeps a local copy
 *  - `recyclingKey` for FlashList/FlatList reuse correctness
 *  - `transition` + `contentFit` defaults
 *
 * Override any of these by passing the prop normally — last-write-wins
 * via the JSX spread.
 *
 * NOT for avatars — see Avatar primitive which has fallback-to-initials.
 */
export function MediaImage({ uri, ...rest }: MediaImageProps) {
  const src = transformMediaUrl(uri);
  if (!src) return null;
  return (
    <Image
      source={{ uri: src }}
      cachePolicy="disk"
      recyclingKey={src}
      transition={200}
      contentFit="cover"
      {...rest}
    />
  );
}
