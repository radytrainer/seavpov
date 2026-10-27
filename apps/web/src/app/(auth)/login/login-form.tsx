'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { loginSchema, type LoginInput } from '@rt/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { homeForRole, safeNext } from '@/lib/navigation';
import type { CurrentUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      const { data: user } = await api.post<{ data: CurrentUser }>('/auth/login', values);
      const destination = user.mustChangePassword
        ? '/change-password'
        : (safeNext(params.get('next')) ?? homeForRole(user.role));
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3.5" noValidate>
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <FormField
        id="identifier"
        label="Username, email or student ID"
        error={errors.identifier?.message}
      >
        <Input
          {...fieldAria('identifier', errors.identifier?.message)}
          className="h-12 text-base"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          autoFocus
          {...register('identifier')}
        />
      </FormField>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="password" className="text-sm leading-none font-medium">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          {...fieldAria('password', errors.password?.message)}
          className="h-12 text-base"
          autoComplete="current-password"
          enterKeyHint="go"
          {...register('password')}
        />
        {errors.password?.message && (
          <p id="password-error" role="alert" className="text-xs font-medium text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="mt-1 h-12 w-full" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
