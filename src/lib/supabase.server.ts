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

const REQUIRED_SETTINGS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

export function getSupabaseConfig(): SupabaseConfig | null {
  // Trimmed: a value pasted with a stray space or line break would otherwise break requests.
  const url = process.env["SUPABASE_URL"]?.trim();
  const secretKey = process.env["SUPABASE_SECRET_KEY"]?.trim();
  if (!url || !secretKey) return null;
  return { url: url.replace(/\/+$/, ""), secretKey };
}

export interface StorageStatus {
  /** "memory" means Supabase is not configured: nothing is saved permanently. */
  mode: "database" | "memory";
  /** Required settings that are absent or empty on the server. */
  missing: string[];
  /** Names (never values) of Supabase-related settings the server can see, to spot a misnamed one. */
  present: string[];
}

/** Whether the server can reach its database, for the admin page to warn when it cannot. */
export function getStorageStatus(): StorageStatus {
  const missing = REQUIRED_SETTINGS.filter((name) => !process.env[name]?.trim());
  const present = Object.keys(process.env)
    .filter((name) => /supabase/i.test(name))
    .sort();
  return { mode: missing.length ? "memory" : "database", missing, present };
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
