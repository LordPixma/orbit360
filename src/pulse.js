// THE SPACEX PULSE — a single operational-health score (0–100) for a company
// whose real fundamentals are physical, not financial. It is deliberately built
// only from operations (launch cadence, constellation growth, contracts,
// ecosystem breadth) and NOT from the SPCX price — so you can plot the two
// against each other. When operations and the market diverge, that gap is signal.
//
// The formula is intentionally simple and transparent so you can tune the weights.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Each sub-signal returns 0..1. null means "no data yet" and is dropped from the
// weighted average (weights renormalise over whatever we actually have).
function subsignals({ launchOps, constellation, contracts, breadth }) {
  const s = {};

  // Launch momentum: blend of cadence (target ~12 launches/30d at full tempo)
  // and success rate. SpaceX runs a very high tempo, so cadence dominates.
  if (launchOps && launchOps.ytd != null) {
    const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
    const per30 = (launchOps.ytd / Math.max(dayOfYear, 1)) * 30;
    const cadence = clamp01(per30 / 12);
    const reliability = launchOps.successRate != null ? clamp01(launchOps.successRate / 100) : 1;
    s.launch = { value: 0.7 * cadence + 0.3 * reliability, weight: 0.30 };
  }

  // Constellation growth: net satellites added since last sample, normalised to
  // roughly a launch's worth (~20–60 birds). Flat or shrinking pulls the score.
  if (constellation && constellation.delta != null) {
    s.constellation = { value: clamp01((constellation.delta + 10) / 60), weight: 0.25 };
  }

  // Contract activity: any new federal award in 30d is a strong positive.
  if (contracts && contracts.last30 != null) {
    s.contracts = { value: clamp01(contracts.last30 / 3), weight: 0.15 };
  }

  // Ecosystem breadth: share of connected names trading up today. A broad-based
  // bid says the whole complex is risk-on with SpaceX.
  if (breadth != null) {
    s.ecosystem = { value: clamp01(breadth), weight: 0.20 };
  }

  return s;
}

export function computePulse(inputs) {
  const s = subsignals(inputs);
  const parts = Object.values(s);
  if (!parts.length) return { score: null, status: 'unknown', components: s };

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight) * 100);

  const status = score >= 70 ? 'nominal' : score >= 40 ? 'caution' : 'critical';
  return { score, status, components: s };
}

// --- correlation / divergence ----------------------------------------------
// Pearson correlation of each ecosystem name's daily closes vs SPCX, plus a
// divergence flag for names that usually track SPCX but broke ranks today.
// Series accumulate in KV over time, so this "warms up" over a few sessions.

export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null; // not enough history yet
  const xa = a.slice(-n), xb = b.slice(-n);
  const ma = xa.reduce((s, v) => s + v, 0) / n;
  const mb = xb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = xa[i] - ma, y = xb[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? null : num / den;
}

// Given today's % moves and historical correlations, flag divergences:
// a name with |corr| >= 0.5 whose sign today disagrees with SPCX's move.
export function findDivergences(spcxPct, moves, correlations) {
  const out = [];
  if (spcxPct == null) return out;
  for (const [symbol, corr] of Object.entries(correlations)) {
    const m = moves[symbol];
    if (corr == null || m == null) continue;
    if (Math.abs(corr) >= 0.5) {
      const expectedSign = corr >= 0 ? Math.sign(spcxPct) : -Math.sign(spcxPct);
      if (Math.sign(m) !== 0 && Math.sign(m) !== expectedSign) {
        out.push({ symbol, corr: Number(corr.toFixed(2)), move: m, expected: expectedSign });
      }
    }
  }
  return out;
}
