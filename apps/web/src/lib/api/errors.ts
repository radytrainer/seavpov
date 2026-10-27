export interface FieldIssue {
  path: string;
  message: string;
}

/** Error returned by the API in the shape `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation issues, when the API returned them. */
  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details)
      ? (this.details as unknown[]).filter(
          (d): d is FieldIssue =>
            typeof d === 'object' && d !== null && 'path' in d && 'message' in d,
        )
      : [];
  }
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Non-JSON (proxy error page etc.)
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ??
        (res.status >= 500
          ? 'The server is unavailable. Please try again shortly.'
          : `Request failed (${res.status})`),
      err?.details,
    );
  }
  return body as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Network error. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}
