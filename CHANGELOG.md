# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, and an
  `.editorconfig` for the public release.
- Zero-dependency unit-test suite (`test/`) on Node's built-in test runner,
  covering the Pulse math, correlation/divergence, RSS parsing, quote mapping,
  news classification, the regulatory/supply-chain taggers, and the briefing
  diff. A GitHub Actions workflow runs it on every push and PR.

### Changed
- `wrangler.toml` and configuration now use placeholders instead of personal
  data (email addresses, KV namespace id).
- A handful of pure helper functions are now exported so they can be unit-tested.

## [1.0.0] — Flight-ops console

The first complete board.

### Added
- **Market** panel (Finnhub): SPCX price, change, day range, market cap.
- **SpaceX Pulse**: a transparent 0–100 operational-health score (launch
  cadence, constellation growth, ecosystem breadth, contracts, regulatory
  balance), plotted against the SPCX price.
- **Launch Ops** and a **global Launch Manifest** (Launch Library 2 / The Space
  Devs) with live, per-second T-minus countdowns; defaults to the keyless `lldev`
  mirror and hardens against rate limits with a single-file queue, shared
  backoff, and last-good retention.
- **Constellation** (CelesTrak): live Starlink satellites in orbit + 24h delta.
- **Federal Awards** (USASpending): recent NASA / Space Force / NRO awards, with
  a bounded-timeout retry for the edge-flaky endpoint.
- **Regulatory Radar** and **Supply-Chain Migration** watch: keyless Google News
  RSS streams with country/direction and origin/destination/kind tagging, each
  paired with an editable seed board.
- **Ecosystem Heat** treemap (toggleable to a sortable table) and a
  **Divergence Watch** built from accumulated daily closes.
- **Signal** news feed with category filters.
- **Daily Briefing** — a deterministic "what changed since yesterday" diff, with
  an optional Cloudflare Workers AI narrative.
- Native **email alerts** via Cloudflare Email Routing.
- Client niceties: subsystem telemetry bar, sync controls (pause/resume,
  manual sync, countdown), keyboard shortcuts, and stale-vs-sample handling.

[Unreleased]: https://github.com/lordpixma/orbit360/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lordpixma/orbit360/releases/tag/v1.0.0
