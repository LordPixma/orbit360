// Orbit360 Worker — serves the dashboard API and runs the alert cron.
//
//   fetch():      GET /api/dashboard -> the single aggregate the UI reads
//                 everything else    -> static assets (the dashboard)
//   scheduled():  rebuild the snapshot, update history, fire email alerts

import { getQuotes, getNews } from './finnhub.js';
import { getGlobalQuotes } from './twelvedata.js';
import { getConstellation, getLaunchOps } from './spacedata.js';
import { getContracts } from './contracts.js';
import { computePulse, pearson, findDivergences } from './pulse.js';
import { fireAlerts } from './alerts.js';
import { usTickers, globalTickers, ecosystem, TICKERS } from './tickers.js';

const SNAPSHOT_KEY = 'snapshot:latest';
const SNAPSHOT_TTL = 90; // seconds the UI will accept a cached snapshot

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/dashboard') {
      const snap = await getSnapshot(env, ctx);
      return json(snap);
    }
    if (url.pathname === '/api/health') {
      return json({ ok: true, hasFinnhub: !!env.FINNHUB_API_KEY, ts: Date.now() });
    }

    // everything else -> static assets (the dashboard SPA)
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const snap = await buildSnapshot(env);
      await env.ORBIT_KV.put(SNAPSHOT_KEY, JSON.stringify(snap));
      await updateSeries(env, snap);
      await fireAlerts(env, snap);
    })());
  },
};

// Serve a cached snapshot if fresh; otherwise rebuild on demand.
async function getSnapshot(env, ctx) {
  const cached = await env.ORBIT_KV.get(SNAPSHOT_KEY, 'json');
  if (cached && Date.now() - cached.builtAt < SNAPSHOT_TTL * 1000) return cached;

  const snap = await buildSnapshot(env);
  await env.ORBIT_KV.put(SNAPSHOT_KEY, JSON.stringify(snap));
  if (ctx) ctx.waitUntil(updateSeries(env, snap));
  return snap;
}

async function buildSnapshot(env) {
  const day = new Date().toISOString().slice(0, 10);

  // pull everything in parallel; each fetcher degrades gracefully on its own
  const [usQuotes, globalQuotes, news, constellation, launchOps, contracts] = await Promise.all([
    getQuotes(usTickers(), env),
    getGlobalQuotes(globalTickers(), env),
    getNews(env),
    getConstellation(env),
    getLaunchOps(env),
    getContracts(env),
  ]);

  // merge feeds; any global name that didn't resolve keeps a pending placeholder
  const quotes = { ...usQuotes, ...globalQuotes };
  for (const t of globalTickers()) {
    quotes[t.symbol] = quotes[t.symbol] || { ok: false, pending: 'global-feed' };
  }

  // ecosystem breadth (US names with a live quote)
  const eco = ecosystem().map(t => quotes[t.symbol]).filter(d => d?.ok && d.changePct != null);
  const breadth = eco.length ? eco.filter(d => d.changePct > 0).length / eco.length : null;

  const pulse = computePulse({ launchOps, constellation, contracts, breadth });

  // correlation + divergence from accumulated history
  const { correlations, divergences } = await analyseSeries(env, quotes);

  // pulse history (for the pulse-vs-price chart)
  const pulseHistory = (await env.ORBIT_KV.get('pulse:history', 'json')) || [];

  return {
    day,
    builtAt: Date.now(),
    tickers: TICKERS,
    quotes,
    breadth,
    news,
    constellation,
    launchOps,
    contracts,
    pulse,
    pulseHistory,
    correlations,
    divergences,
  };
}

// Accumulate daily closes per symbol + daily pulse, so correlation and the
// pulse-vs-price chart build up over time.
async function updateSeries(env, snap) {
  const day = snap.day;

  const series = (await env.ORBIT_KV.get('series:closes', 'json')) || {};
  for (const [sym, d] of Object.entries(snap.quotes)) {
    if (!d?.ok || d.price == null) continue;
    series[sym] = series[sym] || [];
    const last = series[sym][series[sym].length - 1];
    if (!last || last.date !== day) series[sym].push({ date: day, close: d.price });
    else last.close = d.price; // update today's point intraday
    while (series[sym].length > 120) series[sym].shift();
  }
  await env.ORBIT_KV.put('series:closes', JSON.stringify(series));

  if (snap.pulse?.score != null) {
    const ph = (await env.ORBIT_KV.get('pulse:history', 'json')) || [];
    const last = ph[ph.length - 1];
    const point = { date: day, score: snap.pulse.score, spcx: snap.quotes.SPCX?.price ?? null };
    if (!last || last.date !== day) ph.push(point); else ph[ph.length - 1] = point;
    while (ph.length > 120) ph.shift();
    await env.ORBIT_KV.put('pulse:history', JSON.stringify(ph));
  }
}

async function analyseSeries(env, quotes) {
  const series = (await env.ORBIT_KV.get('series:closes', 'json')) || {};
  const spcx = (series.SPCX || []).map(p => p.close);
  const correlations = {};
  const moves = {};
  for (const t of ecosystem()) {
    const s = (series[t.symbol] || []).map(p => p.close);
    correlations[t.symbol] = spcx.length && s.length ? pearson(spcx, s) : null;
    moves[t.symbol] = quotes[t.symbol]?.changePct ?? null;
  }
  const divergences = findDivergences(quotes.SPCX?.changePct ?? null, moves, correlations);
  return { correlations, divergences };
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
