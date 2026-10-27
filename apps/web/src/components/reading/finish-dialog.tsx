'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, applyFieldErrors } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { ReadingSession, SessionResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, fieldAria } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function FinishDialog({
  session,
  trigger,
  disabled,
  onFinished,
  onStale,
}: {
  session: ReadingSession;
  trigger: React.ReactNode;
  disabled?: boolean;
  onFinished: (s: ReadingSession) => void;
  onStale: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const total = session.book.totalPages;
  const schema = z.object({
    endPage: z.union([
      z.literal(''),
      z.coerce
        .number({ error: 'Enter a page number' })
        .int('Use a whole page number')
        .min(session.startPage ?? 0, `You started on page ${session.startPage ?? 0}`)
        .max(total ?? 10_000, total ? `This book has ${total} pages` : 'Page is too large'),
    ]),
    note: z.string().max(2000, 'At most 2000 characters'),
    markBookCompleted: z.boolean(),
  });
  type In = z.input<typeof schema>;
  type Out = z.output<typeof schema>;

  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: { endPage: '', note: '', markBookCompleted: false },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Out) {
    try {
      const res = await api.post<SessionResponse>(`/reading-sessions/${session.id}/finish`, {
        endPage: values.endPage === '' ? undefined : values.endPage,
        note: values.note || undefined,
        markBookCompleted: values.markBookCompleted,
      });
      setOpen(false);
      form.reset();
      onFinished(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_TRANSITION') {
        setOpen(false);
        toast.info('This session was already finished.');
        await onStale();
        return;
      }
      if (!applyFieldErrors(err, form.setError, ['endPage', 'note']))
        toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finish reading</DialogTitle>
          <DialogDescription>
            Record where you stopped. You can write your reflection afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
          <FormField
            id="endPage"
            label="Page you stopped on"
            optional
            error={errors.endPage?.message}
            hint={
              session.startPage != null ? `You started on page ${session.startPage}.` : undefined
            }
          >
            <Input
              {...fieldAria('endPage', errors.endPage?.message, 'hint')}
              type="number"
              inputMode="numeric"
              min={session.startPage ?? 0}
              max={total ?? undefined}
              autoFocus
              {...form.register('endPage')}
            />
          </FormField>
          <FormField id="note" label="Quick note" optional error={errors.note?.message}>
            <Textarea
              {...fieldAria('note', errors.note?.message)}
              rows={3}
              {...form.register('note')}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              {...form.register('markBookCompleted')}
            />
            I finished this book
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Keep reading
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Save session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
