import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Reflection } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ReflectionBody } from './reflection-view';
import { FeedbackForm } from './feedback-form';
import { PdfLink } from './pdf-link';

/**
 * A reflection shown in full, for reviewers: who, which book, when; every answer; existing
 * feedback; and (optionally) an inline feedback form so trainers can respond without leaving
 * the list.
 */
export function ReflectionCard({
  reflection: r,
  showStudent,
  studentHref,
  reviewerId,
  canGiveFeedback,
}: {
  reflection: Reflection;
  showStudent?: boolean;
  studentHref?: string;
  reviewerId?: string;
  canGiveFeedback?: boolean;
}) {
  const mine = r.feedback.find((f) => f.trainer.id === reviewerId);
  const s = r.session;
  return (
    <article aria-labelledby={`refl-${r.id}`} className="rounded-lg border bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 id={`refl-${r.id}`} className="font-semibold">
            {showStudent &&
              (studentHref ? (
                <Link href={studentHref} className="hover:underline">
                  {r.studentName}
                </Link>
              ) : (
                r.studentName
              ))}
            {showStudent && <span className="text-muted-foreground"> · </span>}
            {r.book.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            Read {formatDate(s.readingDate)} · {formatDuration(s.durationSeconds)}
            {s.startPage != null && s.endPage != null && ` · pages ${s.startPage}–${s.endPage}`}
            {s.source === 'MANUAL' && ' · manual session'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.feedback.length === 0 ? (
            <Badge variant="warning">Needs feedback</Badge>
          ) : (
            <Badge variant="success">
              <MessageSquare className="size-3" aria-hidden /> Feedback given
            </Badge>
          )}
          <PdfLink reflectionId={r.id} label="PDF" variant="ghost" size="sm" />
        </div>
      </header>
      <div className="px-4 py-4">
        <ReflectionBody reflection={r} />
      </div>
      {(r.feedback.length > 0 || canGiveFeedback) && (
        <footer className="grid gap-3 border-t bg-muted/30 px-4 py-3">
          {r.feedback.map((f) => (
            <div key={f.id} className="text-sm">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{f.trainer.fullName}</span> ·{' '}
                {formatDateTime(f.updatedAt)}
              </p>
              <p className="khmer-safe mt-0.5 whitespace-pre-wrap">{f.body}</p>
            </div>
          ))}
          {canGiveFeedback && <FeedbackForm reflectionId={r.id} feedback={mine} compact />}
        </footer>
      )}
    </article>
  );
}
