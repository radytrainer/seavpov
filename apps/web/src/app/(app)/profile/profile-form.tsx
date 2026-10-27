'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Gender } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField, fieldAria } from '@/components/ui/form-field';

const schema = z.object({
  email: z.union([z.literal(''), z.email('Enter a valid email address')]),
  gender: z.enum(['', 'MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']),
});
type Values = z.infer<typeof schema>;

export function ProfileForm({ email, gender }: { email: string | null; gender: Gender | null }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: email ?? '', gender: gender ?? '' },
  });

  async function onSubmit(values: Values) {
    try {
      await api.patch('/auth/me', {
        email: values.email || null,
        gender: values.gender || null,
      });
      toast.success('Profile updated');
      reset(values);
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, setError, ['email', 'gender'])) toast.error(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <FormField id="email" label="Email" optional error={errors.email?.message}>
        <Input
          {...fieldAria('email', errors.email?.message)}
          type="email"
          autoComplete="email"
          {...register('email')}
        />
      </FormField>
      <FormField id="gender" label="Gender" optional>
        <Select id="gender" {...register('gender')}>
          <option value="">Not specified</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
          <option value="UNDISCLOSED">Prefer not to say</option>
        </Select>
      </FormField>
      <Button
        type="submit"
        loading={isSubmitting}
        disabled={!isDirty}
        className="justify-self-start"
      >
        Save changes
      </Button>
    </form>
  );
}
