'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { passwordSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldAria } from '@/components/ui/form-field';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });
type Values = z.infer<typeof schema>;

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit({ currentPassword, newPassword }: Values) {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed. Other devices have been signed out.');
      reset();
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
      }
    } catch (err) {
      if (!applyFieldErrors(err, setError, ['currentPassword', 'newPassword'])) {
        toast.error(errorMessage(err));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <FormField
        id="currentPassword"
        label="Current password"
        error={errors.currentPassword?.message}
      >
        <Input
          {...fieldAria('currentPassword', errors.currentPassword?.message)}
          type="password"
          autoComplete="current-password"
          {...register('currentPassword')}
        />
      </FormField>
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
        Change password
      </Button>
    </form>
  );
}
