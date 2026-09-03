import { chainLabel, chainMonogram } from "@/lib/chainDisplay";

/**
 * Chain identity as a monogram + name, not text alone — used anywhere a row
 * carries a chain, source or destination. The monogram is generated from the
 * chain string (see chainDisplay.ts), so it can't be missing for a chain this
 * file hasn't been special-cased for.
 */
export function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cowry-border bg-white/5 text-[10px] font-semibold text-cowry-muted"
      >
        {chainMonogram(chain)}
      </span>
      <span className="text-white">{chainLabel(chain)}</span>
    </span>
  );
}
