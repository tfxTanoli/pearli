import { supabaseRest, type SupabaseConfig } from "@/lib/supabase.server";
import type { PushSubscriptionRecord, SubscriptionStore } from "./push-service.server";

const TABLE = "push_subscriptions";
const PAGE_SIZE = 1000; // Supabase caps responses at 1000 rows by default.

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/** Persists active push subscriptions in the `push_subscriptions` table. */
export class SupabaseSubscriptionStore implements SubscriptionStore {
  constructor(private readonly config: SupabaseConfig) {}

  async save(record: PushSubscriptionRecord) {
    await supabaseRest(this.config, `${TABLE}?on_conflict=endpoint`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        endpoint: record.endpoint,
        p256dh: record.keys.p256dh,
        auth: record.keys.auth,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async remove(endpoint: string) {
    const deleted = await supabaseRest<Row[]>(
      this.config,
      `${TABLE}?endpoint=eq.${encodeURIComponent(endpoint)}&select=endpoint`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    );
    return (deleted?.length ?? 0) > 0;
  }

  async list() {
    const records: PushSubscriptionRecord[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows =
        (await supabaseRest<Row[]>(
          this.config,
          `${TABLE}?select=endpoint,p256dh,auth,created_at&order=endpoint`,
          { headers: { Range: `${from}-${from + PAGE_SIZE - 1}` } },
        )) ?? [];
      for (const row of rows) {
        records.push({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
          createdAt: row.created_at,
        });
      }
      if (rows.length < PAGE_SIZE) return records;
    }
  }
}
