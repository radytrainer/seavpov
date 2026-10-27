import type { Metadata } from 'next';
import { apiGet } from '@/lib/api/server';
import { PageHeader } from '@/components/ui/states';
import { Card, CardContent } from '@/components/ui/card';
import { RegistrationToggle } from '@/components/admin/registration-toggle';
import { SettingsForm, type Settings } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { data } = await apiGet<{ data: Settings }>('/admin/settings');
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="System settings"
        description="Rules used for streaks, goals and timers across the institution. Changes are recorded in the audit log."
      />
      <Card className="mb-5">
        <CardContent className="pt-5">
          <RegistrationToggle enabled={data.selfRegistrationEnabled} />
        </CardContent>
      </Card>
      <SettingsForm settings={data} />
    </div>
  );
}
