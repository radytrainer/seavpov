'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { readingGoalSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Goal } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';

type In = z.input<typeof readingGoalSchema>;
type Out = z.output<typeof readingGoalSchema>;

const FIELDS = [
  { name: 'dailyMinutes', label: 'Minutes per day', min: 5, max: 240 },
  { name: 'weeklyMinutes', label: 'Minutes per week', min: 10, max: 1680 },
  { name: 'daysPerWeek', label: 'Reading days per week', min: 1, max: 7 },
  { name: 'monthlyBooks', label: 'Books per month', min: 0, max: 20, optional: true },
] as const;

export function GoalForm({ goal }: { goal: Goal }) {
  const router = useRouter();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(readingGoalSchema),
    defaultValues: {
      dailyMinutes: goal.dailyMinutes,
      weeklyMinutes: goal.weeklyMinutes,
      daysPerWeek: goal.daysPerWeek,
      monthlyBooks: goal.monthlyBooks ?? '',
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function submit(values: Out) {
    try {
      await api.post('/reading-goals', values);
      toast.success('Goal saved');
      form.reset(form.getValues());
      router.refresh();
    } catch (err) {
      if (
        !applyFieldErrors(
          err,
          form.setError,
          FIELDS.map((f) => f.name),
        )
      )
        toast.error(errorMessage(err));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <FormField
            key={f.name}
            id={`g-${f.name}`}
            label={f.label}
            optional={'optional' in f}
            error={errors[f.name]?.message}
          >
            <Input
              {...fieldAria(`g-${f.name}`, errors[f.name]?.message)}
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              {...form.register(f.name)}
            />
          </FormField>
        ))}
      </div>
      <Button
        type="submit"
        loading={isSubmitting}
        disabled={!isDirty && !goal.isDefault}
        className="justify-self-start"
      >
        {goal.isDefault ? 'Set my goal' : 'Save goal'}
      </Button>
    </form>
  );
}
