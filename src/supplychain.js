// Supply-chain geo-migration watch — the "where is the rocket actually built"
// layer. SpaceX has pushed Starlink hardware suppliers (notably Taiwanese
// terminal makers) to add capacity outside Taiwan, with Vietnam the main
// destination. That migration is observable in trade/industry news before it
// shows up anywhere financial. Keyless by design (Google News RSS), same shape
// as the regulatory radar.
//
// Each item is annotated with:
//   from / to  -> detected origin and destination geography (Taiwan -> Vietnam)
//   kind       -> 'shift' (relocation / new capacity), 'risk' (disruption /
//                 concentration), or 'note' (procedural / unclear)
//
// The seed SUPPLY_BOARD (honestly labelled with asOf on the dashboard) tracks
// each key supplier's current manufacturing geography; the live stream informs
// it, but status changes are a judgement call — edit and redeploy.

import { parseRss, hash } from './rss.js';

const SOURCES = [
  {
    name: 'sc-relocation',
    url: 'https://news.google.com/rss/search?q=(spacex%20OR%20starlink)%20(supplier%20OR%20manufacturing%20OR%20factory%20OR%20production%20OR%20terminal)%20(vietnam%20OR%20taiwan%20OR%20thailand%20OR%20india%20OR%20mexico)&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'sc-suppliers',
    url: 'https://news.google.com/rss/search?q=(%22wistron%20neweb%22%20OR%20%22universal%20microwave%22%20OR%20wiwynn)%20(vietnam%20OR%20taiwan%20OR%20relocat%20OR%20factory%20OR%20capacity)&hl=en-US&gl=US&ceid=US:en',
  },
];

// Supplier geography board — SEED data (edit src/supplychain.js to update).
// status: 'migrating' (active shift out of one geography) | 'diversifying'
//         (adding a second site) | 'stable' | 'risk'
export const SUPPLY_BOARD = {
  asOf: '2026-06',
  suppliers: [
    { name: 'Wistron NeWeb',          ticker: '6285.TW',   component: 'Starlink user terminals',      from: 'Taiwan',         to: 'Vietnam',        status: 'migrating',    note: 'SpaceX pushed terminal assembly out of Taiwan on geopolitical risk; Vietnam capacity ramping.' },
    { name: 'Universal Microwave',    ticker: null,        component: 'RF terminal components',       from: 'Taiwan',         to: 'Vietnam',        status: 'migrating',    note: 'Reported shifting Starlink-related output toward Vietnam.' },
    { name: 'Wiwynn',                 ticker: null,        component: 'Ground-station / compute HW',   from: 'Taiwan',         to: 'Vietnam',        status: 'diversifying', note: 'Adding non-Taiwan capacity for resilience.' },
    { name: 'Filtronic',              ticker: 'FTC.L',     component: 'GaN power amplifiers',          from: 'United Kingdom', to: 'United Kingdom', status: 'stable',       note: 'UK-based; expanding capacity at home for SpaceX volume.' },
    { name: 'Sphere Corp',            ticker: '347700.KS', component: 'Starship superalloys',          from: 'South Korea',    to: 'South Korea',    status: 'stable',       note: 'Korea-based long-term supply agreement.' },
    { name: 'STMicroelectronics',     ticker: 'STM',       component: 'Terminal chips',               from: 'Europe',         to: 'Europe',         status: 'stable',       note: 'Multi-site European / global fabs.' },
  ],
};

// Geography detection focused on the supply-chain map (first match per place).
const PLACES = [
  [/\btaiwan\b|taiwanese/i, 'Taiwan'],
  [/\bvietnam\b|vietnamese/i, 'Vietnam'],
  [/\bthailand\b|\bthai\b/i, 'Thailand'],
  [/\bindia\b|indian\b/i, 'India'],
  [/\bmexico\b|mexican\b/i, 'Mexico'],
  [/\bmalaysia\b/i, 'Malaysia'],
  [/\bchina\b|chinese\b/i, 'China'],
  [/united states|\btexas\b|\bamerica\b/i, 'United States'],
];

