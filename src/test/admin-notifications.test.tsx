import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as AdminRoute } from "@/routes/admin/notifications";

const AdminPage = AdminRoute.options.component as ComponentType;
const TOKEN = "the-correct-admin-token-0123456789abcdef";

const WELCOME = {
  enabled: true,
  title: "Welcome to Pearli",
  body: "You’re subscribed.",
  url: "/",
};

let fetchMock: ReturnType<typeof vi.fn>;
let storage: { mode: "database" | "memory"; missing: string[]; present: string[] };

beforeEach(() => {
  sessionStorage.clear();
  storage = { mode: "database", missing: [], present: ["SUPABASE_SECRET_KEY", "SUPABASE_URL"] };
  fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const auth = (init.headers as Record<string, string>)["Authorization"];
    if (auth !== `Bearer ${TOKEN}`)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (url === "/api/push/settings" && (init.method ?? "GET") === "GET") {
      return Response.json({ subscribers: 3, welcome: WELCOME, storage });
    }
    if (url === "/api/push/settings" && init.method === "PUT") {
      return Response.json({ welcome: JSON.parse(String(init.body)) });
    }
    if (url === "/api/push/send") {
      return Response.json({ total: 3, sent: 2, failed: 1, removed: 1 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function unlock(token = TOKEN) {
  render(<AdminPage />);
  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
}

describe("admin notifications page", () => {
  it("rejects a wrong token and stays locked", async () => {
    await unlock("wrong-token");
    expect(await screen.findByRole("alert")).toHaveTextContent("That admin token isn’t right.");
    expect(screen.queryByText("Send a notification")).toBeNull();
    expect(sessionStorage.getItem("pearli-admin-token")).toBeNull();
  });

  it("unlocks when the password was pasted with invisible characters, a long dash and quotes", async () => {
    // What a chat app can do to a copied password. Safari refuses to send such
    // characters and reports only "Type error", so they are cleaned first.
    const mangled =
      String.fromCodePoint(0x201c) +
      TOKEN.replace("-", String.fromCodePoint(0x2013)).slice(0, 12) +
      String.fromCodePoint(0x200b) +
      TOKEN.replace("-", String.fromCodePoint(0x2013)).slice(12) +
      String.fromCodePoint(0x201d) +
      " \n";
    await unlock(mangled);

    expect(await screen.findByText("subscribers")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
    // The cleaned password is what gets remembered for this tab.
    expect(sessionStorage.getItem("pearli-admin-token")).toBe(TOKEN);
  });

  it("unlocks whatever unknown invisible characters a paste brings along", async () => {
    // Direction isolates, an object-replacement character and a variation selector:
    // none of these were on any list, and all must simply be dropped.
    const junk = [0x2068, 0xfffc, 0xfe0f, 0x2069].map((c) => String.fromCodePoint(c));
    await unlock(
      junk[0] +
        TOKEN.slice(0, 7) +
        junk[1] +
        TOKEN.slice(7, 20) +
        junk[2] +
        TOKEN.slice(20) +
        junk[3],
    );

    expect(await screen.findByText("subscribers")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("says what was removed when a pasted password is still wrong", async () => {
    await unlock(`wrong${String.fromCodePoint(0x0430)}pass${String.fromCodePoint(0x1f600)}`);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That admin token isn’t right.");
    expect(alert).toHaveTextContent(
      "Some unusual characters were removed from what you entered (U+0430, U+1F600). If you pasted it, try typing it in by hand.",
    );
    // What was left over is still checked with the server, and never sent with odd characters.
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer wrongpass");
    expect(screen.queryByText("Type error")).toBeNull();
  });

  it("adds no hint for an ordinary wrong password", async () => {
    await unlock("  wrong-token \n");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That admin token isn’t right.");
  });

  it("never shows a browser's raw error when the request fails", async () => {
    // Safari's wording for a failed request; Chrome says "Failed to fetch".
    fetchMock.mockRejectedValue(new TypeError("Type error"));
    await unlock();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t reach the server. Check your connection and try again.",
    );
    expect(screen.queryByText("Type error")).toBeNull();
  });

  it("unlocks with the right token and shows subscribers and the welcome message", async () => {
    await unlock();
    expect(await screen.findByText("subscribers")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const welcome = screen.getByRole("form", { name: "Welcome notification" });
    expect(within(welcome).getByLabelText(/^Title/)).toHaveValue("Welcome to Pearli");
    expect(within(welcome).getByLabelText("Send a welcome notification")).toBeChecked();
    // Remembered for this tab only.
    expect(sessionStorage.getItem("pearli-admin-token")).toBe(TOKEN);
  });

  it("saves an edited welcome notification", async () => {
    await unlock();
    const welcome = await screen.findByRole("form", { name: "Welcome notification" });
    fireEvent.change(within(welcome).getByLabelText(/^Title/), {
      target: { value: "Hello from Miva" },
    });
    fireEvent.click(within(welcome).getByRole("button", { name: "Save welcome notification" }));

    expect(await within(welcome).findByRole("status")).toHaveTextContent("Saved.");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1].body))).toEqual({
      enabled: true,
      title: "Hello from Miva",
      body: "You’re subscribed.",
      url: "/",
    });
  });

  it("shows the welcome's fixed external destination instead of a page picker", async () => {
    await unlock();
    const welcome = await screen.findByRole("form", { name: "Welcome notification" });
    expect(within(welcome).getByText("https://efficient.app/deals")).toBeInTheDocument();
    expect(within(welcome).queryByRole("combobox")).toBeNull();

    // Ordinary notifications keep every existing option, with the external one at the bottom.
    const send = screen.getByRole("form", { name: "Send a notification" });
    const picker = within(send).getByLabelText("Opens when tapped");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Home", "Offers", "Founder’s note", "Blog", "Another page…", "External website…"]);
    expect(within(send).queryByText("https://efficient.app/deals")).toBeNull();
  });

  it("sends a notification to everyone after confirmation and reports the result", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "New offer" } });
    fireEvent.change(within(form).getByLabelText(/^Message/), {
      target: { value: "Take a look" },
    });
    fireEvent.change(within(form).getByLabelText("Opens when tapped"), {
      target: { value: "other" },
    });
    fireEvent.change(within(form).getByLabelText(/^Page path/), {
      target: { value: "/blog/first-post" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Send to all subscribers" }));

    expect(confirm).toHaveBeenCalledWith("Send “New offer” to 3 subscribers now?");
    expect(await within(form).findByRole("status")).toHaveTextContent(
      "Sent to 2 of 3. 1 expired subscription was removed.",
    );
    const send = fetchMock.mock.calls.find(([url]) => url === "/api/push/send")!;
    expect(JSON.parse(String(send[1].body))).toEqual({
      title: "New offer",
      body: "Take a look",
      url: "/blog/first-post",
    });
    // Form cleared and subscriber count updated (3 - 1 removed).
    expect(within(form).getByLabelText(/^Title/)).toHaveValue("");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("sends a notification that links to an external website", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "Deal" } });
    // No website field until the external option is chosen.
    expect(within(form).queryByLabelText(/^Website address/)).toBeNull();

    fireEvent.change(within(form).getByLabelText("Opens when tapped"), {
      target: { value: "external" },
    });
    const address = within(form).getByLabelText(/^Website address/);
    expect(address).toHaveValue("");
    expect(address).toBeRequired();
    expect(address).toHaveAttribute("type", "url");
    expect(address).toHaveAttribute("pattern", "https://.+");
    fireEvent.change(address, { target: { value: "https://efficient.app/deals?ref=push" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send to all subscribers" }));

    // The confirmation names the site, so a wrong link is noticed before sending.
    expect(confirm).toHaveBeenCalledWith(
      "Send “Deal” to 3 subscribers now?\n\nTapping it will open efficient.app.",
    );
    expect(await within(form).findByRole("status")).toHaveTextContent("Sent to 2 of 3.");
    const send = fetchMock.mock.calls.find(([url]) => url === "/api/push/send")!;
    expect(JSON.parse(String(send[1].body))).toEqual({
      title: "Deal",
      body: "",
      url: "https://efficient.app/deals?ref=push",
    });
    // The form resets to a Pearli page for the next notification.
    expect(within(form).getByLabelText("Opens when tapped")).toHaveValue("/");
    expect(within(form).queryByLabelText(/^Website address/)).toBeNull();
  });

  it("switches cleanly between a Pearli page, another page and an external website", async () => {
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    const picker = within(form).getByLabelText("Opens when tapped");

    fireEvent.change(picker, { target: { value: "external" } });
    fireEvent.change(within(form).getByLabelText(/^Website address/), {
      target: { value: "https://example.com" },
    });
    // Back to a Pearli page: the external link is dropped.
    fireEvent.change(picker, { target: { value: "/offers" } });
    expect(within(form).queryByLabelText(/^Website address/)).toBeNull();
    expect(picker).toHaveValue("/offers");

    // External, then "Another page": the path field starts from "/", not the https link.
    fireEvent.change(picker, { target: { value: "external" } });
    fireEvent.change(within(form).getByLabelText(/^Website address/), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(picker, { target: { value: "other" } });
    expect(within(form).getByLabelText(/^Page path/)).toHaveValue("/");
    expect(within(form).queryByLabelText(/^Website address/)).toBeNull();
  });

  it("shows the server's explanation when a link is rejected", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (url === "/api/push/settings")
        return Response.json({ subscribers: 3, welcome: WELCOME, storage });
      void init;
      return Response.json(
        { error: "Link must be a page on this site (e.g. /offers) or a full https:// address" },
        { status: 400 },
      );
    });
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "Deal" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send to all subscribers" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Link must be a page on this site (e.g. /offers) or a full https:// address",
    );
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "Oops" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send to all subscribers" }));
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/push/send")).toBe(false);
  });

  it("shows no storage warning when the database is connected", async () => {
    await unlock();
    await screen.findByText("subscribers");
    expect(screen.queryByText("Not connected to the database")).toBeNull();
  });

  it("warns clearly when the server has no database, naming what is missing", async () => {
    storage = {
      mode: "memory",
      missing: ["SUPABASE_SECRET_KEY"],
      present: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"],
    };
    await unlock();
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Not connected to the database");
    expect(warning).toHaveTextContent("Missing server setting: SUPABASE_SECRET_KEY.");
    expect(warning).toHaveTextContent(
      "Supabase settings the server can see: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL.",
    );
  });

  it("locks again and forgets the token", async () => {
    await unlock();
    fireEvent.click(await screen.findByRole("button", { name: "Lock" }));
    expect(screen.getByLabelText("Admin token")).toBeInTheDocument();
    expect(sessionStorage.getItem("pearli-admin-token")).toBeNull();
  });
});
