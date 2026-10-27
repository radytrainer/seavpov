'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { settingsSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface Settings {
  institutionName: string;
  timeZone: string;
  minDailyMinutes: number;
  defaultDailyMinutes: number;
  defaultWeeklyMinutes: number;
  defaultDaysPerWeek: number;
  defaultMonthlyBooks: number | null;
  maxSessionMinutes: number;
  manualEntryMaxDays: number;
  inactiveAfterDays: number;
  selfRegistrationEnabled: boolean;
  updatedAt: string;
}

type In = z.input<typeof settingsSchema>;
type Out = z.output<typeof settingsSchema>;
type Key = keyof Omit<Settings, 'updatedAt' | 'selfRegistrationEnabled'>;

const SECTIONS: {
  title: string;
  description: string;
  fields: { name: Key; label: string; hint?: string; type?: string }[];
}[] = [
  {
    title: 'Institution',
    description: 'Dates are shown and counted in this time zone.',
    fields: [
      { name: 'institutionName', label: 'Institution name' },
      {
        name: 'timeZone',
        label: 'Time zone',
        hint: 'IANA name, e.g. Asia/Phnom_Penh. Existing sessions keep the date they were recorded on. Update NEXT_PUBLIC_TIME_ZONE for the web app too.',
      },
    ],
  },
  {
    title: 'Streaks and habits',
    description: 'How reading days and inactivity are defined.',
    fields: [
      { name: 'minDailyMinutes', label: 'Minimum minutes for a reading day', type: 'number' },
      {
        name: 'inactiveAfterDays',
        label: '“May need encouragement” after (days without reading)',
        type: 'number',
      },
    ],
  },
  {
    title: 'Default goals',
    description: 'Used for students who have not set their own goal.',
    fields: [
      { name: 'defaultDailyMinutes', label: 'Minutes per day', type: 'number' },
      { name: 'defaultWeeklyMinutes', label: 'Minutes per week', type: 'number' },
      { name: 'defaultDaysPerWeek', label: 'Reading days per week', type: 'number' },
      { name: 'defaultMonthlyBooks', label: 'Books per month (empty = none)', type: 'number' },
    ],
  },
  {
    title: 'Reading sessions',
    description: 'Protects data quality without discouraging students.',
    fields: [
      {
        name: 'maxSessionMinutes',
        label: 'Maximum minutes per session',
        hint: 'Longer timers are capped and flagged.',
        type: 'number',
      },
      {
        name: 'manualEntryMaxDays',
        label: 'Manual entries allowed for the last (days)',
        type: 'number',
      },
    ],
  },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  // Self-registration has its own switch above this form.
  const { updatedAt: _ignored, selfRegistrationEnabled: _toggle, ...defaults } = settings;
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ...defaults, defaultMonthlyBooks: defaults.defaultMonthlyBooks ?? '' },
  });
  const { errors, isSubmitting, isDirty, dirtyFields } = form.formState;

  async function submit(values: Out) {
    const changed = Object.fromEntries(
      Object.entries(values).filter(([k]) => dirtyFields[k as Key]),
    );
    try {
      await api.patch('/admin/settings', changed);
      toast.success('Settings saved');
      form.reset(form.getValues());
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, form.setError, Object.keys(defaults)))
        toast.error(errorMessage(err));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-5" noValidate>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {s.fields.map((f) => (
              <FormField
                key={f.name}
                id={`s-${f.name}`}
                label={f.label}
                hint={f.hint}
                error={errors[f.name]?.message}
              >
                <Input
                  {...fieldAria(`s-${f.name}`, errors[f.name]?.message, f.hint)}
                  type={f.type ?? 'text'}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  {...form.register(f.name)}
                />
              </FormField>
            ))}
          </CardContent>
        </Card>
      ))}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
