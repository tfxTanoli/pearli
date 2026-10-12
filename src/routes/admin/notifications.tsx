import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { WELCOME_NOTIFICATION_URL } from "@/lib/push/welcome-destination";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Pearli admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminNotificationsPage,
});

// Kept for this browser tab only; never built into the page.
const TOKEN_KEY = "pearli-admin-token";

const PAGES = [
  { path: "/", label: "Home" },
  { path: "/offers", label: "Offers" },
  { path: "/founders-note", label: "Founder’s note" },
  { path: "/blog", label: "Blog" },
];

interface Message {
  title: string;
  body: string;
  url: string;
}

/** How the "Opens when tapped" link is being chosen. */
type LinkMode = "page" | "other" | "external";

function linkModeFor(url: string): LinkMode {
  if (PAGES.some((p) => p.path === url)) return "page";
  return /^https:\/\//i.test(url) ? "external" : "other";
}

/** Host name of an external https link, or null for a page on this site. */
function externalHost(url: string): string | null {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

interface Welcome extends Message {
  enabled: boolean;
}

interface Settings {
  subscribers: number;
  welcome: Welcome;
  storage?: { mode: "database" | "memory"; missing: string[]; present: string[] };
}

class UnauthorizedError extends Error {}

async function adminFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (response.status === 401) throw new UnauthorizedError("That admin token isn’t right.");
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (HTTP ${response.status})`);
  return body;
}

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode): the token just won't be remembered.
  }
}

function AdminNotificationsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const unlock = async (candidate: string) => {
    setChecking(true);
    setError(null);
    try {
      const loaded = await adminFetch<Settings>(candidate, "/api/push/settings");
      storeToken(candidate);
      setToken(candidate);
      setSettings(loaded);
    } catch (err) {
      storeToken(null);
      setError(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const stored = readStoredToken();
    if (stored) void unlock(stored);
  }, []);

  const lock = () => {
    storeToken(null);
    setToken(null);
    setSettings(null);
  };

  return (
    <div className="relative min-h-screen font-sans text-foreground">
      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-14 pt-12">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl tracking-tight">Notifications</h1>
          {token && (
            <button
              type="button"
              onClick={lock}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Lock
            </button>
          )}
        </div>
        <p className="mt-2 text-base text-muted-foreground">
          Send push notifications to everyone who tapped “Access discounts from ChatGPT + more”.
        </p>

        {token && settings ? (
          <>
            {settings.storage?.mode === "memory" && <StorageWarning storage={settings.storage} />}
            <p className="mt-6 rounded-3xl border border-border bg-card px-5 py-4 text-sm shadow-card">
              <span className="font-display text-2xl">{settings.subscribers}</span>{" "}
              <span className="text-muted-foreground">
                {settings.subscribers === 1 ? "subscriber" : "subscribers"}
              </span>
            </p>
            <WelcomeCard
              token={token}
              initial={settings.welcome}
              onSaved={(welcome) => setSettings({ ...settings, welcome })}
              onUnauthorized={lock}
            />
            <SendCard
              token={token}
              subscribers={settings.subscribers}
              onSent={(remaining) => setSettings({ ...settings, subscribers: remaining })}
              onUnauthorized={lock}
            />
          </>
        ) : (
          <UnlockForm busy={checking} error={error} onSubmit={unlock} />
        )}
      </main>
    </div>
  );
}

/** Shown when the server has no database: nothing on this page would be saved for good. */
function StorageWarning({ storage }: { storage: NonNullable<Settings["storage"]> }) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-3xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm"
    >
      <p className="font-semibold text-destructive">Not connected to the database</p>
      <p className="mt-1 leading-relaxed text-muted-foreground">
        Subscribers and changes made here are not being saved permanently, so the numbers on this
        page can change by themselves. Please contact your developer.
      </p>
      <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
        Missing server setting{storage.missing.length === 1 ? "" : "s"}:{" "}
        {storage.missing.join(", ")}.
        {storage.present.length > 0
          ? ` Supabase settings the server can see: ${storage.present.join(", ")}.`
          : " The server cannot see any Supabase settings."}
      </p>
    </div>
  );
}

function UnlockForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-6 rounded-3xl border border-border bg-card px-5 py-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Field label="Admin token">
        <input
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className={`mt-4 ${primaryButtonClass}`}
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}

function WelcomeCard({
  token,
  initial,
  onSaved,
  onUnauthorized,
}: {
  token: string;
  initial: Welcome;
  onSaved: (welcome: Welcome) => void;
  onUnauthorized: () => void;
}) {
  const [welcome, setWelcome] = useState<Welcome>(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const result = await adminFetch<{ welcome: Welcome }>(token, "/api/push/settings", {
        method: "PUT",
        body: JSON.stringify(welcome),
      });
      onSaved(result.welcome);
      setStatus({ ok: true, text: "Saved. New subscribers will get this message." });
    } catch (err) {
      if (err instanceof UnauthorizedError) return onUnauthorized();
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={save}
      aria-labelledby="welcome-heading"
      className="mt-6 rounded-3xl border border-border bg-card px-5 py-5 shadow-card"
    >
      <h2 id="welcome-heading" className="font-display text-2xl">
        Welcome notification
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sent once, straight after someone subscribes.
      </p>
      <label className="mt-4 flex items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={welcome.enabled}
          onChange={(e) => setWelcome({ ...welcome, enabled: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        Send a welcome notification
      </label>
      <MessageFields
        value={welcome}
        onChange={(m) => setWelcome({ ...welcome, ...m })}
        fixedDestination={WELCOME_NOTIFICATION_URL}
      />
      <StatusLine status={status} />
      <button
        type="submit"
        disabled={busy || !welcome.title.trim()}
        className={`mt-4 ${primaryButtonClass}`}
      >
        {busy ? "Saving…" : "Save welcome notification"}
      </button>
    </form>
  );
}

function SendCard({
  token,
  subscribers,
  onSent,
  onUnauthorized,
}: {
  token: string;
  subscribers: number;
  onSent: (remainingSubscribers: number) => void;
  onUnauthorized: () => void;
}) {
  const empty: Message = { title: "", body: "", url: "/" };
  const [message, setMessage] = useState<Message>(empty);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0); // remounts the fields after a send

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const who = subscribers === 1 ? "1 subscriber" : `${subscribers} subscribers`;
    const host = externalHost(message.url.trim());
    const opens = host ? `\n\nTapping it will open ${host}.` : "";
    if (!window.confirm(`Send “${message.title}” to ${who} now?${opens}`)) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await adminFetch<{ total: number; sent: number; removed: number }>(
        token,
        "/api/push/send",
        { method: "POST", body: JSON.stringify(message) },
      );
      onSent(result.total - result.removed);
      const removed = result.removed
        ? ` ${result.removed} expired ${result.removed === 1 ? "subscription was" : "subscriptions were"} removed.`
        : "";
      setStatus({ ok: true, text: `Sent to ${result.sent} of ${result.total}.${removed}` });
      setMessage(empty);
      setFormKey((k) => k + 1);
    } catch (err) {
      if (err instanceof UnauthorizedError) return onUnauthorized();
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not send" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={send}
      aria-labelledby="send-heading"
      className="mt-6 rounded-3xl border border-border bg-card px-5 py-5 shadow-card"
    >
      <h2 id="send-heading" className="font-display text-2xl">
        Send a notification
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Goes to every subscriber right away.</p>
      <MessageFields key={formKey} value={message} onChange={setMessage} />
      <StatusLine status={status} />
      <button
        type="submit"
        disabled={busy || !message.title.trim() || subscribers === 0}
        className={`mt-4 ${primaryButtonClass}`}
      >
        {busy ? "Sending…" : subscribers === 0 ? "No subscribers yet" : "Send to all subscribers"}
      </button>
    </form>
  );
}

function MessageFields({
  value,
  onChange,
  fixedDestination,
}: {
  value: Message;
  onChange: (m: Message) => void;
  /** Set when the click destination is not editable (the welcome notification). */
  fixedDestination?: string;
}) {
  const [mode, setMode] = useState<LinkMode>(() => linkModeFor(value.url));

  return (
    <div className="mt-4 space-y-3">
      <Field label="Title" hint={`${value.title.length}/100`}>
        <input
          required
          maxLength={100}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Message" hint={`${value.body.length}/300`}>
        <textarea
          rows={3}
          maxLength={300}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          className={`${inputClass} resize-none`}
        />
      </Field>
      {fixedDestination ? (
        <div>
          <span className="text-sm font-medium">Opens when tapped</span>
          <p className="mt-1.5 break-all rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
            {fixedDestination}
          </p>
        </div>
      ) : (
        <Field label="Opens when tapped">
          <select
            value={mode === "page" ? value.url : mode}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "other") {
                setMode("other");
                // Keep a page path that is already there; an external link is not a path.
                if (!value.url.startsWith("/")) onChange({ ...value, url: "/" });
              } else if (next === "external") {
                setMode("external");
                onChange({ ...value, url: "" });
              } else {
                setMode("page");
                onChange({ ...value, url: next });
              }
            }}
            className={inputClass}
          >
            {PAGES.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
            <option value="other">Another page…</option>
            <option value="external">External website…</option>
          </select>
        </Field>
      )}
      {!fixedDestination && mode === "other" && (
        <Field label="Page path" hint="e.g. /blog/my-post">
          <input
            required
            pattern="/(?!/).*"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            className={inputClass}
          />
        </Field>
      )}
      {!fixedDestination && mode === "external" && (
        <Field label="Website address" hint="must start with https://">
          <input
            required
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="https://.+"
            title="Enter the full address, starting with https://"
            maxLength={1000}
            placeholder="https://example.com/page"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            className={inputClass}
          />
        </Field>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function StatusLine({ status }: { status: { ok: boolean; text: string } | null }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`mt-3 text-sm ${status.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {status.text}
    </p>
  );
}

const inputClass =
  "w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";

const primaryButtonClass =
  "w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30";
