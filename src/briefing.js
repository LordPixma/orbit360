// "What changed since yesterday" — a morning briefing for the console.
//
// Deterministic core (always on): each build we store a compact daily DIGEST of
// the board's key metrics in KV. The briefing diffs today's digest against the
// most recent prior DAY and emits plain-language change items. No key, no
// dependency, never hallucinates — it only ever states computed deltas.
//
// Optional narrative (off by default): if a Cloudflare Workers AI binding is
// present (env.AI), the cron rewrites those same facts into a 2-3 sentence
// prose briefing and caches it for the day. The AI is fed ONLY the computed
// facts, so it can't invent numbers, and the deterministic items stand alone if
// it's absent or errors.

import { hash } from './rss.js';

const DIGESTS_KEY = 'briefing:digests'; // [{date, ...metrics}], newest last
const MAX_DIGESTS = 30;

// Compact snapshot of the day's headline metrics.
export function digestOf(snap) {
  const q = snap.quotes || {}, spcx = q.SPCX || {};
  const l = snap.launchOps || {}, c = snap.constellation || {};
  const ct = snap.contracts || {}, rg = snap.regulatory || {}, sc = snap.supplyChain || {};
  const top = (ct.awards || [])[0] || {};
  return {
    date: snap.day,
    spcx: spcx.price ?? null, spcxPct: spcx.changePct ?? null, cap: spcx.marketCap ?? null,
    pulse: snap.pulse?.score ?? null, pulseStatus: snap.pulse?.status ?? null,
    ytd: l.ytd ?? null, daysSinceLast: l.daysSinceLast ?? null,
    lastLaunchNet: l.lastLaunch?.net ?? null, lastLaunchName: l.lastLaunch?.name ?? null,
    nextLaunchName: l.nextLaunch?.name ?? null,
    sats: c.count ?? null,
    contracts30: ct.last30 ?? null, topAwardId: top.id ?? null, topAwardAmount: top.amount ?? null,
    regPos: rg.counts?.pos ?? null, regNeg: rg.counts?.neg ?? null,
    breadth: snap.breadth ?? null,
    scShift: sc.counts?.shift ?? null, scRisk: sc.counts?.risk ?? null,
  };
}

// Roll the digest ring: append a new day, or update today's intraday values.
export async function rollDigest(env, snap) {
  if (!snap?.day) return;
  const digests = (await env.ORBIT_KV.get(DIGESTS_KEY, 'json')) || [];
  const today = digestOf(snap);
  const last = digests[digests.length - 1];
  if (!last || last.date !== today.date) digests.push(today);
  else digests[digests.length - 1] = today;
  while (digests.length > MAX_DIGESTS) digests.shift();
  await env.ORBIT_KV.put(DIGESTS_KEY, JSON.stringify(digests));
}

// Build the briefing for the current snapshot against the previous day.
export async function buildBriefing(env, snap) {
  const digests = (await env.ORBIT_KV.get(DIGESTS_KEY, 'json')) || [];
  const today = digestOf(snap);
  const prev = [...digests].reverse().find(d => d.date < today.date) || null;
  const items = diffDigests(today, prev);
  const cached = await env.ORBIT_KV.get(`briefing:narrative:${today.date}`, 'json');
  return {
    asOf: today.date,
    prevDate: prev ? prev.date : null,
    items,
    narrative: cached ? cached.text : null,
  };
}

// Optional AI prose summary — cron only, best-effort, cached per day.
export async function generateNarrative(env, snap) {
  if (!env.AI) return; // off unless the [ai] binding is configured
  const b = snap.briefing;
  if (!b || !b.prevDate || !b.items?.length) return;

  const h = hash(b.items.map(i => i.text).join('|'));
  const key = `briefing:narrative:${snap.day}`;
  const cached = await env.ORBIT_KV.get(key, 'json');
  if (cached && cached.hash === h) return; // facts unchanged -> skip the call

  const facts = b.items.map(i => `- ${i.text}`).join('\n');
  const prompt =
    `You are the duty officer for a SpaceX flight-operations console writing the morning briefing. ` +
    `In 2-3 tight sentences, summarise what changed since yesterday using ONLY the facts below. ` +
    `Plain prose, no markdown, no bullet points, no invented numbers.\n\n` +
    `Facts since ${b.prevDate}:\n${facts}`;

  try {
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 180,
    });
    const text = String((res && (res.response ?? res.text)) || '').trim();
    if (text) await env.ORBIT_KV.put(key, JSON.stringify({ text, hash: h, at: Date.now() }), { expirationTtl: 172800 });
  } catch (_) { /* AI is best-effort; the deterministic briefing stands on its own */ }
}

