import type { Metadata } from 'next';
import { ROLE_LABELS } from '@rt/shared';
import { requireUser } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser();
  const rows: [string, string | null][] = [
    ['Full name', user.fullName],
    ['Username', user.username],
    ['Role', ROLE_LABELS[user.role]],
    ...(user.role === 'STUDENT'
      ? ([
          ['Student ID', user.studentCode],
          ['Class', user.class?.name ?? null],
          ['Generation', user.class?.generation.name ?? null],
        ] as [string, string | null][])
      : []),
    ['Account status', user.status === 'ACTIVE' ? 'Active' : 'Inactive'],
    ['Member since', formatDate(user.createdAt)],
  ];

  return (
    <>
      <PageHeader title="Profile and settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Contact your administrator to change these details.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm email={user.email} gender={user.gender} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
