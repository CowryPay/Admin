"use client";

import { useState } from "react";
import { adminPdfFilename, downloadPdf, type PdfSection } from "@/lib/pdf";

/**
 * `sections` is built by the page from data it has already fetched, like the
 * rows passed to `ExportCsvButton`.
 */
export function ExportPdfButton({
  page,
  title,
  sections,
  subtitle,
  label = "Export PDF",
  disabled,
}: {
  page: string;
  title: string;
  sections: () => PdfSection[];
  subtitle?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadPdf(adminPdfFilename(page), title, sections(), subtitle);
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg border border-cowry-border px-3 py-1.5 text-xs font-medium text-white transition hover:border-cowry-green hover:text-cowry-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-cowry-border disabled:hover:text-white"
    >
      {busy ? "Exporting…" : label}
    </button>
  );
}
