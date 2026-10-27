'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Opens or closes student self-registration. Turning it on lets anyone with the link create a
 * student account, so both directions are confirmed.
 */
export function RegistrationToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function apply() {
    setPending(true);
    try {
      await api.patch('/admin/settings', { selfRegistrationEnabled: !enabled });
      toast.success(enabled ? 'Self-registration closed' : 'Self-registration opened');
      setConfirming(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Student self-registration</span>
          <Badge variant={enabled ? 'success' : 'neutral'}>{enabled ? 'Open' : 'Closed'}</Badge>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Allow students to register themselves"
          onClick={() => setConfirming(true)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
            enabled ? 'bg-primary' : 'bg-input',
          )}
        >
          <span
            className={cn(
              'inline-block size-5 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? 'Students can create their own account from the sign-in page and choose their class. Close it once every student has an account.'
          : 'Only administrators can create student accounts (one by one or by CSV import).'}{' '}
        <Link href="/admin/users?unassigned=true" className="text-primary hover:underline">
          Students without a trainer
        </Link>
      </p>

      <Dialog open={confirming} onOpenChange={(v) => !pending && setConfirming(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {enabled ? 'Close self-registration?' : 'Open self-registration?'}
            </DialogTitle>
            <DialogDescription>
              {enabled
                ? 'New students will no longer be able to create accounts. Existing accounts are not affected.'
                : 'Anyone with the link to this site can create a student account and choose a class. They are linked automatically to the trainers of that class. Check new accounts in Users and close registration when everyone is in.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={apply} loading={pending}>
              {enabled ? 'Close registration' : 'Open registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
