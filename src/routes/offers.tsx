import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import micIconAsset from "@/assets/audiowallet-icon.png.asset.json";
import { PearliHeader } from "@/components/pearli-header";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "Offers — Pearli" },
      {
        name: "description",
        content:
          "Current Pearli offers: become an AudioWallet affiliate and earn 30% commission when you share your affiliate link from the Payout section.",
      },
      { property: "og:title", content: "Offers — Pearli" },
      {
        property: "og:description",
        content:
          "Current Pearli offers: become an AudioWallet affiliate and earn 30% commission when you share your affiliate link from the Payout section.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OffersPage,
});

const AFFILIATE_STEPS = [
  "Sign up to AudioWallet.",
  "Open the Payout section and copy your affiliate link.",
  "Share your affiliate link — earn 30% commission.",
];

function OffersPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground">
      <PearliHeader showBack />

      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-14 pt-24">
        <h1 className="font-display text-4xl tracking-tight">Offers</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Current offers across Pearli’s web apps.
        </p>

        <section className="mt-6 w-full rounded-3xl border border-border bg-card px-5 py-5 shadow-card">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border">
              <img
                src={micIconAsset.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-xl">AudioWallet</span>
                <span className="rounded-full bg-users-badge px-2.5 py-1 text-[11px] font-semibold text-users-badge-foreground shadow-card">
                  30% commission
                </span>
              </div>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Affiliate offer
              </span>
            </div>
          </div>

          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Sign up as an AudioWallet affiliate and get 30% commission when you
            share your affiliate link from the Payout section.
          </p>

          <ol className="mt-4 space-y-2.5">
            {AFFILIATE_STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed text-foreground">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <a
            href="http://www.audiowallet.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign up to AudioWallet
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </section>

        <p className="mt-6 px-2 text-center text-sm italic leading-relaxed text-muted-foreground">
          More offers land here as new Pearli apps launch.
        </p>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          © 2026
        </p>
      </main>
    </div>
  );
}
