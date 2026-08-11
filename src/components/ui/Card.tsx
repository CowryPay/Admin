import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-cowry-border bg-cowry-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-cowry-muted">{hint}</p> : null}
      </div>
      {action}
    </header>
  );
}

/**
 * A single headline number. The figure keeps proportional figures (it stands
 * alone, nothing to align it with) — `tabular` is for columns.
 */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-cowry-border bg-cowry-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-cowry-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-cowry-muted">{hint}</p> : null}
    </div>
  );
}
