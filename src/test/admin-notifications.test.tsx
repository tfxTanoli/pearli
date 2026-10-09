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

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const auth = (init.headers as Record<string, string>)["Authorization"];
    if (auth !== `Bearer ${TOKEN}`)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (url === "/api/push/settings" && (init.method ?? "GET") === "GET") {
      return Response.json({ subscribers: 3, welcome: WELCOME });
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
    fireEvent.change(within(welcome).getByLabelText("Opens when tapped"), {
      target: { value: "/offers" },
    });
    fireEvent.click(within(welcome).getByRole("button", { name: "Save welcome notification" }));

    expect(await within(welcome).findByRole("status")).toHaveTextContent("Saved.");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1].body))).toEqual({
      enabled: true,
      title: "Hello from Miva",
      body: "You’re subscribed.",
      url: "/offers",
    });
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

  it("sends nothing when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await unlock();
    const form = await screen.findByRole("form", { name: "Send a notification" });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "Oops" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send to all subscribers" }));
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/push/send")).toBe(false);
  });

  it("locks again and forgets the token", async () => {
    await unlock();
    fireEvent.click(await screen.findByRole("button", { name: "Lock" }));
    expect(screen.getByLabelText("Admin token")).toBeInTheDocument();
    expect(sessionStorage.getItem("pearli-admin-token")).toBeNull();
  });
});
