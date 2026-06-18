# Security Policy

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue**. Instead,
use GitHub's [private vulnerability reporting](https://github.com/lordpixma/orbit360/security/advisories/new)
to disclose it privately. Include reproduction steps and the potential impact;
you'll get an acknowledgement and a fix timeline.

## Handling secrets

Orbit360 is designed so that no credential ever needs to live in the repo:

- **API keys are Wrangler secrets**, set with `wrangler secret put NAME` and
  stored encrypted by Cloudflare — never in `wrangler.toml` or source.
- **Local development keys** go in `.dev.vars`, which is git-ignored. Use
  `.dev.vars.example` as the template.
- `wrangler.toml` is committed, so it holds only **non-secret** configuration
  (bindings, cron schedule, the alert from/to addresses, and the KV namespace
  id, which is an identifier and not a credential).

If you ever commit a secret by accident, **rotate it immediately** (re-issue the
key with the provider and run `wrangler secret put` again) — rotation is the
only reliable remediation, since the value may persist in git history.

## Scope

This is a read-only dashboard: it fetches public market/operational data and
serves an aggregate. It stores no user data and has no authentication surface.
The main security considerations are keeping provider keys out of the repo and
not introducing dependencies that could bring supply-chain risk.