// --- the deterministic diff --------------------------------------------------

function diffDigests(t, p) {
  if (!p) {
    return [{ tone: 'info', label: 'Baseline',
      text: 'First day of history logged — from tomorrow this briefing compares against the prior session.' }];
  }
  const items = [];
  const push = (tone, label, text) => items.push({ tone, label, text });

  if (t.spcx != null && p.spcx != null && p.spcx > 0) {
    const pc = (t.spcx - p.spcx) / p.spcx * 100;
    if (Math.round(pc * 10) !== 0) push(pc > 0 ? 'up' : 'down', 'SPCX',
      `SPCX ${pc >= 0 ? '+' : ''}${pc.toFixed(1)}% since yesterday (${usd(p.spcx)} → ${usd(t.spcx)}).`);
  }

  if (t.pulse != null && p.pulse != null) {
    const d = t.pulse - p.pulse;
    const band = t.pulseStatus !== p.pulseStatus ? ` — crossed into ${String(t.pulseStatus || '').toUpperCase()}` : '';
    if (d !== 0 || band) push(d > 0 ? 'up' : d < 0 ? 'down' : 'flat', 'Pulse',
      `Operational Pulse ${p.pulse} → ${t.pulse} (${d >= 0 ? '+' : ''}${d})${band}.`);
  }

  if (t.lastLaunchNet && t.lastLaunchNet !== p.lastLaunchNet) {
    push('up', 'Launch', `New launch since yesterday: ${t.lastLaunchName || 'mission'}.`);
  }

  if (t.sats != null && p.sats != null) {
    const d = t.sats - p.sats;
    if (d !== 0) push(d > 0 ? 'up' : 'down', 'Constellation',
      `${d > 0 ? '+' : ''}${d} Starlink satellites overnight (now ${t.sats.toLocaleString('en-US')}).`);
  }

  if (t.topAwardId && t.topAwardId !== p.topAwardId) {
    push('up', 'Contracts', `New federal award logged${t.topAwardAmount ? ` (${usd(t.topAwardAmount)})` : ''}.`);
  } else if (t.contracts30 != null && p.contracts30 != null && t.contracts30 !== p.contracts30) {
    push(t.contracts30 > p.contracts30 ? 'up' : 'warn', 'Contracts',
      `Federal awards in the 30-day window: ${p.contracts30} → ${t.contracts30}.`);
  }

  if (t.regPos != null && p.regPos != null) {
    const dp = t.regPos - p.regPos, dn = t.regNeg - p.regNeg;
    if (dp || dn) push(dp >= dn ? 'up' : 'warn', 'Regulatory',
      `Regulatory stream: ${dp >= 0 ? '+' : ''}${dp} approval-side, ${dn >= 0 ? '+' : ''}${dn} restriction-side new (14d ▲${t.regPos}/▼${t.regNeg}).`);
  }

  if (t.scShift != null && p.scShift != null) {
    const d = t.scShift - p.scShift;
    if (d > 0) push('info', 'Supply chain',
      `${d} new supply-chain migration headline${d > 1 ? 's' : ''} (Taiwan→Vietnam watch; ${t.scShift} in 30d).`);
  }
  if (t.scRisk != null && p.scRisk != null) {
    const d = t.scRisk - p.scRisk;
    if (d > 0) push('warn', 'Supply chain', `${d} new supply-chain risk headline${d > 1 ? 's' : ''} flagged.`);
  }

  if (t.breadth != null && p.breadth != null) {
    const dp = Math.round((t.breadth - p.breadth) * 100);
    if (Math.abs(dp) >= 10) push(dp > 0 ? 'up' : 'down', 'Ecosystem',
      `Ecosystem breadth ${dp > 0 ? 'widened' : 'narrowed'} ${Math.abs(dp)} pts (now ${Math.round(t.breadth * 100)}% of names up).`);
  }

  if (!items.length) push('flat', 'Quiet',
    'No material change since yesterday across market, ops, contracts or regulation.');
  return items;
}

const usd = (n) => n == null ? 'n/a'
  : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : `$${Number(n).toFixed(2)}`;
