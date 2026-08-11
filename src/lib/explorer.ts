/*
 * Block explorer links, per chain.
 *
 * The tx variant is the same mapping as cowrypay-frontend's src/lib/explorer.ts
 * — kept identical so a hash linked from the consumer app and one linked from
 * this dashboard always land in the same place. The address variant is new
 * here, for the treasury proof panel.
 */

export function explorerUrlFor(chain: string, txHash: string | null): string | null {
  if (!txHash) return null;
  switch (chain.toLowerCase()) {
    case "celo":     return `https://celoscan.io/tx/${txHash}`;
    case "base":     return `https://basescan.org/tx/${txHash}`;
    case "optimism": return `https://optimistic.etherscan.io/tx/${txHash}`;
    case "solana":   return `https://solscan.io/tx/${txHash}`;
    case "stellar":  return `https://stellar.expert/explorer/public/tx/${txHash}`;
    default:         return null;
  }
}

export function explorerAddressUrlFor(chain: string, address: string | null): string | null {
  if (!address) return null;
  switch (chain.toLowerCase()) {
    case "celo":     return `https://celoscan.io/address/${address}`;
    case "base":     return `https://basescan.org/address/${address}`;
    case "optimism": return `https://optimistic.etherscan.io/address/${address}`;
    case "solana":   return `https://solscan.io/account/${address}`;
    case "stellar":  return `https://stellar.expert/explorer/public/account/${address}`;
    default:         return null;
  }
}

/** Explorer brand name, for link labels ("View on CeloScan"). */
export function explorerNameFor(chain: string): string {
  switch (chain.toLowerCase()) {
    case "celo":     return "CeloScan";
    case "base":     return "BaseScan";
    case "optimism": return "Optimistic Etherscan";
    case "solana":   return "Solscan";
    case "stellar":  return "Stellar Expert";
    default:         return "explorer";
  }
}

/** Middle-truncation for addresses and tx hashes, which never fit a column. */
export function truncateHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
