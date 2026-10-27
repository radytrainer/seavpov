/** Normalizes Next.js searchParams values to a single string. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function param(params: RawSearchParams, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== '' ? s.trim() : undefined;
}

export function pageParam(params: RawSearchParams): number {
  const n = Number(param(params, 'page') ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Builds `path?query` from defined values only. */
export function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
