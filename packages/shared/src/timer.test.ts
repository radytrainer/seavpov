import { describe, expect, it } from 'vitest';
import { elapsedSeconds, formatClock, formatDuration, nextTimerState } from './timer';

describe('nextTimerState', () => {
  it('allows the documented transitions', () => {
    expect(nextTimerState('IDLE', 'start')).toBe('READING');
    expect(nextTimerState('READING', 'pause')).toBe('PAUSED');
    expect(nextTimerState('PAUSED', 'resume')).toBe('READING');
    expect(nextTimerState('READING', 'finish')).toBe('COMPLETED');
    expect(nextTimerState('PAUSED', 'finish')).toBe('COMPLETED');
    expect(nextTimerState('PAUSED', 'cancel')).toBe('CANCELLED');
  });

  it('rejects invalid transitions', () => {
    expect(nextTimerState('READING', 'start')).toBeNull();
    expect(nextTimerState('READING', 'resume')).toBeNull();
    expect(nextTimerState('PAUSED', 'pause')).toBeNull();
    expect(nextTimerState('COMPLETED', 'finish')).toBeNull();
    expect(nextTimerState('COMPLETED', 'resume')).toBeNull();
    expect(nextTimerState('CANCELLED', 'start')).toBeNull();
    expect(nextTimerState('IDLE', 'finish')).toBeNull();
  });
});

describe('elapsedSeconds', () => {
  const now = new Date('2026-03-01T10:00:00Z');

  it('adds the running segment while reading', () => {
    expect(
      elapsedSeconds(
        { status: 'READING', durationSeconds: 120, lastResumedAt: '2026-03-01T09:55:00Z' },
        now,
      ),
    ).toBe(420);
  });

  it('excludes paused time', () => {
    expect(
      elapsedSeconds({ status: 'PAUSED', durationSeconds: 300, lastResumedAt: null }, now),
    ).toBe(300);
  });

  it('never returns negative values for clock skew', () => {
    expect(
      elapsedSeconds(
        { status: 'READING', durationSeconds: 0, lastResumedAt: '2026-03-01T10:05:00Z' },
        now,
      ),
    ).toBe(0);
  });
});

describe('formatting', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(8 * 60)).toBe('8m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(85 * 60)).toBe('1h 25m');
  });
});
