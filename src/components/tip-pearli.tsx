import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, X } from "lucide-react";

const TIP_PRESETS = [
  { id: "1", label: "£1", value: 1 },
  { id: "5", label: "£5", value: 5 },
  { id: "10", label: "£10", value: 10 },
  { id: "custom", label: "Custom", value: null },
] as const;

function formatGBP(value: number) {
  return `£${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function TipPearli() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.04] active:scale-95"
      >
        <Heart className="h-3.5 w-3.5" />
        Give a tip
      </button>
      <TipModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const customValue = Number.parseFloat(custom);
  const amount =
    selected === "custom"
      ? Number.isFinite(customValue) && customValue > 0
        ? customValue
        : null
      : selected
        ? (TIP_PRESETS.find((p) => p.id === selected)?.value ?? null)
        : null;

  const close = () => {
    onClose();
    setSelected(null);
    setCustom("");
    setDone(false);
  };

  // The header uses backdrop-filter, which would trap a position:fixed dialog
  // inside its own box, so the overlay is mounted straight onto <body>.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Give a tip"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close tip window"
        onClick={close}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-pearl">
        <button
          type="button"
          onClick={close}
          aria-label="Close tip window"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="relative">
              <span
                aria-hidden
                className="sheen-ring absolute -inset-1.5 rounded-full opacity-70 blur-[6px]"
              />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Heart className="h-7 w-7 fill-current" />
              </span>
            </span>
            <h2 className="mt-5 font-display text-3xl">Thank you!</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your {amount != null ? formatGBP(amount) : ""} tip to Pearli
              means the world.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-3xl">Give a tip</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every tip keeps the apps growing. Pick an amount:
            </p>

            <div className="mt-5 grid grid-cols-4 gap-2">
              {TIP_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelected(preset.id)}
                  aria-pressed={selected === preset.id}
                  className={`rounded-2xl border px-2 py-3 text-[13px] font-semibold transition-colors ${
                    selected === preset.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {selected === "custom" && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-input bg-background px-4 py-3 focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm font-semibold text-muted-foreground">
                  £
                </span>
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) =>
                    setCustom(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  inputMode="decimal"
                  placeholder="Enter amount"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (amount != null) setDone(true);
              }}
              disabled={amount == null}
              className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {amount != null ? `Tip ${formatGBP(amount)}` : "Select an amount"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