export async function getSupplyChain(env) {
  const cacheKey = 'supplychain:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetchedAt < 60 * 60e3) return cached;

  let events = [];
  let anyOk = false;
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, {
        cf: { cacheTtl: 1800 },
        headers: { 'User-Agent': 'Orbit360/1.0 (personal dashboard)' },
      });
      if (!res.ok) continue;
      anyOk = true;
      const xml = await res.text();
      events = events.concat(parseRss(xml).map(annotate).filter(Boolean));
    } catch (_) { /* one dead source never takes down the watch */ }
  }

  // Google News RSS is flaky from cloud IPs. If every source failed, keep the last
  // good stream instead of wiping it; a successful-but-empty fetch is left as quiet.
  if (!anyOk && cached && cached.events?.length) {
    const kept = { ...cached, board: SUPPLY_BOARD, stale: true, fetchedAt: Date.now() };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(kept), { expirationTtl: 7200 });
    return kept;
  }

  // de-dupe (Google News repeats across queries), newest first, trim
  const seen = new Set();
  events = events
    .filter(e => e.id && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 30);

  // 30-day shift / risk tally — the headline migration signal
  const cutoff = Date.now() - 30 * 864e5;
  const recent = events.filter(e => (e.date || 0) >= cutoff);
  const counts = {
    shift: recent.filter(e => e.kind === 'shift').length,
    risk: recent.filter(e => e.kind === 'risk').length,
  };

  const payload = { board: SUPPLY_BOARD, events, counts, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 7200 });
  return payload;
}

// --- annotation --------------------------------------------------------------

function annotate(item) {
  if (!item.title) return null;
  let title = item.title, source = item.sourceName || null;
  const dash = title.lastIndexOf(' - ');
  if (!source && dash > 10) { source = title.slice(dash + 3); title = title.slice(0, dash); }

  const hay = `${title} ${item.description || ''}`;
  // Must be about physical supply, not generic SpaceX news. ("factor" catches
  // factory/factories; "manufactur" catches manufacturing/manufacturer/etc.)
  if (!/(supplier|manufactur|factor|production|assembl|terminal|component|relocat|capacity|plant|\bfab\b)\w*/i.test(hay)) return null;

  const { from, to } = detectPlaces(hay);
  if (!from && !to) return null; // no geography -> not a migration signal

  const kind = detectKind(hay);
  return {
    id: hash(item.link || title),
    title,
    source,
    link: item.link,
    date: item.pubDate ? Date.parse(item.pubDate) || null : null,
    from, to, kind,
    major: kind === 'shift' || kind === 'risk',
  };
}

// Exported for testing.
export function detectKind(text) {
  const s = text.toLowerCase();
  if (/relocat|shift|moving|move[ds]?|diversif|outside taiwan|out of taiwan|new (factory|plant|line)|expand|expansion|ramp|capacity|incentive|courts?|set(s|ting)? up|opens? (a )?(factory|plant)|build(s|ing)? (a )?(factory|plant)/.test(s)) return 'shift';
  if (/disrupt|halt|shortage|tension|tariff|earthquake|seiz|concentrat|chokepoint|risk|blockade/.test(s)) return 'risk';
  return 'note';
}

// Designate Taiwan as the origin when present; the other named place is the
// destination. Otherwise take the first two places in mention order.
// Exported for testing.
export function detectPlaces(text) {
  const found = [];
  for (const [re, name] of PLACES) if (re.test(text) && !found.includes(name)) found.push(name);
  let from = null, to = null;
  if (found.includes('Taiwan')) { from = 'Taiwan'; to = found.find(p => p !== 'Taiwan') || null; }
  else { to = found[0] || null; from = found[1] || null; }
  return { from, to };
}
