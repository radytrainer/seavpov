'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatDuration } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import type { ReadingSession, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField, fieldAria } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { localTime, toInstants, todayLocal } from './session-form-utils';

const optionalPage = z.union([
  z.literal(''),
  z.coerce.number({ error: 'Enter a page number' }).int().min(0, 'Cannot be negative'),
]);

const schema = z
  .object({
    studentBookId: z.string().min(1, 'Choose a book'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Enter a start time'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Enter an end time'),
    startPage: optionalPage,
    endPage: optionalPage,
    note: z.string().max(2000, 'At most 2000 characters'),
  })
  .refine((v) => v.start !== v.end, { path: ['end'], message: 'End time must differ from start' })
  .refine((v) => v.startPage === '' || v.endPage === '' || v.endPage >= v.startPage, {
    path: ['endPage'],
    message: 'End page must be the same as or after the start page',
  });
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

interface Overlap {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

/**
 * Manual session entry (create) and session editing (update). Timed sessions only allow page
 * and note edits; their timestamps were recorded by the server.
 */
export function SessionDialog({
  open,
  onOpenChange,
  books,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: Pick<StudentBook, 'id' | 'book'>[];
  session?: ReadingSession;
}) {
  const router = useRouter();
  const [overlaps, setOverlaps] = useState<Overlap[]>([]);
  const editing = Boolean(session);
  const timesEditable = !session || session.source === 'MANUAL';

  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: session
      ? {
          studentBookId: session.studentBookId,
          date: session.readingDate,
          start: localTime(session.startedAt),
          end: session.endedAt ? localTime(session.endedAt) : '',
          startPage: session.startPage ?? '',
          endPage: session.endPage ?? '',
          note: session.note ?? '',
        }
      : {
          studentBookId: books[0]?.id ?? '',
          date: todayLocal(),
          start: '',
          end: '',
          startPage: '',
          endPage: '',
          note: '',
        },
  });
  const { errors, isSubmitting } = form.formState;
  const [start, end] = useWatch({ control: form.control, name: ['start', 'end'] });
  const crossesMidnight = Boolean(start && end && end < start);

  async function submit(v: Out) {
    setOverlaps([]);
    const pages = {
      startPage: v.startPage === '' ? null : v.startPage,
      endPage: v.endPage === '' ? null : v.endPage,
      note: v.note,
    };
    try {
      if (!session) {
        const times = toInstants(v.date, v.start, v.end);
        await api.post('/reading-sessions/manual', {
          studentBookId: v.studentBookId,
          startedAt: times.startedAt,
          endedAt: times.endedAt,
          ...pages,
        });
        toast.success('Session added');
      } else {
        const times = timesEditable ? toInstants(v.date, v.start, v.end) : null;
        await api.patch(`/reading-sessions/${session.id}`, {
          ...pages,
          ...(times ? { startedAt: times.startedAt, endedAt: times.endedAt } : {}),
        });
        toast.success('Session updated');
      }
      onOpenChange(false);
      form.reset();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_OVERLAP') {
        setOverlaps((err.details as { overlaps?: Overlap[] })?.overlaps ?? []);
        return;
      }
      if (
        err instanceof ApiError &&
        err.fieldIssues.some((i) => i.path === 'startedAt' || i.path === 'endedAt')
      ) {
        const issue = err.fieldIssues.find((i) => i.path === 'startedAt' || i.path === 'endedAt')!;
        form.setError(issue.path === 'startedAt' ? 'date' : 'end', { message: issue.message });
        return;
      }
      if (!applyFieldErrors(err, form.setError, ['startPage', 'endPage', 'note'])) {
        toast.error(errorMessage(err));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit session' : 'Add a session manually'}</DialogTitle>
          <DialogDescription>
            {editing && !timesEditable
              ? 'Times of timed sessions were recorded automatically. You can update pages and your note.'
              : 'For reading you did without the timer. Manual sessions are marked as such.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
          {overlaps.length > 0 && (
            <div
              role="alert"
              className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <p className="font-medium">This overlaps another session:</p>
              <ul className="mt-1 list-disc pl-5">
                {overlaps.map((o) => (
                  <li key={o.id}>
                    {formatDateTime(o.startedAt)} – {o.endedAt ? formatDateTime(o.endedAt) : 'now'}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Change the times so your reading is not counted twice.</p>
            </div>
          )}
          {!editing && (
            <FormField id="m-book" label="Book" error={errors.studentBookId?.message}>
              <Select
                {...fieldAria('m-book', errors.studentBookId?.message)}
                {...form.register('studentBookId')}
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.book.title}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {timesEditable && (
            <>
              <FormField id="m-date" label="Date" error={errors.date?.message}>
                <Input
                  {...fieldAria('m-date', errors.date?.message)}
                  type="date"
                  max={todayLocal()}
                  {...form.register('date')}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField id="m-start" label="Start time" error={errors.start?.message}>
                  <Input
                    {...fieldAria('m-start', errors.start?.message)}
                    type="time"
                    {...form.register('start')}
                  />
                </FormField>
                <FormField
                  id="m-end"
                  label="End time"
                  error={errors.end?.message}
                  hint={crossesMidnight ? 'Ends after midnight (next day).' : undefined}
                >
                  <Input
                    {...fieldAria('m-end', errors.end?.message, crossesMidnight ? 'h' : undefined)}
                    type="time"
                    {...form.register('end')}
                  />
                </FormField>
              </div>
            </>
          )}
          {editing && !timesEditable && session && (
            <p className="text-sm text-muted-foreground">
              {formatDateTime(session.startedAt)} · {formatDuration(session.durationSeconds)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField id="m-sp" label="Start page" optional error={errors.startPage?.message}>
              <Input
                {...fieldAria('m-sp', errors.startPage?.message)}
                type="number"
                inputMode="numeric"
                min={0}
                {...form.register('startPage')}
              />
            </FormField>
            <FormField id="m-ep" label="End page" optional error={errors.endPage?.message}>
              <Input
                {...fieldAria('m-ep', errors.endPage?.message)}
                type="number"
                inputMode="numeric"
                min={0}
                {...form.register('endPage')}
              />
            </FormField>
          </div>
          <FormField id="m-note" label="Note" optional error={errors.note?.message}>
            <Textarea
              {...fieldAria('m-note', errors.note?.message)}
              rows={2}
              {...form.register('note')}
            />
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Add session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
