import { cn } from '@/lib/utils';

export const APP_NAME = 'សៀវភៅ PN';

/**
 * Circular brand logo. `variant="full"` includes the Khmer word; `"mark"` is the simplified
 * version for small sizes (≤ 48 px). Source files: public/brand, design/logo.
 */
export function Logo({
  size = 32,
  variant = 'mark',
  className,
  decorative = false,
}: {
  size?: number;
  variant?: 'mark' | 'full';
  className?: string;
  /** Hide from assistive technology when the app name is shown as text next to it. */
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
    <img
      src={variant === 'full' ? '/brand/logo.svg' : '/brand/logo-mark.svg'}
      width={size}
      height={size}
      alt={decorative ? '' : APP_NAME}
      aria-hidden={decorative || undefined}
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  );
}

/** Logo mark + app name, for headers. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo size={30} decorative />
      <span className="khmer-safe leading-none font-semibold">{APP_NAME}</span>
    </span>
  );
}
