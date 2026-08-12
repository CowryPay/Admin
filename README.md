# CowryPay Admin

Internal ops and investor dashboard. Reads the existing backend's `/admin/*`
routes and renders them — it has no database, no API routes of its own, and no
server-side state.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + recharts, matching
`cowrypay-frontend`'s conventions.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # points at the production backend by default
npm run dev
```

Open http://localhost:3000 and enter the admin key when prompted.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend base URL — the same one the consumer app uses. |

The admin key is **not** an environment variable. See below.

## Auth model

The backend has no per-admin-user system. Every `/admin/*` route compares an
`x-admin-key` header against a shared secret — there are **two**, both in the
backend's `middleware/requireAdminKey.ts`:

| Key | Covers | Guard |
| --- | --- | --- |
| `ADMIN_METRICS_KEY` | `/admin/overview`, `/admin/metrics`, `/admin/metrics/timeseries`, `/admin/treasury` | `requireMetricsKey` |
| `ADMIN_API_KEY` | all of the above **plus** `/admin/sends` and every write endpoint | `requireAdminKey` |

`ADMIN_API_KEY` is a strict superset, so signing in with it unlocks everything.
Signing in with the read-only metrics key works for three of the four pages;
**Sends** will show a "needs the full admin key" message, because the backend
still gates that read-only GET behind `requireAdminKey`.

Both failures return an identical `401`, so the dashboard tells them apart by
re-probing `/admin/overview` (which the metrics key does cover) before deciding.
A key that fails there too is genuinely dead and triggers a sign-out; a key that
still works there means the page is simply out of scope, and the session is left
alone. Signing someone out mid-session because one page needs a broader key
would be wrong.

This dashboard is built against that reality rather than wrapping it in a login
system the backend can't enforce:

- The login screen is one field — an admin key, no username.
- The key is verified by calling `GET /admin/overview` with it. 200 accepts it,
  401 rejects it. There is nothing else to call.
- A verified key is stored in `sessionStorage` and sent as `x-admin-key` on
  every request. `sessionStorage`, not `localStorage`, so a shared secret
  doesn't outlive the tab it was typed into.
- Any 401 from any page — a wrong key, or one rotated on the backend
  mid-session — clears the stored key and redirects to login.
- "Log out" clears it.

The key is never logged, never put in a URL or cookie, and never committed.
It is deliberately not a `NEXT_PUBLIC_*` variable: that would ship the shared
secret to every visitor inside the client bundle.

This gate stops a keyless tab from rendering the UI. It is **not** the security
boundary — the backend rejecting every request without a valid key is. Nothing
on these pages was fetched without one.

## Pages

| Page | Endpoint | What it answers |
| --- | --- | --- |
| Overview | `GET /admin/overview` | Ops health: users, wallets, ledger balances, sends, deposits, recipients — all attempts, not just settled. |
| Metrics | `GET /admin/metrics` + `GET /admin/metrics/timeseries` | Investor-facing, settled activity only: active users, settled counts, on-chain volume, revenue, and day-by-day trend. |
| Sends | `GET /admin/sends?chain=&limit=` | "Why didn't the fee reach treasury" — each send's fee beside what the fee-sweep step actually logged. |
| Treasury | `GET /admin/treasury` | Trust-but-verify: live on-chain treasury balances next to the ledger's totals. |

### CSV export

Overview, Metrics and Sends each export client-side — a serialization of the
JSON already on screen, not a second request. Sends respects the chain filter
and limit currently applied. Filenames are
`cowrypay-admin-<page>-<YYYY-MM-DD>.csv`.

Money is written as the plain decimal string the backend sent: no currency
symbol, no thousands separator, no rounding.

## Money handling

Money arrives from the backend as already-formatted decimal strings and is
rendered as-is. Nothing calls `Number()` on one — a float round-trip is exactly
what the backend's `formatAmount()` avoids, and reintroducing it here would make
the dashboard disagree with the ledger it reports on.

The one exception is chart geometry: a bar needs a pixel height, and that is a
number. That conversion is isolated in `toChartValue()` in `src/lib/decimal.ts`,
is used only to size marks, and is never what you read — tooltips and labels are
handed the original string. Treasury's ledger-vs-chain comparison is exact
BigInt arithmetic for the same reason.

## Backend dependencies

`GET /admin/treasury` **has shipped**, but not in the shape this issue agreed
(`{ treasury: [{ chain, address, onChainBalance }] }`). It returns two groups of
live per-wallet balances, mirroring the backend's `TreasurySnapshot`:

```json
{
  "feeTreasury":  [ { "chain": "celo", "address": "0x…", "usdc": "120.50", "native": null, "error": null } ],
  "operational":  [ { "chain": "celo", "address": "0x…", "usdc": "50.00",
                      "native": { "symbol": "CELO", "amount": "1.5" }, "error": null } ]
}
```

The Treasury page reads that shape. Three consequences worth knowing:

- **Every field but `chain` is nullable.** The backend isolates per-chain
  failures, so a chain whose RPC is down or whose address isn't configured comes
  back with `error` set and null balances while every other chain still reports.
  Each card renders that state rather than assuming a number.
- **`native` is the point of the operational group.** Those wallets pay out
  sends and need gas; when they run dry, payouts and wallet creation fail
  silently. Gas is shown per card, and a balance of exactly `0` is flagged. No
  "low" threshold is invented — nobody has said what counts as low per chain.
- **The ledger comparison is shown, not judged.** Operational wallets fund
  payouts and aren't the only place user deposits sit, so a balance below the
  ledger total is a normal state, and auto-flagging it as a shortfall would be
  noise. Both figures sit side by side for a human to read.

`GET /admin/metrics/timeseries` **already exists** on the backend (it was listed
as a stretch item needing new backend work, but it's live and returns
`{ days, timeseries: AdminMetricsDay[] }`). The Metrics trend chart uses it with
a 7/30/90-day range control.

### Open question for the backend

`/admin/sends` is a read-only GET but is still guarded by `requireAdminKey`,
while the other four dashboard reads moved to `requireMetricsKey`. That looks
like an oversight — the stated point of the metrics key is that a leaked
dashboard key can't reach *write* endpoints, and this isn't one. Until it moves,
a metrics-key session can't open the Sends page.

## Deploying

Vercel, from this repo. Set `NEXT_PUBLIC_API_URL` in the project's environment
variables — that is the only one needed. Every push gets a preview URL; the
backend's CORS reflects the request origin and allows the `x-admin-key` header,
so preview deployments work without a backend change.

## Conventions

`src/lib/adminApi.ts` mirrors `cowrypay-frontend`'s `src/lib/backendApi.ts` —
one typed function per endpoint over a shared fetch wrapper, with `x-admin-key`
in place of that file's Supabase bearer token. Response types are copied
field-for-field from the backend's `src/domain/admin/repository.ts` and nothing
is renamed on the way in, so the two files stay diffable when the backend adds a
field.

`src/lib/explorer.ts` keeps the same chain→explorer mapping as the consumer
app's copy, so a hash linked from either lands in the same place.

### Chart colors

Series colors are a fixed, validated set (`src/lib/chartTheme.ts`, mirrored in
`tailwind.config.ts`), checked against the `#141414` chart surface for lightness,
chroma, colorblind separation and contrast. Slots are assigned in fixed order and
never cycled or reassigned by magnitude.

The brand green `#00D437` is deliberately **not** a series color — it's too light
to sit on a dark card as a data mark (OKLCH L 0.756, above the 0.48–0.67 band).
It stays on chrome (nav, buttons, focus, links); `series.1` carries the same green
identity at a step that passes.
