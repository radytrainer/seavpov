import type { SessionStatus, TimerAction } from './enums';

/**
 * Reading-session state machine. "IDLE" means the student has no READING/PAUSED session.
 * See docs/ARCHITECTURE.md for the transition table.
 */
export type TimerState = 'IDLE' | SessionStatus;

const TRANSITIONS: Record<TimerState, Partial<Record<TimerAction, SessionStatus>>> = {
  IDLE: { start: 'READING' },
  READING: { pause: 'PAUSED', finish: 'COMPLETED', cancel: 'CANCELLED' },
  PAUSED: { resume: 'READING', finish: 'COMPLETED', cancel: 'CANCELLED' },
  COMPLETED: {},
  CANCELLED: {},
};

/** Returns the next state, or null when the transition is not permitted. */
export function nextTimerState(from: TimerState, action: TimerAction): SessionStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

export interface TimerSnapshot {
  status: SessionStatus;
  /** Seconds accumulated in completed reading segments. */
  durationSeconds: number;
  /** Start of the current running segment (null while paused/finished). */
  lastResumedAt: Date | string | null;
}

/**
 * Elapsed reading seconds derived from persisted state. Used by the server for authoritative
 * durations and by the browser purely for display.
 */
export function elapsedSeconds(snapshot: TimerSnapshot, now: Date = new Date()): number {
  let total = snapshot.durationSeconds;
  if (snapshot.status === 'READING' && snapshot.lastResumedAt) {
    const resumed = new Date(snapshot.lastResumedAt).getTime();
    total += Math.max(0, Math.floor((now.getTime() - resumed) / 1000));
  }
  return Math.max(0, total);
}

/** Formats seconds as H:MM:SS (or M:SS under an hour). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Human duration such as "1h 25m" or "8m". */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
