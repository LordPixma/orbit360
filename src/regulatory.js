// Regulatory radar — the layer that catches licensing fights before they hit
// the mainstream financial feeds. Keyless by design: targeted Google News RSS
// queries cover FCC dockets and international market-access news. Each item is
// auto-tagged with a country and a direction:
//   positive  -> approval-side (licence granted, ban lifted, spectrum won)
//   negative  -> restriction-side (ban, block, suspension, fine, seizure)
//   neutral   -> procedural / unclear
// The 14-day positive/negative balance feeds the Pulse's regulatory input.
//
// Add national-regulator RSS feeds to SOURCES any time — same shape.

import { MARKET_BOARD, COUNTRY_PATTERNS } from './markets.js';
import { parseRss, hash } from './rss.js';

const SOURCES = [
  {
    name: 'market-access',
    url: 'https://news.google.com/rss/search?q=%22starlink%22%20(license%20OR%20licence%20OR%20regulator%20OR%20approval%20OR%20spectrum%20OR%20banned%20OR%20blocked)&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'fcc-dockets',
    url: 'https://news.google.com/rss/search?q=(spacex%20OR%20starlink)%20fcc&hl=en-US&gl=US&ceid=US:en',
  },
];

export async function getRegulatory(env) {
  const cacheKey = 'regulatory:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetchedAt < 30 * 60e3) return cached;

  let events = [];
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, {
        cf: { cacheTtl: 900 },
        headers: { 'User-Agent': 'Orbit360/1.0 (personal dashboard)' },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      events = events.concat(parseRss(xml).map(annotate).filter(Boolean));
    } catch (_) { /* one dead source never takes down the radar */ }
  }

  // de-dupe (Google News repeats stories across queries), newest first, trim
  const seen = new Set();
  events = events
    .filter(e => e.id && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 40);

  // 14-day approval/restriction balance -> Pulse regulatory input
  const cutoff = Date.now() - 14 * 864e5;
  const recent = events.filter(e => (e.date || 0) >= cutoff);
  const counts = {
    pos: recent.filter(e => e.direction === 'positive').length,
    neg: recent.filter(e => e.direction === 'negative').length,
  };

  const payload = { events, counts, board: MARKET_BOARD, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 7200 });
  return payload;
}

// --- annotation --------------------------------------------------------------

function annotate(item) {
  if (!item.title) return null;
  // Google News titles arrive as "Headline - Source"; split that out.
  let title = item.title, source = item.sourceName || null;
  const dash = title.lastIndexOf(' - ');
  if (!source && dash > 10) { source = title.slice(dash + 3); title = title.slice(0, dash); }

  const hay = `${title} ${item.description || ''}`;
  const direction = detectDirection(hay);
  const country = detectCountry(hay);
  // The direction regexes already demand strong keywords (approve/ban/grant/
  // revoke/seize...), so any non-neutral reading is significant by definition.
  const major = direction !== 'neutral';

  return {
    id: hash(item.link || title),
    title,
    source,
    link: item.link,
    date: item.pubDate ? Date.parse(item.pubDate) || null : null,
    country,
    direction,
    major,
  };
}

function detectDirection(text) {
  const s = text.toLowerCase();
  // "ban lifted / reversed / ended" is approval-side — check before the ban words
  if (/(ban|suspension|block)\w*.{0,16}(lift|revers|end|overturn)/.test(s) || /lift(s|ed)?\s+(its\s+)?ban/.test(s)) return 'positive';
  if (/approv|\bgrant(s|ed)?\b|clear(s|ed)\b|authoris|authoriz|green.?light|go.?ahead|permit(s|ted)|wins?\s+spectrum|secure[sd]?\s+(a\s+)?licen/.test(s)) return 'positive';
  if (/\bban(s|ned)?\b|block(s|ed)?\b|reject|suspend|revoke|fine[sd]?\b|lawsuit|antitrust|seiz|illegal|crackdown|denie[sd]|halt(s|ed)?\b/.test(s)) return 'negative';
  return 'neutral';
}

function detectCountry(text) {
  for (const [re, name] of COUNTRY_PATTERNS) if (re.test(text)) return name;
  return null;
}
