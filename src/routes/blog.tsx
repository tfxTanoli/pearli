import { createFileRoute } from "@tanstack/react-router";
import { PearliHeader } from "@/components/pearli-header";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Pearli" },
      {
        name: "description",
        content:
          "The Pearli blog — posts about AudioWallet, Market Notes and the apps Pearli is building.",
      },
      { property: "og:title", content: "Blog — Pearli" },
      {
        property: "og:description",
        content:
          "The Pearli blog — posts about AudioWallet, Market Notes and the apps Pearli is building.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground">
      <PearliHeader showBack />

      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-14 pt-24">
        <h1 className="font-display text-4xl tracking-tight">Blog</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Posts about Pearli and the apps behind it.
        </p>

        <div className="mt-6 w-full rounded-3xl border border-dashed border-border bg-card/60 px-5 py-8 text-center">
          <span className="font-display text-xl">No posts yet</span>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            This page fills up as new posts are published.
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          © 2026
        </p>
      </main>
    </div>
  );
}
