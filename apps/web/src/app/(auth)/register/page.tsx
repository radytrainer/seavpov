import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, getRegistrationInfo } from '@/lib/api/server';
import { homeForRole } from '@/lib/navigation';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create a student account' };

export default async function RegisterPage() {
  const [user, info] = await Promise.all([getCurrentUser(), getRegistrationInfo()]);
  if (user) redirect(homeForRole(user.role));

  return (
    <>
      <h1 className="text-lg font-semibold">Create a student account</h1>
      {info.enabled && info.classes.length > 0 ? (
        <>
          <p className="mt-0.5 mb-4 text-sm text-muted-foreground short:mb-3">
            You will sign in with your student ID.
          </p>
          <RegisterForm classes={info.classes} />
        </>
      ) : (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Self-registration is closed. Please ask your trainer or the school administrator for an
          account.
        </p>
      )}
      <p className="mt-3 border-t pt-3 text-center text-sm short:mt-2 short:pt-2">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
