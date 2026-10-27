import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Reflection } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

function excerpt(r: Reflection): string {
  const text = r.keyTakeaway ?? r.learned ?? r.keyIdeas ?? r.whatRead ?? r.application ?? '';
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

/** Compact reflection list, shared by student and trainer views. */
export function ReflectionList({
  reflections,
  hrefFor,
  showStudent = false,
}: {
  reflections: Reflection[];
  hrefFor: (r: Reflection) => string;
  showStudent?: boolean;
}) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {reflections.map((r) => (
        <li key={r.id}>
          <Link
            href={hrefFor(r)}
            className="block p-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {showStudent && <span>{r.studentName} · </span>}
                {r.book.title}
              </p>
              <span className="text-xs text-muted-foreground">
                {formatDate(r.session.readingDate)}
              </span>
            </div>
            {excerpt(r) && (
              <p className="khmer-safe mt-1 line-clamp-2 text-sm text-muted-foreground">
                {excerpt(r)}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {r.understandingRating && (
                <Badge variant="outline">Understanding {r.understandingRating}/5</Badge>
              )}
              {r.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="neutral">
                  #{t}
                </Badge>
              ))}
              {r.feedback.length > 0 && (
                <Badge variant="success">
                  <MessageSquare className="size-3" aria-hidden /> {r.feedback.length} feedback
                </Badge>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
