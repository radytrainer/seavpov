'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { Button, type ButtonProps } from '@/components/ui/button';

export function LogoutButton({
  variant = 'ghost',
  className,
  showIcon = true,
}: {
  variant?: ButtonProps['variant'];
  className?: string;
  showIcon?: boolean;
}) {
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await api.post('/auth/logout');
    } finally {
      // Full navigation clears all client state and cached RSC payloads.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    }
  }
  return (
    <Button variant={variant} className={className} onClick={logout} loading={pending}>
      {showIcon && !pending && <LogOut aria-hidden />}
      Sign out
    </Button>
  );
}
