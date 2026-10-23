// API client. The access token lives only in memory (never localStorage);
// the refresh token is an httpOnly cookie the page can't read. When the
// access token expires, one shared refresh runs and the request is retried.

import type { SessionPayload } from "@ev/shared";

const BASE = "/api/v1";
const CSRF_HEADERS = { "X-Requested-With": "e-vigilance" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let onSessionChange: (session: SessionPayload | null) => void = () => {};

export function setSessionListener(listener: (session: SessionPayload | null) => void) {
  onSessionChange = listener;
}

export function applySession(session: SessionPayload | null) {
  accessToken = session?.accessToken ?? null;
  onSessionChange(session);
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? "error",
      err.message ?? "Something went wrong.",
      err.fields ?? {},
    );
  }
  return body;
}

let refreshing: Promise<SessionPayload | null> | null = null;

/** Exchanges the refresh cookie for a new session; null when signed out. */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: "POST",
          credentials: "same-origin",
          headers: { ...CSRF_HEADERS, "X-EV-App": "web" },
        });
        if (res.status === 409) {
          // Another tab refreshed at the same moment; its new cookie is now ours.
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        if (!res.ok) {
          applySession(null);
          return null;
        }
        const session = (await res.json()) as SessionPayload;
        applySession(session);
        return session;
      }
      applySession(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Cookie routes (sign out) need the anti-forgery header. */
  csrf?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "X-EV-App": "web",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(opts.csrf ? CSRF_HEADERS : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !retried && accessToken) {
    const session = await refreshSession();
    if (session) return api<T>(path, opts, true);
  }
  return parse(res) as Promise<T>;
}

/** Downloads a protected file (evidence) as a Blob — the token can't go in an <img src>. */
export async function apiBlob(
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown } = {},
  retried = false,
): Promise<Blob> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "X-EV-App": "web",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !retried && accessToken) {
    if (await refreshSession()) return apiBlob(path, opts, true);
  }
  if (!res.ok) await parse(res);
  return res.blob();
}

/**
 * Uploads one file as a raw stream with progress (fetch can't report upload
 * progress, so this uses XMLHttpRequest). Resolves with the parsed JSON.
 */
export function apiUpload<T>(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", BASE + path);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-EV-App", "web");
    if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
      const err = body?.error ?? {};
      reject(
        new ApiError(
          xhr.status,
          err.code ?? "error",
          err.message ?? "Upload failed.",
          err.fields ?? {},
        ),
      );
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "network", "The upload was interrupted. Check your connection."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}
