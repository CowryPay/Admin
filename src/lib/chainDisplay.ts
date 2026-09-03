/**
 * Chain label + icon, derived from the chain string itself rather than a
 * per-chain switch/lookup table. A lookup table is exactly how a chain (e.g.
 * Stellar, as a cross-chain source) ends up silently missing an icon — a case
 * nobody added yet. Deriving from the string instead means every chain in
 * `CHAINS`, and any the backend adds before this file catches up, renders
 * something automatically.
 */

export function chainLabel(chain: string): string {
  if (!chain) return chain;
  return chain.charAt(0).toUpperCase() + chain.slice(1).toLowerCase();
}

export function chainMonogram(chain: string): string {
  return chain.trim().charAt(0).toUpperCase() || "?";
}
