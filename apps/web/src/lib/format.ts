// Display formatting. Dates are shown in the institution time zone (configured in settings;
// the default matches the API default). Using a fixed zone keeps server and client output equal.

export const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? 'Asia/Phnom_Penh';

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  // Plain calendar dates (YYYY-MM-DD) must not shift across time zones.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  }
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTimeFmt.format(new Date(value)) : '—';
}

export function formatTime(value: string | Date | null | undefined): string {
  return value ? timeFmt.format(new Date(value)) : '—';
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
