import { reportServerReachable } from './serverReachable';

/** Client-side code for a request that never got an answer (offline, server unreachable). */
export const NETWORK_UNAVAILABLE = 'network.unavailable';

/** A field-level failure inside `validation.failed`. */
export interface FieldError {
  field: string;
  code: string;
}

/**
 * Every failed API call, as `{code, params}` (I1). Show it with `errorMessageKey(error.code)`;
 * never display `code` itself (I3).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }

  /** The field errors of a `validation.failed` response; empty for any other error. */
  get fieldErrors(): FieldError[] {
    const errors = this.params.errors;
    return Array.isArray(errors) ? errors.filter(isFieldError) : [];
  }
}

/**
 * Whatever a failed call threw, as an `ApiError`: the error itself when it is one, otherwise an
 * `unknown` error (status 0), which shows the generic message.
 */
export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

function isFieldError(value: unknown): value is FieldError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).field === 'string' &&
    typeof (value as Record<string, unknown>).code === 'string'
  );
}

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

function csrfToken(): string | undefined {
  const prefix = `${CSRF_COOKIE}=`;
  const cookie = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return cookie === undefined ? undefined : decodeURIComponent(cookie.slice(prefix.length));
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (method !== 'GET') {
    const token = csrfToken();
    if (token !== undefined) {
      headers.set(CSRF_HEADER, token);
    }
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, window.location.origin), {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    reportServerReachable(false);
    throw new ApiError(0, NETWORK_UNAVAILABLE);
  }
  // Any answer, even an error status, means the server is there.
  reportServerReachable(true);

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: unknown; params?: unknown };
    if (typeof body.code === 'string') {
      const params =
        typeof body.params === 'object' && body.params !== null
          ? (body.params as Record<string, unknown>)
          : {};
      return new ApiError(response.status, body.code, params);
    }
  } catch {
    // Not JSON (e.g. a proxy error page): fall through to the generic code.
  }
  return new ApiError(response.status, 'unknown');
}

/** Thin fetch wrapper for `/api`: CSRF header on writes, JSON in and out, typed errors. */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
