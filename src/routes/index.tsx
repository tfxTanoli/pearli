import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bell, Lock } from "lucide-react";
import micIconAsset from "@/assets/audiowallet-icon.png.asset.json";
import { PearliHeader } from "@/components/pearli-header";
import { PushOptInButton } from "@/components/push-opt-in-button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pearli — Links" },
      {
        name: "description",
        content:
          "Pearli's links: AudioWallet, the web app for carrying your audio, and Market Notes, coming soon. Give a tip to support the work.",
      },
      { property: "og:title", content: "Pearli — Links" },
      {
        property: "og:description",
        content:
          "Pearli's links: AudioWallet, the web app for carrying your audio, and Market Notes, coming soon. Give a tip to support the work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PearliPage,
});

function PearliPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground">
      <PearliHeader />

      <main className="mx-auto flex w-full max-w-md flex-col items-center px-5 pb-14 pt-24">
        <h1 className="font-display text-4xl tracking-tight">Pearli</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Pearli showcases web apps built for you.
        </p>

        {/* Links */}
        <div className="mt-6 w-full space-y-3.5">
          <PushOptInButton className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-medium text-primary-foreground shadow-card transition-transform hover:scale-[1.02] active:scale-[0.98]">
            <Bell className="h-4 w-4" />
            Access discounts from ChatGPT + more
          </PushOptInButton>
          <p className="px-2 text-center text-sm italic leading-relaxed text-muted-foreground">
            Want more exclusive gifts? Turn on push notifications and receive
            exclusive gifts and join the growth of Pearli.
          </p>
          <MarketNotesCard />
          <AudioWalletCard />
        </div>

        {/* Small link buttons */}
        <div className="mt-6 flex w-full items-center justify-center gap-2.5">
          <Link
            to="/blog"
            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
          >
            Blog
          </Link>
          <Link
            to="/offers"
            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
          >
            Offers
          </Link>
          <Link
            to="/founders-note"
            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
          >
            Founder’s note
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">© 2026</p>
      </main>
    </div>
  );
}

function AudioWalletCard() {
  return (
    <a
      href="http://www.audiowallet.co.uk"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block w-full overflow-hidden rounded-3xl border border-border bg-card px-5 py-5 text-left shadow-card transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="absolute right-3 top-3 rounded-full bg-users-badge px-2.5 py-1 text-[11px] font-semibold text-users-badge-foreground shadow-card">
        100+ users
      </span>
      <div
        aria-hidden
        className="sheen-ring pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-45"
      />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border">
          <img
            src={micIconAsset.url}
            alt=""
            className="h-full w-full object-cover"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl text-foreground">
            AudioWallet
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Make money sending voice notes. Receive personalised voice notes.
          </span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </a>
  );
}

function MarketNotesCard() {
  return (
    <div className="w-full rounded-3xl border border-dashed border-border bg-card/60 px-5 py-5">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl">Market Notes</span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Coming soon
            </span>
          </div>
          <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
            Ask Market Notes for stocks and cryptocurrencies prices on the
            left and get an answer on the right.
          </span>
        </div>
      </div>
    </div>
  );
}
