import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  diffDays,
  endOfMonth,
  isoWeekday,
  localDateTimeToUtc,
  startOfWeek,
  toLocalDate,
} from './dates';

describe('toLocalDate', () => {
  it('uses the configured time zone, not UTC', () => {
    // 2026-02-28 18:30 UTC is already 01:30 on 1 March in Phnom Penh (UTC+7).
    const instant = new Date('2026-02-28T18:30:00Z');
    expect(toLocalDate(instant, 'Asia/Phnom_Penh')).toBe('2026-03-01');
    expect(toLocalDate(instant, 'UTC')).toBe('2026-02-28');
  });
});

describe('calendar arithmetic', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('computes week and month bounds (weeks start Monday)', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-11-01')).toBe(7);
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('builds inclusive ranges and differences', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(diffDays('2026-02-27', '2026-03-02')).toBe(3);
  });
});

describe('localDateTimeToUtc', () => {
  it('converts local midnight to UTC', () => {
    expect(localDateTimeToUtc('2026-03-01', '00:00', 'Asia/Phnom_Penh').toISOString()).toBe(
      '2026-02-28T17:00:00.000Z',
    );
  });

  it('handles DST zones', () => {
    // New York is UTC-4 in July, UTC-5 in January.
    expect(localDateTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
    expect(localDateTimeToUtc('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
  });
});
