import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/server';
import { homeForRole } from '@/lib/navigation';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <>
      <h1 className="text-lg font-semibold">Change your password</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        {user.mustChangePassword
          ? 'Your account uses a temporary password. Choose a new one to continue.'
          : 'Choose a new password for your account.'}
      </p>
      <ChangePasswordForm redirectTo={homeForRole(user.role)} />
      <div className="mt-4 flex justify-center">
        <LogoutButton variant="link" />
      </div>
    </>
  );
}
