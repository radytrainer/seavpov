'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Library,
  NotebookPen,
  Pause,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatClock, formatDuration } from '@rt/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatTime } from '@/lib/format';
import type { ReadingSession, SessionResponse, StudentBook } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/states';
import { FinishDialog } from './finish-dialog';
import { useElapsed } from './use-elapsed';

type Action = 'start' | 'pause' | 'resume' | 'cancel';

const LONG_SESSION_SECONDS = 3 * 60 * 60;

export function ReadingTimer({
  initialSession,
  books,
  preselectedBookId,
}: {
  initialSession: ReadingSession | null;
  books: StudentBook[];
  preselectedBookId?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<ReadingSession | null>(initialSession);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [pending, setPending] = useState<Action | null>(null);
  const [finished, setFinished] = useState<ReadingSession | null>(null);
  const [bookId, setBookId] = useState(
    () => books.find((b) => b.id === preselectedBookId)?.id ?? books[0]?.id ?? '',
  );
  const elapsed = useElapsed(session, receivedAt);
  const inFlight = useRef(false);

  const apply = useCallback((s: ReadingSession | null) => {
    setSession(s);
    setReceivedAt(Date.now());
  }, []);

  // Re-sync with the server when the tab becomes visible again (phone unlocked, tab switch).
  useEffect(() => {
    async function sync() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await api.get<{ data: ReadingSession | null }>('/reading-sessions/active');
        apply(res.data);
      } catch {
        // Keep showing the last known state; actions will surface errors.
      }
    }
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [apply]);

  async function run(action: Action) {
    if (inFlight.current) return; // guard against double taps
    inFlight.current = true;
    setPending(action);
    try {
      const res =
        action === 'start'
          ? await api.post<SessionResponse>('/reading-sessions/start', { studentBookId: bookId })
          : await api.post<SessionResponse>(`/reading-sessions/${session!.id}/${action}`);
      apply(action === 'cancel' ? null : res.data);
      if (action === 'cancel') toast.success('Session discarded');
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'INVALID_TRANSITION' || err.code === 'ACTIVE_SESSION_EXISTS')
      ) {
        // Another tab/device changed the session; show the real state.
        const res = await api.get<{ data: ReadingSession | null }>('/reading-sessions/active');
        apply(res.data);
        toast.info('Your session was updated on another device or tab.');
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  if (finished) {
    return (
      <Card>
        <CardContent className="grid justify-items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-success" aria-hidden />
          <h2 className="text-lg font-semibold">Session saved</h2>
          <p className="text-sm text-muted-foreground">
            You read <span className="font-medium text-foreground">{finished.book.title}</span> for{' '}
            <span className="font-medium text-foreground">
              {formatDuration(finished.durationSeconds)}
            </span>
            {finished.pagesRead != null && finished.pagesRead > 0 && (
              <> · {finished.pagesRead} pages</>
            )}
            .
          </p>
          {finished.durationCapped && (
            <p className="max-w-sm text-xs text-muted-foreground">
              The timer ran longer than the maximum session length, so the time was capped.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/reflections/new?session=${finished.id}`}>
                <NotebookPen aria-hidden /> Write a reflection
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFinished(null);
                router.refresh();
              }}
            >
              Done for now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can add your reflection later from History.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    if (books.length === 0) {
      return (
        <EmptyState
          icon={Library}
          title="Add a book first"
          description="Choose the physical book you are reading from the library, then start a session."
          action={
            <Button asChild>
              <Link href="/books">Go to My Books</Link>
            </Button>
          }
        />
      );
    }
    return (
      <Card>
        <CardContent className="grid gap-4 py-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Which book are you reading?</legend>
            <div className="grid max-h-80 gap-2 overflow-y-auto">
              {books.map((b) => (
                <label
                  key={b.id}
                  className={cn(
                    'flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    bookId === b.id ? 'border-primary bg-accent' : 'hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="book"
                    value={b.id}
                    checked={bookId === b.id}
                    onChange={() => setBookId(b.id)}
                    className="sr-only"
                  />
                  <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.book.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      Page {b.currentPage}
                      {b.totalPages ? ` of ${b.totalPages}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            size="lg"
            onClick={() => run('start')}
            loading={pending === 'start'}
            disabled={!bookId}
          >
            <Play aria-hidden /> Start reading
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Forgot to use the timer?{' '}
            <Link href="/history?add=1" className="text-primary underline-offset-4 hover:underline">
              Add a session manually
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const reading = session.status === 'READING';
  return (
    <div className="grid gap-4 pb-28 md:pb-0">
      <Card>
        <CardContent className="grid justify-items-center gap-2 py-8 text-center">
          <Badge variant={reading ? 'default' : 'warning'}>{reading ? 'Reading' : 'Paused'}</Badge>
          <p className="text-lg font-semibold">{session.book.title}</p>
          {session.book.author && (
            <p className="-mt-2 text-sm text-muted-foreground">{session.book.author}</p>
          )}
          <p
            className="mt-2 font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl"
            role="timer"
            aria-live="off"
            aria-label={`Reading time ${formatDuration(elapsed)}`}
          >
            {formatClock(elapsed)}
          </p>
          <p className="text-sm text-muted-foreground">
            Started at {formatTime(session.startedAt)}
            {session.startPage != null && ` · from page ${session.startPage}`}
          </p>
          {elapsed > LONG_SESSION_SECONDS && (
            <p role="status" className="mt-2 max-w-sm text-sm text-warning-foreground">
              This session has been running for a long time. If you stopped reading, finish or
              discard it — very long sessions are capped.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Controls: sticky above the mobile bottom navigation. */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-card/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          {reading ? (
            <Button
              size="lg"
              variant="outline"
              onClick={() => run('pause')}
              loading={pending === 'pause'}
              disabled={pending !== null}
            >
              <Pause aria-hidden /> Pause
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              onClick={() => run('resume')}
              loading={pending === 'resume'}
              disabled={pending !== null}
            >
              <Play aria-hidden /> Resume
            </Button>
          )}
          <FinishDialog
            session={session}
            disabled={pending !== null}
            onFinished={(s) => {
              setSession(null);
              setFinished(s);
            }}
            onStale={async () => {
              const res = await api.get<{ data: ReadingSession | null }>(
                '/reading-sessions/active',
              );
              apply(res.data);
            }}
            trigger={
              <Button size="lg" disabled={pending !== null}>
                <Square aria-hidden /> Finish
              </Button>
            }
          />
        </div>
        <div className="mt-1 flex justify-center">
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={pending !== null}
              >
                <Trash2 aria-hidden /> Discard session
              </Button>
            }
            title="Discard this session?"
            description="The time will not be counted. Use this only if you started the timer by mistake."
            confirmLabel="Discard"
            destructive
            onConfirm={() => run('cancel')}
          />
        </div>
      </div>
    </div>
  );
}
