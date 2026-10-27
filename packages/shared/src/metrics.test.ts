import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  changePercent,
  consistencyPercent,
  percentOf,
  periodBounds,
  qualifyingDays,
  streaks,
  sumInPeriod,
  type DayTotal,
} from './metrics';

const day = (date: string, minutes: number, sessions = 1, pages = 0): DayTotal => ({
  date,
  seconds: minutes * 60,
  sessions,
  pages,
});

describe('qualifyingDays', () => {
  it('applies the minimum duration per day (summed across sessions)', () => {
    const days = [day('2026-03-01', 9), day('2026-03-02', 10), day('2026-03-03', 5, 2)];
    expect(qualifyingDays(days, 600)).toEqual(['2026-03-02']);
  });
});

describe('streaks', () => {
  it('handles empty data', () => {
    expect(streaks([], '2026-03-10')).toEqual({ current: 0, longest: 0 });
  });

  it('counts a streak ending today', () => {
    expect(streaks(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10')).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it('keeps the streak alive until the day is over', () => {
    expect(streaks(['2026-03-08', '2026-03-09'], '2026-03-10').current).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(streaks(['2026-03-07', '2026-03-08'], '2026-03-10').current).toBe(0);
  });

  it('tracks the longest run separately and across month/year boundaries', () => {
    const days = [
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ];
    expect(streaks(days, '2026-03-01')).toEqual({ current: 3, longest: 4 });
  });

  it('ignores duplicates and future dates', () => {
    expect(streaks(['2026-03-10', '2026-03-10', '2026-03-11'], '2026-03-10')).toEqual({
      current: 1,
      longest: 1,
    });
  });
});

describe('consistency and percentages', () => {
  it('computes the share of reading days in a range', () => {
    expect(consistencyPercent(['2026-03-02', '2026-03-04'], '2026-03-02', '2026-03-05')).toBe(50);
    expect(consistencyPercent([], '2026-03-02', '2026-03-05')).toBe(0);
    expect(consistencyPercent(['2026-03-02'], '2026-03-05', '2026-03-02')).toBe(0);
  });

  it('caps goal progress at 100 and handles missing targets', () => {
    expect(percentOf(30, 20)).toBe(100);
    expect(percentOf(10, 20)).toBe(50);
    expect(percentOf(10, 0)).toBeNull();
    expect(percentOf(10, null)).toBeNull();
  });

  it('computes change between periods', () => {
    expect(changePercent(150, 100)).toBe(50);
    expect(changePercent(0, 0)).toBe(0);
    expect(changePercent(10, 0)).toBeNull();
  });
});

describe('periods', () => {
  it('derives week (Monday start) and month bounds, including leap years', () => {
    const p = periodBounds('2028-03-01'); // Wednesday
    expect(p.week).toEqual({ from: '2028-02-28', to: '2028-03-05' });
    expect(p.lastWeek).toEqual({ from: '2028-02-21', to: '2028-02-27' });
    expect(p.month).toEqual({ from: '2028-03-01', to: '2028-03-31' });
    expect(p.lastMonth).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('handles the January → December boundary', () => {
    expect(periodBounds('2026-01-15').lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('sums only days inside a period', () => {
    const days = [day('2026-02-28', 30, 1, 10), day('2026-03-01', 20, 2, 5)];
    expect(sumInPeriod(days, { from: '2026-03-01', to: '2026-03-31' })).toEqual({
      seconds: 1200,
      sessions: 2,
      pages: 5,
    });
  });
});

describe('buildSeries', () => {
  it('fills empty days and buckets by week', () => {
    const days = [day('2026-03-02', 15), day('2026-03-04', 5), day('2026-03-10', 30)];
    const daily = buildSeries(days, '2026-03-02', '2026-03-04', 'day', 600);
    expect(daily.map((d) => d.seconds)).toEqual([900, 0, 300]);
    const weekly = buildSeries(days, '2026-03-02', '2026-03-15', 'week', 600);
    expect(weekly).toEqual([
      { period: '2026-03-02', seconds: 1200, sessions: 2, pages: 0, readingDays: 1 },
      { period: '2026-03-09', seconds: 1800, sessions: 1, pages: 0, readingDays: 1 },
    ]);
  });
});
