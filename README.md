# Orbit360

A single-pane **flight-ops console** for SpaceX (`SPCX`) and its public-market ecosystem.
Open it in the morning and know, at a glance, what's happening across the whole
complex — financial *and* operational. Built on Cloudflare Workers.

> Thesis: every dashboard monitors the stock. SpaceX's real fundamentals are
> physical — launches, satellites, contracts, regulation — and observable in
> public data no terminal tracks. **So we monitor the rocket, not just the ticker.**

---

## What's on the board

| Panel | Source | Notes |
|---|---|---|
| **Daily Briefing** | computed (+ optional AI) | *What changed since yesterday* — a day-over-day diff of every metric, in plain language at the top of the board |
| **Market** | Finnhub | SPCX price, change, range, market cap (15-min-class) |
| **SpaceX Pulse** | computed | Operational-health score 0–100, plotted *against* the price |
| **Launch Ops** | Launch Library 2 | Launches YTD, success rate, days-since-last, last launch, and a live **T‑minus countdown** to the next on the manifest |
| **Constellation** | CelesTrak | Live Starlink satellites in orbit + 24h delta |
| **Federal Awards** | USASpending | New NASA / Space Force / NRO awards (leading revenue signal) |
| **Regulatory Radar** | RSS (keyless) | Country-by-country market-access board + live docket/licensing stream |
| **Supply-Chain Migration** | RSS (keyless) | Taiwan→Vietnam relocation watch: supplier-geography board + live relocation/risk stream |
| **Ecosystem Heat** | Finnhub | Treemap (sized by market cap, coloured by today's move) with hover detail, **toggleable to a sortable table** that also surfaces the small/global names the treemap can't show |
| **Divergence Watch** | computed | Names that usually track SPCX but broke ranks today |
| **Signal** | Finnhub | SpaceX + ecosystem news, tagged by what drives price, with **category filters** |
| **Email alerts** | Cloudflare Email | Fires to you on significant events — incl. launches, awards, regulatory & supply-chain shifts (no third party) |

The ecosystem basket is tagged by *linkage* (direct supplier / partner / pure-play
competitor / legacy prime / AI-infra) in `src/tickers.js`.

### Console controls (client-side, no backend changes needed)

- **Telemetry status bar** — a per-feed health row (MARKET · LAUNCH · CONSTELLATION ·
  CONTRACTS · REGULATORY · SUPPLY-CHAIN · SIGNAL · PULSE, plus GLOBAL FEED when Twelve Data is on).
  Each is nominal / degraded / offline based purely on the snapshot, so you can see at
  a glance which source is degraded — the rest of the board keeps working regardless.
- **Sync controls** — a countdown to the next auto-sync, a manual *Sync* button
  (`R`), and a *pause/resume* toggle (`P`). Polling auto-pauses when the tab is hidden
  (to spare your Finnhub quota) and refreshes the moment you return.
- **Stale vs sample** — if a refresh fails after the board was live, it now *holds the
  last good live data* and flags it `STALE` rather than silently swapping to the sample
  preview. Sample/preview mode is only used before any live data has ever arrived.
- **T‑minus countdown** ticks every second toward the next launch's NET (cyan inside
  T‑1h), and a SPCX trend mini-spark sits under the Market panel.

Preferences (heat/table view, news filter) persist in `localStorage`.

---

## Deploy (≈10 minutes)

```bash
npm install
npx wrangler login
```

**1 · Create the KV store** and paste the id into `wrangler.toml`:
```bash
npx wrangler kv namespace create ORBIT_KV
```

**2 · Add your Finnhub key** (kept as a secret, never committed):
```bash
npx wrangler secret put FINNHUB_API_KEY
```

**3 · Turn on email alerts** (optional but recommended):
- In the Cloudflare dashboard: **Email → Email Routing**, enable it on a domain you own.
- Add your inbox under **Destination Addresses** and click the verification link.
- In `wrangler.toml`, set `destination_address`, `ALERT_TO` (same address) and
  `ALERT_FROM` (any address on that domain).

**4 · Ship it:**
```bash
npx wrangler deploy
```

That's it — the cron polls every 10 minutes, caches to KV, and emails you when
something significant happens.

### Local dev
```bash
cp .dev.vars.example .dev.vars   # paste your Finnhub key
npx wrangler dev
```

---

## The global feed (non-US names)

