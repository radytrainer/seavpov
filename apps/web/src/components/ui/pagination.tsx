import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from './button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Builds the href for a page while keeping current filters. */
  hrefFor: (page: number) => string;
}

export function Pagination({ page, pageSize, total, hrefFor }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < pages ? hrefFor(page + 1) : null;
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }));
  const disabledClass = cn(linkClass, 'pointer-events-none opacity-50');

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        {prev ? (
          <Link href={prev} className={linkClass} aria-label="Previous page">
            <ChevronLeft /> Prev
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            <ChevronLeft /> Prev
          </span>
        )}
        {next ? (
          <Link href={next} className={linkClass} aria-label="Next page">
            Next <ChevronRight />
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            Next <ChevronRight />
          </span>
        )}
      </div>
    </nav>
  );
}
