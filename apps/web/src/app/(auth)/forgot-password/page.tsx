'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { forgotPasswordSchema } from '@rt/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';

type Values = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      {sent ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          If an account uses that email, a reset link has been sent. The link expires in 30 minutes.
          If you do not receive it, ask your administrator to reset your password.
        </p>
      ) : (
        <>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Enter the email on your account and we will send you a reset link.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <FormField id="email" label="Email" error={errors.email?.message}>
              <Input
                {...fieldAria('email', errors.email?.message)}
                type="email"
                autoComplete="email"
                {...register('email')}
              />
            </FormField>
            <Button type="submit" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        </>
      )}
      <Link
        href="/login"
        className="mt-4 block text-center text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </>
  );
}