Filtronic, Sphere, Wistron NeWeb, Eutelsat, Airbus, Avio and MDA come via
[Twelve Data](https://twelvedata.com) — **already wired** in `src/twelvedata.js`.
Activate with:
```bash
npx wrangler secret put TWELVEDATA_API_KEY
```
One batched quote call covers all seven names (7 credits), cached 15 minutes —
~670 credits/day against the free tier's 800.

Two caveats, stated plainly:
- **Symbol mappings** (`td:` in `src/tickers.js`, `SYMBOL:EXCHANGE` form) follow
  Twelve Data's documented notation but weren't verified live from the build
  environment. If a name shows "pending", check it against
  `https://api.twelvedata.com/symbol_search?symbol=<name>` and adjust.
- **Exchange access**: Twelve Data gates some non-US exchanges (notably Korea and
  Taiwan) to paid plans. Any gated name fails per-symbol and shows as pending —
  the rest of the board is unaffected. EODHD (~€20/mo) is the upgrade path if you
  want those two reliably.

Twelve Data's quote endpoint carries no market cap, so treemap sizing for global
names uses the editable `approxCapUSD` values in `src/tickers.js`.

---

## How the Pulse is built

A transparent weighted score (tune the weights in `src/pulse.js`):

| Signal | Weight | What it measures |
|---|---|---|
| Launch momentum | 0.30 | cadence (target ~12/30d) × success rate |
| Constellation growth | 0.25 | net satellites added since last sample |
| Ecosystem breadth | 0.20 | share of connected names trading up |
| Contract activity | 0.15 | new federal awards in 30 days |
| Regulatory balance | 0.10 | 14-day approvals vs restrictions from the radar (neutral 0.5 when quiet) |

Weights renormalise over whatever feeds report, so a missing source never breaks
the score (it just relies on the rest). Bands: ≥70 nominal · 40–69 caution · <40 critical.

---

## The regulatory radar

Keyless by design. Targeted Google News RSS queries (in `src/regulatory.js`)
cover FCC dockets and international licensing news; each headline is auto-tagged
with a country (regulator names like ICASA/Anatel/TRAI are recognised) and a
direction — ▲ approval-side, ▼ restriction-side. The 14-day ▲/▼ balance feeds
the Pulse, and clear approvals/restrictions from the last 24h fire email alerts.

The **market-access board** (`src/markets.js`) is seed data, honestly labelled
with its as-of date on the dashboard. The stream informs it, but status changes
are a judgement call — edit the file and redeploy. Add national-regulator RSS
feeds to `SOURCES` any time; one dead feed never takes down the radar.

Two honest caveats: Google News RSS is an unofficial-but-stable interface (if it
ever changes shape, the radar degrades to empty rather than erroring), and
keyword direction-tagging is heuristic — expect the occasional mislabelled ▲/▼;
the headline text is always right there to judge for yourself.

---

## The supply-chain migration watch

SpaceX's physical fundamentals include *where the hardware is built*. The company
has pushed Starlink suppliers — notably Taiwanese terminal makers — to add
capacity outside Taiwan on geopolitical-risk grounds, with **Vietnam** the main
destination. That shift is visible in trade/industry news long before it shows up
anywhere financial, so `src/supplychain.js` tracks it the same keyless way the
regulatory radar works:

- **Supplier geo board** (`SUPPLY_BOARD`) — seed geography for each key supplier
  (`from → to`, status `migrating` / `diversifying` / `stable` / `risk`), honestly
  labelled with its as-of date. Edit and redeploy to update.
- **Live relocation stream** — targeted Google News RSS; each headline is filtered
  to physical-supply items, then tagged with origin/destination geography and a
  kind: ▲ `shift` (relocation / new capacity), ▼ `risk` (disruption / concentration),
  or ● procedural. The 30-day shift/risk tally drives the panel pill, and fresh
  shifts/risks from the last 24h fire an email alert.

Same honest caveat as the radar: the geography and shift/risk tagging are
heuristic, and the stream degrades to empty (never errors) if the feed shape
changes. The headline text is always shown so you can judge for yourself.

---

## The daily briefing — "what changed since yesterday"

`src/briefing.js` stores a compact **daily digest** of the board's headline metrics
in KV and diffs today against the most recent prior day, emitting plain-language
change items (SPCX move, Pulse delta + band change, overnight satellites, new
launches/awards, regulatory swing, supply-chain shifts, ecosystem breadth). It is
**deterministic and always on** — it only ever states computed deltas, so it can't
hallucinate, and it shows *“No material change”* on a genuinely quiet day. It warms
up after the first day of history accrues.

An **optional AI narrative** turns those same facts into a 2–3 sentence morning
brief. It's **off by default**; to enable it, uncomment the `[ai]` binding in
`wrangler.toml` (native **Cloudflare Workers AI** — no API key, generous free
allotment, no third party). The model is fed *only* the computed facts, the result
is cached per day, and if it's absent or errors the deterministic bullets stand on
their own.

---

## Honest build notes

- The feed integrations are written to each provider's **documented** request/response
  shape, but the build environment couldn't reach those hosts, so they weren't hit
  live. Run `npx wrangler tail` on first deploy and expect *possibly* a field-name
  tweak or two (most likely candidates: the USASpending field labels and the
  Launch Library SpaceX provider id, currently `lsp__id=121` — verify via
  `https://ll.thespacedevs.com/2.2.0/agencies/?search=SpaceX`).
- Correlation and the Pulse-vs-price chart **warm up** over a few sessions, since
  they accumulate daily closes in KV as the cron runs.
- `nodejs_compat` is enabled for `mimetext`; if email throws on a Buffer reference,
  that flag is why it's there.

## Roadmap
- ~~Supply-chain geo-migration watch (Taiwan → Vietnam)~~ — shipped (`src/supplychain.js`)
- ~~Optional AI "what changed since yesterday" briefing~~ — shipped (`src/briefing.js`; AI optional via Workers AI)
- Persist the digest/briefing history to a queryable timeline view
- National-regulator RSS feeds beyond Google News for the radar
