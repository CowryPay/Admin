/**
 * Every chain the platform runs on.
 *
 * The backend's `group by chain` aggregates only return rows for chains that
 * actually have data, so a chain with no sends, no wallets or no revenue simply
 * vanishes from its breakdown. On an ops dashboard that's the wrong default:
 * "Optimism has zero sends" is a fact worth seeing, and a chart that silently
 * drops the row makes it look like Optimism isn't a chain we support at all.
 *
 * Ordered EVM-first, matching how the backend enumerates them.
 */
export const CHAINS = ["celo", "base", "optimism", "stellar", "solana"] as const;

export type Chain = (typeof CHAINS)[number];

function isKnownChain(chain: string): boolean {
  return (CHAINS as readonly string[]).includes(chain.toLowerCase());
}

/**
 * Pads a by-chain breakdown out to every supported chain, using `makeEmpty` for
 * the ones the backend didn't return.
 *
 * Chains the backend reports that aren't in CHAINS are kept and appended rather
 * than dropped — if a new chain ships on the backend before this list is
 * updated, it must still show up rather than disappear from every chart.
 */
export function withAllChains<T extends { chain: string }>(rows: T[], makeEmpty: (chain: string) => T): T[] {
  const byChain = new Map(rows.map((row) => [row.chain.toLowerCase(), row]));
  const known = CHAINS.map((chain) => byChain.get(chain) ?? makeEmpty(chain));
  const unknown = rows.filter((row) => !isKnownChain(row.chain));
  return [...known, ...unknown];
}
