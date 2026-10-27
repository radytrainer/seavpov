'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Administrators only: exclude a session from all metrics, with a reason for the audit log. */
export function VoidSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const valid = reason.trim().length >= 5;

  async function submit() {
    setPending(true);
    try {
      await api.post(`/reading-sessions/${sessionId}/void`, { reason: reason.trim() });
      toast.success('Session voided');
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={`Void session: ${label}`}
      >
        <Ban aria-hidden /> Void
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void this session?</DialogTitle>
            <DialogDescription>
              {label}. The session stays in the history marked as voided and no longer counts toward
              time, streaks, goals or reports. Your reason is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <FormField id={`void-${sessionId}`} label="Reason" hint="At least 5 characters.">
            <Textarea
              id={`void-${sessionId}`}
              aria-describedby={`void-${sessionId}-hint`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Timer left running during class"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} loading={pending} disabled={!valid}>
              Void session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
