'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema } from '@rt/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';

const schema = z
  .object({ newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!token) {
    return <p className="mt-3 text-sm text-destructive">This reset link is incomplete.</p>;
  }
  if (done) {
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        Your password has been changed. You can now sign in.
      </p>
    );
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword });
      setDone(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 grid gap-4" noValidate>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <FormField
        id="newPassword"
        label="New password"
        error={errors.newPassword?.message}
        hint="At least 10 characters, with letters and numbers."
      >
        <Input
          {...fieldAria('newPassword', errors.newPassword?.message, 'hint')}
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
        />
      </FormField>
      <FormField id="confirm" label="Confirm new password" error={errors.confirm?.message}>
        <Input
          {...fieldAria('confirm', errors.confirm?.message)}
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
        />
      </FormField>
      <Button type="submit" loading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
      <Link
        href="/login"
        className="mt-4 block text-center text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </>
  );
}
