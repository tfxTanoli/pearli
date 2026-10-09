import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { PearliHeader } from "@/components/pearli-header";

export const Route = createFileRoute("/founders-note")({
  head: () => ({
    meta: [
      { title: "Founder’s Note — Pearli" },
      {
        name: "description",
        content:
          "A note from Miva Diambote, founder of Pearli — where the name came from, and what’s coming next.",
      },
      { property: "og:title", content: "Founder’s Note — Pearli" },
      {
        property: "og:description",
        content:
          "A note from Miva Diambote, founder of Pearli — where the name came from, and what’s coming next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FoundersNotePage,
});

function FoundersNotePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground">
      <PearliHeader showBack />

      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-14 pt-24">
        <h1 className="font-display text-4xl tracking-tight">Founder’s note</h1>

        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
          <p>Hello.</p>
          <p>
            It’s so great to have you here. My name is Miva Diambote and I’m
            the founder of Pearli.
          </p>
          <p>
            I found inspiration of the name Pearli from the term Pearlveil,
            which has Greek heritage. I really wanted to name my company after
            a Greek terms because I’ve always wanted to travel to Greece to
            explore their landmarks, such as Meteora, Parthenon and many more
            beautiful landmarks.
          </p>
          <p>
            I’ve built Pearli with one purpose - to level up your life. Along
            with AudioWallet, I have so many projects that I would love to
            share with you. I hope that you will join me on this journey by
            tapping on the button below to receive discounts from ChatGPT
            +more and to see the growth of Pearli.
          </p>
        </div>

        <button
          type="button"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Bell className="h-4 w-4" />
          Access discounts from ChatGPT + more
        </button>

        <p className="mt-10 text-center text-xs text-muted-foreground">© 2026</p>
      </main>
    </div>
  );
}
