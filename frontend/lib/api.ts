import { clearSession, loadSession } from './session';

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const token = loadSession()?.token;
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const params = new URLSearchParams();
  Object.entries(opts.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString() ? `?${params}` : '';

  const res = await fetch(`/api${path}${qs}`, {
    method: opts.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? (isFormData ? opts.body as FormData : JSON.stringify(opts.body)) : undefined,
  });

  if (res.status === 401 && token) {
    clearSession();
    window.location.href = '/login';
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.message ?? 'Something went wrong. Try again.', res.status, data?.errors);
  }

  return data as T;
}

/** First validation message for a field, if any. */
export function fieldError(e: unknown, field: string): string | undefined {
  return e instanceof ApiError ? e.errors?.[field]?.[0] : undefined;
}
