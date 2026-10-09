import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TipPearli } from "./tip-pearli";

/**
 * Shared Pearli header: wordmark (with a back arrow on sub-pages) on the left,
 * Tip Pearli button on the right.
 */
export function PearliHeader({ showBack = false }: { showBack?: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-5">
        {showBack ? (
          <Link
            to="/"
            className="-ml-1 flex items-center gap-2 rounded-full px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="font-display text-lg tracking-tight">Pearli</span>
          </Link>
        ) : (
          <span className="font-display text-lg tracking-tight">Pearli</span>
        )}
        <TipPearli />
      </div>
    </header>
  );
}
