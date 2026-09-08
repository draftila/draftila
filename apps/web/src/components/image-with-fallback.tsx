import { useState, type ComponentProps, type ReactNode } from 'react';

type ImageWithFallbackProps = Omit<ComponentProps<'img'>, 'src' | 'onError'> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

export function ImageWithFallback({ src, fallback, ...props }: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return fallback;

  return <img key={src} {...props} src={src} onError={() => setFailedSrc(src)} />;
}
