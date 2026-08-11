"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAdminKey } from "@/lib/adminKey";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/metrics", label: "Metrics" },
  { href: "/sends", label: "Sends" },
  { href: "/treasury", label: "Treasury" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 border-b border-cowry-border bg-cowry-dark/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <Link href="/overview" className="flex shrink-0 items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cowry-green" />
          <span className="text-sm font-semibold tracking-tight text-white">CowryPay Admin</span>
        </Link>

        <nav aria-label="Sections" className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-cowry-green/10 font-medium text-cowry-green"
                    : "text-cowry-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => {
            clearAdminKey();
            router.replace("/login");
          }}
          className="ml-auto rounded-lg border border-cowry-border px-3 py-1.5 text-xs font-medium text-cowry-muted transition hover:border-status-critical hover:text-status-critical"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
