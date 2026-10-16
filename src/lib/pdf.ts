/*
 * Client-side PDF export. Like the CSV export, it serializes data the page has
 * already fetched — no second request — so the report shows exactly what was
 * on screen when the button was pressed. Money stays the backend's decimal
 * string, same as the CSV.
 *
 * jsPDF is loaded on click rather than at page load: it's a large library that
 * only matters to someone actually pressing the button.
 */

/** One titled table: `rows[0]` is the header, the rest are data. */
export interface PdfSection {
  heading: string;
  rows: string[][];
}

/** `cowrypay-admin-traction-2026-08-11.pdf` */
export function adminPdfFilename(page: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `cowrypay-admin-${page}-${today}.pdf`;
}

export async function downloadPdf(
  filename: string,
  title: string,
  sections: PdfSection[],
  subtitle?: string,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;

  doc.setFontSize(16);
  doc.text(`CowryPay — ${title}`, margin, 48);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Exported ${new Date().toLocaleString()}${subtitle ? ` · ${subtitle}` : ""}`, margin, 64);

  let y = 92;
  for (const section of sections) {
    const [head = [], ...body] = section.rows;
    // Keep a heading on the same page as at least the first few rows of its table.
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 48;
    }
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(section.heading, margin, y);

    autoTable(doc, {
      head: [head],
      body,
      startY: y + 8,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [16, 24, 32], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 249] },
    });
    // `lastAutoTable` is set by the plugin on the doc instance.
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Page ${page} of ${pages}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" },
    );
  }

  doc.save(filename);
}
