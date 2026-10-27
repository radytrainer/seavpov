'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { feedbackSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Feedback } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField, fieldAria } from '@/components/ui/form-field';

type Values = z.infer<typeof feedbackSchema>;

/**
 * Trainer feedback on a reflection. `compact` is used inside lists of reflections: a short box,
 * and an existing feedback stays collapsed behind an "Edit" button.
 */
export function FeedbackForm({
  reflectionId,
  feedback,
  compact = false,
}: {
  reflectionId: string;
  feedback?: Feedback;
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!compact || !feedback);
  const id = `feedback-${reflectionId}`;
  const form = useForm<Values>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { body: feedback?.body ?? '' },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function submit(values: Values) {
    try {
      if (feedback) await api.patch(`/reflections/${reflectionId}/feedback/${feedback.id}`, values);
      else await api.post(`/reflections/${reflectionId}/feedback`, values);
      toast.success('Feedback saved. The student can now see it.');
      if (!feedback) form.reset({ body: '' });
      else form.reset(values);
      if (compact && feedback) setEditing(false);
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, form.setError, ['body'])) toast.error(errorMessage(err));
    }
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden /> Edit my feedback
      </Button>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-2" noValidate>
      <FormField
        id={id}
        label={feedback ? 'Your feedback' : 'Give feedback'}
        error={errors.body?.message}
        hint={compact ? undefined : 'Be specific and encouraging.'}
      >
        <Textarea
          {...fieldAria(id, errors.body?.message, compact ? undefined : 'hint')}
          rows={compact ? 2 : 4}
          placeholder={compact ? 'Be specific and encouraging…' : undefined}
          {...form.register('body')}
        />
      </FormField>
      <div className="flex gap-2">
        <Button
          type="submit"
          size={compact ? 'sm' : 'default'}
          loading={isSubmitting}
          disabled={!isDirty}
        >
          {feedback ? 'Update feedback' : 'Send feedback'}
        </Button>
        {compact && feedback && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
