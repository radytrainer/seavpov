'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { READING_STATUSES, READING_STATUS_LABELS, type ReadingStatus } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { StudentBookDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField, fieldAria } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const schema = z.object({
  currentPage: z.coerce.number({ error: 'Enter a page number' }).int().min(0, 'Cannot be negative'),
  totalPages: z.union([z.literal(''), z.coerce.number().int().min(1, 'At least 1 page')]),
  notes: z.string().max(2000, 'At most 2000 characters'),
});
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

export function BookActions({ book }: { book: StudentBookDetail }) {
  const router = useRouter();
  const [statusPending, setStatusPending] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPage: book.currentPage,
      totalPages: book.totalPages ?? '',
      notes: book.notes ?? '',
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function save(values: Output) {
    try {
      await api.patch(`/student-books/${book.id}`, {
        currentPage: values.currentPage,
        // Empty clears the personal override (falls back to the catalog page count).
        totalPages: values.totalPages === '' ? null : values.totalPages,
        notes: values.notes,
      });
      toast.success('Saved');
      form.reset(values);
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, form.setError, ['currentPage', 'totalPages', 'notes'])) {
        toast.error(errorMessage(err));
      }
    }
  }

  async function changeStatus(status: ReadingStatus) {
    setStatusPending(true);
    try {
      await api.patch(`/student-books/${book.id}/status`, { status });
      toast.success(`Marked as ${READING_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStatusPending(false);
    }
  }

  async function setArchived(archived: boolean) {
    try {
      await api.patch(`/student-books/${book.id}`, { archived });
      toast.success(archived ? 'Book archived' : 'Book restored');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update this book</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <FormField id="status" label="Reading status">
          <Select
            id="status"
            value={book.status}
            disabled={statusPending}
            onChange={(e) => changeStatus(e.target.value as ReadingStatus)}
          >
            {READING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {READING_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>

        <form onSubmit={form.handleSubmit(save)} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="currentPage" label="Current page" error={errors.currentPage?.message}>
              <Input
                {...fieldAria('currentPage', errors.currentPage?.message)}
                type="number"
                inputMode="numeric"
                min={0}
                {...form.register('currentPage')}
              />
            </FormField>
            <FormField
              id="totalPages"
              label="Total pages"
              optional
              error={errors.totalPages?.message}
              hint="Change if your copy differs."
            >
              <Input
                {...fieldAria('totalPages', errors.totalPages?.message, 'hint')}
                type="number"
                inputMode="numeric"
                min={1}
                {...form.register('totalPages')}
              />
            </FormField>
          </div>
          <FormField
            id="notes"
            label="Notes about this book"
            optional
            error={errors.notes?.message}
          >
            <Textarea
              {...fieldAria('notes', errors.notes?.message)}
              rows={3}
              {...form.register('notes')}
            />
          </FormField>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!isDirty}
            className="justify-self-start"
          >
            Save
          </Button>
        </form>

        <div className="border-t pt-4">
          {book.archivedAt ? (
            <Button variant="outline" onClick={() => setArchived(false)}>
              <ArchiveRestore aria-hidden /> Restore book
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" className="text-muted-foreground">
                  <Archive aria-hidden /> Archive book
                </Button>
              }
              title="Archive this book?"
              description="It will be hidden from My Books. Your sessions and reflections are kept, and you can restore it at any time."
              confirmLabel="Archive"
              onConfirm={() => setArchived(true)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
