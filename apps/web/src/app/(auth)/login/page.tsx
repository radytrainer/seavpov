import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getRegistrationInfo } from '@/lib/api/server';
import { homeForRole } from '@/lib/navigation';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const [user, registration] = await Promise.all([getCurrentUser(), getRegistrationInfo()]);
  if (user) redirect(user.mustChangePassword ? '/change-password' : homeForRole(user.role));
  return (
    <>
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">Use your school account.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
      {registration.enabled && (
        <p className="mt-4 border-t pt-3 text-center text-sm">
          New student?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      )}
    </>
  );
}
