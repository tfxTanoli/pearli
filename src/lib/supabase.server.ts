/**
 * Minimal server-only client for Supabase's REST API (PostgREST).
 *
 * Uses the project's secret key, which bypasses row-level security, so this
 * module must only ever be imported by server code (files ending in
 * `.server.ts` and API routes). Tables are locked to the browser-facing keys.
 */

export interface SupabaseConfig {
  url: string;
  secretKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env["SUPABASE_URL"];
  const secretKey = process.env["SUPABASE_SECRET_KEY"];
  if (!url || !secretKey) return null;
  return { url: url.replace(/\/+$/, ""), secretKey };
}

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Supabase request failed (HTTP ${status}): ${body.slice(0, 300)}`);
  }
}

/** Calls `${SUPABASE_URL}/rest/v1/${path}` and returns the parsed JSON body (or null). */
export async function supabaseRest<T = unknown>(
  config: SupabaseConfig,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T | null> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: config.secretKey,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
  });
  const text = await response.text();
  if (!response.ok) throw new SupabaseError(response.status, text);
  return text ? (JSON.parse(text) as T) : null;
}
