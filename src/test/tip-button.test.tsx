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
import { afterEach, describe, expect, it } from "vitest";

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

afterEach(cleanup);

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

  it("keeps the existing tip flow: pick an amount, confirm, thank-you screen", async () => {
    renderAt("/blog");
    fireEvent.click(await screen.findByRole("button", { name: "Give a tip" }));
    fireEvent.click(screen.getByRole("button", { name: "£5" }));
    fireEvent.click(screen.getByRole("button", { name: "Tip £5" }));
    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
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
