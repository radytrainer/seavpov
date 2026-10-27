import { addDays, localDateTimeToUtc, toLocalDate } from '@rt/shared';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

/** Today's date (YYYY-MM-DD) in the institution time zone. */
export function todayLocal(): string {
  return toLocalDate(new Date(), DISPLAY_TIME_ZONE);
}

/** HH:MM of an instant in the institution time zone. */
export function localTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/**
 * Converts the date + start/end wall-clock times entered by a student into UTC instants.
 * An end time earlier than the start time means the session continued past midnight.
 */
export function toInstants(date: string, start: string, end: string) {
  const crossesMidnight = end <= start;
  const startedAt = localDateTimeToUtc(date, start, DISPLAY_TIME_ZONE);
  const endedAt = localDateTimeToUtc(
    crossesMidnight ? addDays(date, 1) : date,
    end,
    DISPLAY_TIME_ZONE,
  );
  return { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), crossesMidnight };
}
