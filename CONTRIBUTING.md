# Contributing to Orbit360

Thanks for your interest in improving Orbit360! This is a small, dependency-free
Cloudflare Worker, so it's easy to get into. This guide covers the layout, the
local loop, and the conventions that keep the codebase consistent.

## Ground rules

- **Zero runtime dependencies.** The Worker ships no npm packages — only the
  Workers runtime and the platform bindings. Please keep it that way. Tests use
  Node's built-in `node:test`, so there are no dev dependencies either.
- **Every feed degrades gracefully.** A data source being down, rate-limited, or
  reshaped must never blank a card or throw — it should fall back to last-good
  data or an empty state. Match the existing pattern (try/catch per source,
  KV-cached last-good payloads, `stale` flags).
- **No secrets in the repo.** API keys are Wrangler secrets; local keys live in
  `.dev.vars` (git-ignored). Never commit a real key, KV namespace id, or
  personal email — use placeholders.
- **Match the house style.** Terse, commented modules; the comment explains the
  *why* (rate limits, edge quirks, weighting choices), not the *what*.

## Project layout

```
orbit360/
├── public/
│   └── index.html        # the entire dashboard SPA (vanilla JS, no build step)
├── src/
│   ├── index.js          # Worker entry: /api routes + the scheduled() cron
│   ├── tickers.js        # the ecosystem basket (symbols, tiers, linkage, feed)
│   ├── finnhub.js        # US quotes + SpaceX/ecosystem news + classify()
│   ├── twelvedata.js     # non-US quotes (optional; behind TWELVEDATA_API_KEY)
│   ├── spacedata.js      # Launch Library 2: launch ops + global manifest
│   ├── contracts.js      # USASpending federal awards
│   ├── regulatory.js     # keyless regulatory radar (Google News RSS)
│   ├── markets.js        # market-access seed board + country detection
│   ├── supplychain.js    # keyless supply-chain migration watch (RSS)
│   ├── pulse.js          # the operational-health score + correlation/divergence
│   ├── briefing.js       # "what changed since yesterday" digest + diff
│   ├── alerts.js         # native Cloudflare email alerts
│   └── rss.js            # tiny dependency-free RSS parser + helpers
├── test/                 # node:test unit tests (one file per module)
├── wrangler.toml         # Worker config: bindings, cron, vars
└── .dev.vars.example     # template for local secrets
```

The dashboard reads a single aggregate from `GET /api/dashboard`; the cron
(`scheduled()`) rebuilds that aggregate, accumulates history in KV, and fires
email alerts. See the [README](README.md) for the full architecture.

## Local development

You'll need Node 18+ and (for running the Worker) the
[Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI.

```bash
# 1. (optional) provide a Finnhub key for live US quotes/news
cp .dev.vars.example .dev.vars        # then paste your key

# 2. run the Worker locally
npx wrangler dev

# 3. run the test suite (no install needed)
npm test
```

Without a key — or without Wrangler — you can still open `public/index.html`;
the dashboard renders in **preview mode** with sample telemetry, which is handy
for UI work.

## Tests

Pure logic lives behind small, exported functions so it can be tested without
the network or the Workers runtime (the Pulse math, RSS parsing, quote mapping,
news classification, the regulatory/supply-chain taggers, and the briefing
diff). When you add or change logic in those modules, add or update a test in
`test/`. Anything that touches `fetch`, KV, or `cloudflare:*` bindings is left to
manual verification via `npx wrangler dev` / `npx wrangler tail`.

```bash
npm test                       # run everything
node --test test/pulse.test.js # run one file
```

CI runs `npm test` on every push and pull request to `main`.

## Submitting changes

1. Fork and branch from `main`.
2. Keep changes focused; one concern per PR.
3. Make sure `npm test` passes.
4. If you changed what the dashboard shows or how a feed behaves, update the
   README so it stays an accurate description of the board.
5. Open a PR describing the *why*, not just the *what*.

## Ideas worth picking up

See the **Roadmap** in the README. Good first contributions: adding a
national-regulator RSS source to the radar, extending the ecosystem basket in
`src/tickers.js` (with a clear `linkage`), or tuning the Pulse weights in
`src/pulse.js`.
