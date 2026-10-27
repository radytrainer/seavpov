import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

/** Compact headline number with optional context line and goal progress. */
export function Stat({
  label,
  value,
  detail,
  icon: Icon,
  progress,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  progress?: { value: number | null; label: string };
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 shadow-xs', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      {progress && progress.value !== null && (
        <Progress value={progress.value} label={progress.label} className="mt-2" />
      )}
    </div>
  );
}

export function ChangeText({ percent, period }: { percent: number | null; period: string }) {
  if (percent === null) return <>New compared with {period}</>;
  if (percent === 0) return <>Same as {period}</>;
  return (
    <>
      {percent > 0 ? '+' : '−'}
      {Math.abs(percent)}% vs {period}
    </>
  );
}
