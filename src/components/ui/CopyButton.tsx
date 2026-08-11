"use client";

import { useEffect, useState } from "react";

/** Copies a treasury address to the clipboard, with a short confirmation. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard access can be denied (insecure context, permissions) —
          // staying silent is fine, the address is selectable on screen.
        }
      }}
      aria-label={`${label} ${value}`}
      className="shrink-0 rounded-lg border border-cowry-border px-2.5 py-1 text-xs font-medium text-cowry-muted transition hover:border-cowry-green hover:text-cowry-green"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
