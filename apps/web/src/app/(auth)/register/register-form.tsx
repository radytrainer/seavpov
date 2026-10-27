'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { RegistrationInfo } from '@/lib/api/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { FormField, fieldAria } from '@/components/ui/form-field';

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter your full name').max(150),
  studentCode: z.string().trim().min(1, 'Enter your student ID').max(32),
  classId: z.string().min(1, 'Choose your class'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  password: passwordSchema,
});
type Values = z.infer<typeof schema>;
const FIELDS = ['fullName', 'studentCode', 'classId', 'email', 'password'] as const;

/**
 * Short registration form: name, student ID + class, optional email, password (with show/hide).
 * The username is created from the student ID, which students then use to sign in.
 */
export function RegisterForm({ classes }: { classes: RegistrationInfo['classes'] }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { classId: classes.length === 1 ? classes[0]!.id : '', email: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.post('/auth/register', values);
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REGISTRATION_CLOSED') {
        setFormError(err.message);
        return;
      }
      if (!applyFieldErrors(err, setError, FIELDS)) setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 short:gap-2.5" noValidate>
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <FormField id="fullName" label="Full name" error={errors.fullName?.message}>
        <Input
          {...fieldAria('fullName', errors.fullName?.message)}
          className="khmer-safe h-11 short:h-10"
          autoComplete="name"
          enterKeyHint="next"
          autoFocus
          {...register('fullName')}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="studentCode" label="Student ID" error={errors.studentCode?.message}>
          <Input
            {...fieldAria('studentCode', errors.studentCode?.message)}
            className="h-11 short:h-10"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            {...register('studentCode')}
          />
        </FormField>
        <FormField id="classId" label="Class" error={errors.classId?.message}>
          <Select
            {...fieldAria('classId', errors.classId?.message)}
            className="h-11 short:h-10"
            {...register('classId')}
          >
            <option value="">Choose…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.generation.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField id="email" label="Email" optional error={errors.email?.message}>
        <Input
          {...fieldAria('email', errors.email?.message)}
          className="h-11 short:h-10"
          type="email"
          autoComplete="email"
          enterKeyHint="next"
          {...register('email')}
        />
      </FormField>
      <FormField
        id="password"
        label="Password"
        error={errors.password?.message}
        hint="10+ characters with letters and numbers."
      >
        <PasswordInput
          {...fieldAria('password', errors.password?.message, 'hint')}
          className="h-11 short:h-10"
          autoComplete="new-password"
          enterKeyHint="go"
          {...register('password')}
        />
      </FormField>
      <Button
        type="submit"
        size="lg"
        className="mt-1 h-12 w-full short:h-11"
        loading={isSubmitting}
      >
        Create account
      </Button>
    </form>
  );
}
