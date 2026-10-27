import { APP_NAME, Logo } from '@/components/brand/logo';

/**
 * Compact auth layout: logo + name in one short header so the forms fit on a phone screen
 * without scrolling. On short screens (`short:` = height ≤ 720 px) it shrinks further.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-5 sm:py-10 short:py-3">
      <div className="mb-4 flex items-center gap-3 sm:mb-6 short:mb-3">
        <Logo
          size={56}
          variant="full"
          decorative
          className="sm:size-[72px] short:size-10 short:sm:size-12"
        />
        <div className="grid">
          <span className="khmer-safe text-lg leading-tight font-semibold sm:text-xl">
            {APP_NAME}
          </span>
          <span className="text-xs text-muted-foreground sm:text-sm short:hidden">
            Physical book reading tracker
          </span>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-sm sm:p-6 short:p-4 short:sm:p-5">
        {children}
      </div>
    </main>
  );
}
