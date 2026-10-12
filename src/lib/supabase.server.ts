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

// The server-side key. Lovable Cloud provides it as SUPABASE_SERVICE_ROLE_KEY;
// a self-managed Supabase project sets SUPABASE_SECRET_KEY, which wins if both exist.
const SECRET_KEY_NAMES = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

// Trimmed: a value pasted with a stray space or line break would otherwise break requests.
function readSetting(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function readSecretKey(): string | undefined {
  for (const name of SECRET_KEY_NAMES) {
    const value = readSetting(name);
    if (value) return value;
  }
  return undefined;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = readSetting("SUPABASE_URL");
  const secretKey = readSecretKey();
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
  const missing: string[] = [];
  if (!readSetting("SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!readSecretKey()) missing.push(SECRET_KEY_NAMES.join(" or "));
  // Only settings that actually hold a value: an empty one is as good as missing.
  const present = Object.keys(process.env)
    .filter((name) => /supabase/i.test(name) && readSetting(name))
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
      // Both headers, as the official client sends them: new-style secret keys
      // only need `apikey`, older service-role keys need the bearer token too.
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
  });
  const text = await response.text();
  if (!response.ok) throw new SupabaseError(response.status, text);
  return text ? (JSON.parse(text) as T) : null;
}
