"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getAdminKey } from "@/lib/adminKey";

/**
 * Gate for every dashboard page.
 *
 * The check runs in an effect rather than during render because the key lives
 * in sessionStorage, which doesn't exist during the server render pass. Until
 * it has run, this renders nothing — otherwise a keyless visitor would see a
 * frame of dashboard chrome before being redirected.
 *
 * This only stops a keyless tab from rendering the UI; it isn't the security
 * boundary. The backend rejecting every request without a valid `x-admin-key`
 * is — there's no data on these pages that wasn't fetched with the key.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (getAdminKey()) {
      setAuthorized(true);
    } else {
      router.replace("/login");
    }
  }, [router]);

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-cowry-dark">
      <Nav />
      <main className="mx-auto max-w-7xl px-5 py-7">{children}</main>
    </div>
  );
}
