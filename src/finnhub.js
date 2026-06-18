// Finnhub data layer — US-listed names + news. Free tier: 60 calls/min.
// Docs: https://finnhub.io/docs/api
//
// We cache aggressively in KV so the dashboard and the cron never hammer the API:
//   quotes   ~60s   profiles ~24h   news ~10min

const BASE = 'https://finnhub.io/api/v1';

async function finnhub(path, env) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${env.FINNHUB_API_KEY}`;
  const res = await fetch(url, { cf: { cacheTtl: 30 } });
  if (!res.ok) throw new Error(`Finnhub ${res.status} on ${path.split('?')[0]}`);
  return res.json();
}

// --- quotes -----------------------------------------------------------------
// Returns { price, change, changePct, high, low, open, prevClose }
export async function getQuote(symbol, env) {
  const q = await finnhub(`/quote?symbol=${encodeURIComponent(symbol)}`, env);
  return {
    price: q.c ?? null,
    change: q.d ?? null,
    changePct: q.dp ?? null,
    high: q.h ?? null,
    low: q.l ?? null,
    open: q.o ?? null,
    prevClose: q.pc ?? null,
  };
}

// Company profile — used for market cap (treemap sizing). Cached a day in KV.
export async function getProfile(symbol, env) {
  const cacheKey = `profile:${symbol}`;
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached) return cached;
  let profile = { marketCap: null, name: null };
  try {
    const p = await finnhub(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`, env);
    profile = { marketCap: p.marketCapitalization ?? null, name: p.name ?? null };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(profile), { expirationTtl: 86400 });
  } catch (_) { /* profile2 may be thin for a same-day IPO; degrade gracefully */ }
  return profile;
}

// Pull quote + market cap for a list of symbols, tolerating individual failures.
export async function getQuotes(tickers, env) {
  const out = {};
  for (const t of tickers) {
    try {
      const [quote, profile] = await Promise.all([getQuote(t.symbol, env), getProfile(t.symbol, env)]);
      out[t.symbol] = { ...quote, marketCap: profile.marketCap, ok: quote.price != null };
    } catch (e) {
      out[t.symbol] = { ok: false, error: String(e.message || e) };
    }
  }
  return out;
}

// --- news -------------------------------------------------------------------
const fmtDate = (d) => d.toISOString().slice(0, 10);

// SpaceX-specific headlines, newest first. We query company news for SPCX and
// merge a keyword pass over general news so we catch Starlink / xAI / Musk items
// that aren't tagged to the brand-new ticker yet.
export async function getNews(env, days = 4) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  let items = [];

  try {
    const company = await finnhub(`/company-news?symbol=SPCX&from=${fmtDate(from)}&to=${fmtDate(to)}`, env);
    items = items.concat(company || []);
  } catch (_) {}

  try {
    const general = await finnhub(`/news?category=general`, env);
    const kw = /(spacex|starlink|starship|elon musk|\bxai\b|falcon 9)/i;
    items = items.concat((general || []).filter(n => kw.test(`${n.headline} ${n.summary}`)));
  } catch (_) {}

  // de-dupe by url, sort newest first
  const seen = new Set();
  items = items.filter(n => n.url && !seen.has(n.url) && seen.add(n.url));
  items.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

  return items.slice(0, 30).map(n => ({
    headline: n.headline,
    summary: n.summary,
    source: n.source,
    url: n.url,
    datetime: n.datetime,
    category: classify(`${n.headline} ${n.summary}`),
  }));
}

// Lightweight, transparent tagging so the feed is filterable by what drives price.
// Exported for testing.
export function classify(text) {
  const t = text.toLowerCase();
  if (/launch|falcon|starship|liftoff|booster|scrub/.test(t)) return 'launch';
  if (/contract|award|nasa|space force|nro|starshield|pentagon/.test(t)) return 'contract';
  if (/starlink|direct.?to.?cell|broadband|spectrum/.test(t)) return 'starlink';
  if (/xai|grok|ai data|data cent|gpu|compute/.test(t)) return 'ai';
  if (/fcc|faa|regulat|license|licence|approval|ban|court/.test(t)) return 'regulatory';
  if (/ipo|share|stock|valuation|earnings|analyst/.test(t)) return 'market';
  return 'general';
}
