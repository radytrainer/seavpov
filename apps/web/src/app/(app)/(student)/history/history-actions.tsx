'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { ReadingSession, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { SessionDialog } from '@/components/reading/session-dialog';

type BookOption = Pick<StudentBook, 'id' | 'book'>;

export function HistoryActions({
  books,
  openOnLoad,
}: {
  books: BookOption[];
  openOnLoad?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(openOnLoad) && books.length > 0);
  if (books.length === 0) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add session
      </Button>
      {open && <SessionDialog open={open} onOpenChange={setOpen} books={books} />}
    </>
  );
}

export function SessionRowActions({
  session,
  books,
}: {
  session: ReadingSession;
  books: BookOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Edit session of ${session.book.title}`}
      >
        <Pencil aria-hidden />
      </Button>
      {open && <SessionDialog open={open} onOpenChange={setOpen} books={books} session={session} />}
    </>
  );
}
