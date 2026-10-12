// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorageStatus, getSupabaseConfig } from "@/lib/supabase.server";

afterEach(() => vi.unstubAllEnvs());

describe("storage status", () => {
  it("reports the database when both Supabase settings are present", () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const status = getStorageStatus();
    expect(status.mode).toBe("database");
    expect(status.missing).toEqual([]);
    expect(status.present).toEqual(expect.arrayContaining(["SUPABASE_SECRET_KEY", "SUPABASE_URL"]));
  });

  it.each([
    ["the secret key is missing", "https://proj.supabase.co", "", ["SUPABASE_SECRET_KEY"]],
    ["the URL is missing", "", "sb_secret_test", ["SUPABASE_URL"]],
    ["both are missing", "", "", ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]],
    ["a value is only spaces", "https://proj.supabase.co", "   ", ["SUPABASE_SECRET_KEY"]],
  ])("reports memory and names what is missing when %s", (_label, url, key, missing) => {
    vi.stubEnv("SUPABASE_URL", url);
    vi.stubEnv("SUPABASE_SECRET_KEY", key);
    const status = getStorageStatus();
    expect(status.mode).toBe("memory");
    expect(status.missing).toEqual(missing);
    expect(getSupabaseConfig()).toBeNull();
  });

  it("lists misnamed Supabase settings by name only, never their values", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "super-secret-value");
    vi.stubEnv("VITE_SUPABASE_URL", "https://other.supabase.co");
    const status = getStorageStatus();
    expect(status.present).toEqual(
      expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_URL"]),
    );
    expect(JSON.stringify(status)).not.toContain("super-secret-value");
    expect(JSON.stringify(status)).not.toContain("other.supabase.co");
  });

  it("trims stray whitespace and a trailing slash from the configured values", () => {
    vi.stubEnv("SUPABASE_URL", "  https://proj.supabase.co/ \n");
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_test\n");
    expect(getSupabaseConfig()).toEqual({
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_test",
    });
  });
});
