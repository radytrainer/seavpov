import { BookOpen } from 'lucide-react';
import { READING_STATUS_LABELS, type ReadingStatus } from '@rt/shared';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<ReadingStatus, BadgeVariant> = {
  PLANNED: 'neutral',
  READING: 'default',
  PAUSED: 'warning',
  COMPLETED: 'success',
  ABANDONED: 'neutral',
};

export function ReadingStatusBadge({ status }: { status: ReadingStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{READING_STATUS_LABELS[status]}</Badge>;
}

/** Small cover thumbnail with a neutral fallback (covers are optional external images). */
export function BookCover({
  url,
  title,
  className,
}: {
  url: string | null;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex aspect-[2/3] w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted',
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts; tiny thumbnail
        <img
          src={url}
          alt={`Cover of ${title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <BookOpen className="size-5 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
