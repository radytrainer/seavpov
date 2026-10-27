'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { REFLECTION_LABELS } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { Reflection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, fieldAria } from '@/components/ui/form-field';

const schema = z
  .object({
    whatRead: z.string().max(4000, 'At most 4000 characters'),
    learned: z.string().max(4000, 'At most 4000 characters'),
    keyIdeas: z.string().max(4000, 'At most 4000 characters'),
    application: z.string().max(4000, 'At most 4000 characters'),
    keyTakeaway: z.string().max(500, 'At most 500 characters'),
    understandingRating: z.string(),
    tags: z.string().max(500),
  })
  .refine(
    (v) =>
      [v.whatRead, v.learned, v.keyIdeas, v.application, v.keyTakeaway].some((t) => t.trim()) ||
      v.understandingRating !== '',
    { path: ['whatRead'], message: 'Write at least one answer' },
  );
type Values = z.infer<typeof schema>;

const PROMPTS: { name: 'whatRead' | 'learned' | 'keyIdeas' | 'application'; hint: string }[] = [
  { name: 'whatRead', hint: 'Chapters, pages or topics you covered.' },
  { name: 'learned', hint: 'New facts, ideas or words.' },
  { name: 'keyIdeas', hint: 'The main points in your own words.' },
  { name: 'application', hint: 'How you could use this in school or life.' },
];

const RATING_LABELS = ['', 'Very little', 'Some parts', 'Mostly', 'Well', 'Completely'];

function toValues(r?: Reflection): Values {
  return {
    whatRead: r?.whatRead ?? '',
    learned: r?.learned ?? '',
    keyIdeas: r?.keyIdeas ?? '',
    application: r?.application ?? '',
    keyTakeaway: r?.keyTakeaway ?? '',
    understandingRating: r?.understandingRating ? String(r.understandingRating) : '',
    tags: r?.tags.join(', ') ?? '',
  };
}

/** Local draft storage so an accidental refresh does not lose a half-written reflection. */
function draftKey(sessionId: string) {
  return `reflection-draft:${sessionId}`;
}
function readDraft(key: string): Values | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Values) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, values: Values | null) {
  try {
    if (values) window.localStorage.setItem(key, JSON.stringify(values));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode) — drafts are a convenience only.
  }
}

export function ReflectionEditor({
  sessionId,
  reflection,
}: {
  sessionId: string;
  reflection?: Reflection;
}) {
  const router = useRouter();
  const key = draftKey(sessionId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(reflection),
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const values = useWatch({ control: form.control });
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = readDraft(key);
    if (draft) {
      form.reset(draft, { keepDefaultValues: true });
      toast.info('Restored your unsaved draft');
    }
  }, [form, key]);

  useEffect(() => {
    if (isDirty) writeDraft(key, values as Values);
  }, [isDirty, key, values]);

  async function submit(v: Values) {
    const payload = {
      whatRead: v.whatRead,
      learned: v.learned,
      keyIdeas: v.keyIdeas,
      application: v.application,
      keyTakeaway: v.keyTakeaway,
      understandingRating: v.understandingRating === '' ? null : Number(v.understandingRating),
      tags: v.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      const res = reflection
        ? await api.patch<{ data: Reflection }>(`/reflections/${reflection.id}`, payload)
        : await api.post<{ data: Reflection }>('/reflections', { sessionId, ...payload });
      writeDraft(key, null);
      toast.success('Reflection saved');
      router.push(`/reflections/${res.data.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REFLECTION_EXISTS') {
        const id = (err.details as { reflectionId?: string })?.reflectionId;
        toast.info('This session already has a reflection.');
        if (id) router.push(`/reflections/${id}/edit`);
        return;
      }
      if (
        !applyFieldErrors(err, form.setError, [
          'whatRead',
          'learned',
          'keyIdeas',
          'application',
          'keyTakeaway',
          'understandingRating',
          'tags',
        ])
      ) {
        toast.error(errorMessage(err));
      }
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-5" noValidate>
      {PROMPTS.map((p) => (
        <FormField
          key={p.name}
          id={p.name}
          label={REFLECTION_LABELS[p.name]}
          hint={p.hint}
          error={errors[p.name]?.message}
        >
          <Textarea
            {...fieldAria(p.name, errors[p.name]?.message, p.hint)}
            rows={4}
            {...form.register(p.name)}
          />
        </FormField>
      ))}

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">
          {REFLECTION_LABELS.understandingRating}{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = values.understandingRating === String(n);
            return (
              <label
                key={n}
                className={cn(
                  'flex h-11 min-w-11 cursor-pointer flex-col items-center justify-center rounded-md border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  selected ? 'border-primary bg-accent font-semibold' : 'hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  value={String(n)}
                  className="sr-only"
                  {...form.register('understandingRating')}
                />
                {n}
                <span className="sr-only"> – {RATING_LABELS[n]}</span>
              </label>
            );
          })}
          {values.understandingRating && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => form.setValue('understandingRating', '', { shouldDirty: true })}
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          1 = understood very little · 5 = understood completely
          {values.understandingRating &&
            ` · Selected: ${RATING_LABELS[Number(values.understandingRating)]}`}
        </p>
      </fieldset>

      <FormField
        id="keyTakeaway"
        label={REFLECTION_LABELS.keyTakeaway}
        optional
        error={errors.keyTakeaway?.message}
      >
        <Input
          {...fieldAria('keyTakeaway', errors.keyTakeaway?.message)}
          className="khmer-safe"
          {...form.register('keyTakeaway')}
        />
      </FormField>
      <FormField
        id="tags"
        label="Tags"
        optional
        hint="Separate with commas, e.g. science, habits"
        error={errors.tags?.message}
      >
        <Input {...fieldAria('tags', errors.tags?.message, 'hint')} {...form.register('tags')} />
      </FormField>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save reflection
        </Button>
      </div>
    </form>
  );
}
