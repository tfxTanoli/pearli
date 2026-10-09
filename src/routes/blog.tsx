import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PearliHeader } from "@/components/pearli-header";

/**
 * Shared layout for everything under /blog: the listing (blog/index.tsx) and
 * every post (blog/<slug>.tsx). The header — and with it the "Give a tip"
 * button — lives here, so new posts get it automatically without editing
 * each post.
 */
export const Route = createFileRoute("/blog")({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground">
      <PearliHeader showBack />
      <Outlet />
    </div>
  );
}
