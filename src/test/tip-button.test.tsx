import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type RouteComponent,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route as BlogLayoutRoute } from "@/routes/blog";
import { Route as BlogIndexRoute } from "@/routes/blog/index";
import { Route as FoundersNoteRoute } from "@/routes/founders-note";
import { Route as IndexRoute } from "@/routes/index";
import { Route as OffersRoute } from "@/routes/offers";

// The real root route renders the full <html> document shell, which jsdom
// cannot mount inside a test container, so the real page components are
// mounted under a bare root here instead.
const component = (route: { options: { component?: unknown } }) =>
  route.options.component as RouteComponent;

/** Stands in for a future post file such as src/routes/blog/my-new-post.tsx. */
function NewTestPost() {
  return (
    <main>
      <h1>A brand-new post</h1>
      <p>This post renders no tip button of its own.</p>
    </main>
  );
}

function renderAt(path: string) {
  const root = createRootRoute({ component: Outlet });
  const blog = createRoute({
    getParentRoute: () => root,
    path: "/blog",
    component: component(BlogLayoutRoute),
  });
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/", component: component(IndexRoute) }),
    createRoute({ getParentRoute: () => root, path: "/offers", component: component(OffersRoute) }),
    createRoute({
      getParentRoute: () => root,
      path: "/founders-note",
      component: component(FoundersNoteRoute),
    }),
    blog.addChildren([
      createRoute({ getParentRoute: () => blog, path: "/", component: component(BlogIndexRoute) }),
      createRoute({ getParentRoute: () => blog, path: "/new-test-post", component: NewTestPost }),
    ]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe('"Give a tip" button', () => {
  it.each(["/", "/blog", "/blog/new-test-post", "/offers", "/founders-note"])(
    "appears exactly once on %s and opens the tip window",
    async (path) => {
      renderAt(path);

      const buttons = await screen.findAllByRole("button", { name: "Give a tip" });
      expect(buttons).toHaveLength(1);
      expect(screen.queryByText(/Tip Pearli/)).toBeNull();

      fireEvent.click(buttons[0]!);
      const dialog = await screen.findByRole("dialog", { name: "Give a tip" });
      expect(dialog).toHaveTextContent("£1");
      expect(dialog).toHaveTextContent("£5");
      expect(dialog).toHaveTextContent("£10");
      expect(dialog).toHaveTextContent("Custom");
    },
  );

  it("shows a new blog post's own content under the shared header", async () => {
    renderAt("/blog/new-test-post");
    expect(await screen.findByRole("heading", { name: "A brand-new post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Give a tip" })).toBeInTheDocument();
  });

  it("starts Stripe Checkout for the chosen amount from the current page", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      // Same-origin URL so jsdom can "navigate" without a cross-origin error.
      Response.json({ url: "/checkout-redirect" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/blog");

    renderAt("/blog");
    fireEvent.click(await screen.findByRole("button", { name: "Give a tip" }));
    fireEvent.click(screen.getByRole("button", { name: "£5" }));
    fireEvent.click(screen.getByRole("button", { name: "Tip £5" }));

    expect(await screen.findByRole("button", { name: "Opening secure checkout…" })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/stripe/checkout");
    expect(JSON.parse(String(init?.body))).toEqual({ amount: 5, returnPath: "/blog" });
  });

  it("sends a custom amount and shows checkout errors in the window", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ error: "Tips must be between £1 and £500" }, { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/offers");
    fireEvent.click(await screen.findByRole("button", { name: "Give a tip" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByPlaceholderText("Enter amount"), { target: { value: "7.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Tip £7.50" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tips must be between £1 and £500");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({ amount: 7.5 });
    // The visitor can try again.
    expect(screen.getByRole("button", { name: "Tip £7.50" })).toBeEnabled();
  });

  it("shows the thank-you screen after returning from a paid checkout", async () => {
    window.history.replaceState(null, "", "/blog?tip=success&amount=5");

    renderAt("/blog");

    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
    expect(screen.getByText(/Your £5 tip to Pearli/)).toBeInTheDocument();
    expect(window.location.search).toBe(""); // cleaned up, so a refresh doesn't repeat it

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Thank you!")).toBeNull();
  });

  it("stays closed after a cancelled checkout", async () => {
    window.history.replaceState(null, "", "/blog?tip=cancelled");
    renderAt("/blog");
    await screen.findByRole("button", { name: "Give a tip" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("Push opt-in button", () => {
  it.each(["/", "/founders-note"])("keeps its label on %s", async (path) => {
    renderAt(path);
    expect(
      await screen.findByRole("button", { name: "Access discounts from ChatGPT + more" }),
    ).toBeInTheDocument();
  });

  it("explains gracefully when the browser has no Push API (jsdom)", async () => {
    renderAt("/");
    fireEvent.click(
      await screen.findByRole("button", { name: "Access discounts from ChatGPT + more" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This browser doesn’t support push notifications.",
    );
  });
});
