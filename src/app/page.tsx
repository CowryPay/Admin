import { redirect } from "next/navigation";

/**
 * There's no landing page for an internal tool — go straight to Overview. The
 * dashboard layout redirects on to /login if this tab has no verified key.
 */
export default function Home() {
  redirect("/overview");
}
