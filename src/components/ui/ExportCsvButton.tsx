"use client";

import { adminCsvFilename, downloadCsv } from "@/lib/csv";

/**
 * `rows` is built by the page from data it has already fetched — the export is
 * a pure serialization of what's on screen, not a second request.
 */
export function ExportCsvButton({
  page,
  rows,
  disabled,
}: {
  page: string;
  rows: () => string[][];
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => downloadCsv(adminCsvFilename(page), rows())}
      className="rounded-lg border border-cowry-border px-3 py-1.5 text-xs font-medium text-white transition hover:border-cowry-green hover:text-cowry-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-cowry-border disabled:hover:text-white"
    >
      Export CSV
    </button>
  );
}
