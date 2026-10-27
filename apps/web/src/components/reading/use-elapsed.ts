'use client';

import { useEffect, useState } from 'react';
import type { ReadingSession } from '@/lib/types';

/**
 * Display-only elapsed seconds. The server returns `elapsedSeconds` computed at `serverNow`;
 * we add the time passed on this device since the response arrived. A 1s interval only
 * repaints the clock — refreshing or closing the page never affects the recorded duration.
 */
export function useElapsed(session: ReadingSession | null, receivedAt: number): number {
  const [tick, setTick] = useState(() => Date.now());
  const running = session?.status === 'READING';

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!session) return 0;
  if (!running) return session.elapsedSeconds;
  return session.elapsedSeconds + Math.max(0, Math.floor((tick - receivedAt) / 1000));
}
