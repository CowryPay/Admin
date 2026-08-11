import type { ReactNode } from "react";

/**
 * Wide tables scroll inside their own container — the page body never scrolls
 * horizontally, which matters on the Sends table (11 columns including hashes
 * and addresses).
 */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-cowry-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-cowry-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  numeric = false,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  /** Columns of figures get tabular figures so digits line up down the column. */
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 text-sm ${align === "right" ? "text-right" : "text-left"} ${
        numeric ? "tabular" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
