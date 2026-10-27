import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { REFLECTION_LABELS, formatDuration } from '@rt/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Reflection } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SECTIONS = ['whatRead', 'learned', 'keyIdeas', 'application'] as const;

export function ReflectionMeta({ reflection }: { reflection: Reflection }) {
  const s = reflection.session;
  return (
    <p className="text-sm text-muted-foreground">
      {formatDate(s.readingDate)} · {formatDuration(s.durationSeconds)}
      {s.startPage != null && s.endPage != null && ` · pages ${s.startPage}–${s.endPage}`}
      {s.source === 'MANUAL' && ' · manual session'}
    </p>
  );
}

export function ReflectionBody({
  reflection,
  tagHref,
}: {
  reflection: Reflection;
  /** When given, tags link to a filtered list. */
  tagHref?: (tag: string) => string;
}) {
  return (
    <div className="grid gap-5">
      {reflection.keyTakeaway && (
        <blockquote className="khmer-safe rounded-md border-l-4 border-primary bg-accent px-4 py-3 text-sm">
          <span className="block text-xs font-medium text-accent-foreground">
            {REFLECTION_LABELS.keyTakeaway}
          </span>
          {reflection.keyTakeaway}
        </blockquote>
      )}
      {SECTIONS.map((f) =>
        reflection[f] ? (
          <section key={f}>
            <h2 className="text-sm font-semibold">{REFLECTION_LABELS[f]}</h2>
            <p className="khmer-safe mt-1 text-sm whitespace-pre-wrap">{reflection[f]}</p>
          </section>
        ) : null,
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {reflection.understandingRating && (
          <span className="text-muted-foreground">
            Understanding:{' '}
            <span className="font-medium text-foreground">{reflection.understandingRating}/5</span>
          </span>
        )}
        {reflection.tags.map((t) =>
          tagHref ? (
            <Link key={t} href={tagHref(t)} className="rounded-full hover:opacity-80">
              <Badge variant="neutral">#{t}</Badge>
            </Link>
          ) : (
            <Badge key={t} variant="neutral">
              #{t}
            </Badge>
          ),
        )}
      </div>
    </div>
  );
}

export function FeedbackList({ reflection }: { reflection: Reflection }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4" aria-hidden /> Trainer feedback
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reflection.feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback yet.</p>
        ) : (
          <ul className="grid gap-4">
            {reflection.feedback.map((f) => (
              <li key={f.id} className="text-sm">
                <p className="font-medium">
                  {f.trainer.fullName}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {formatDateTime(f.createdAt)}
                  </span>
                </p>
                <p className="khmer-safe mt-1 whitespace-pre-wrap">{f.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
