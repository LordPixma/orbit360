// Twelve Data layer — the non-US names (LSE, TWSE, KOSDAQ, TSX, Euronext, Milan).
// Free tier: 8 credits/min, 800/day. A batched /quote call costs 1 credit per
// symbol, so one call for all 7 names = 7 credits. We cache the batch in KV for
// 15 minutes, which keeps daily usage around ~670 credits even at full tempo.
// Docs: https://twelvedata.com/docs#quote

const BASE = 'https://api.twelvedata.com';

export async function getGlobalQuotes(tickers, env) {
  if (!env.TWELVEDATA_API_KEY || !tickers.length) return {};

  const cacheKey = 'td:quotes';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetchedAt < 15 * 60e3) return cached.quotes;

  // Each ticker carries a `td` symbol in SYMBOL:EXCHANGE form (Twelve Data's
  // batch notation). Falls back to the plain symbol if no mapping is set.
  const reqSyms = tickers.map(t => t.td || t.symbol);
  const url = `${BASE}/quote?symbol=${encodeURIComponent(reqSyms.join(','))}&apikey=${env.TWELVEDATA_API_KEY}`;

  const out = {};
  try {
    const res = await fetch(url);
    const data = await res.json();
    // Single-symbol requests return the quote object directly; batches return
    // an object keyed by the requested symbol string.
    const byReq = reqSyms.length === 1 ? { [reqSyms[0]]: data } : data;
    for (const t of tickers) {
      out[t.symbol] = mapQuote(byReq[t.td || t.symbol], t);
    }
  } catch (e) {
    for (const t of tickers) out[t.symbol] = { ok: false, error: String(e.message || e) };
  }

  await env.ORBIT_KV.put(cacheKey, JSON.stringify({ quotes: out, fetchedAt: Date.now() }), { expirationTtl: 3600 });
  return out;
}

// Exported for testing. Maps a Twelve Data quote to our internal shape.
export function mapQuote(d, t) {
  // Twelve Data signals per-symbol problems inline: {code, message, status:"error"}.
  // Typical causes: symbol/exchange mismatch, or an exchange gated to a paid plan.
  if (!d || d.status === 'error' || d.code) {
    return { ok: false, pending: 'global-feed', error: d?.message || 'no data returned' };
  }
  const num = (x) => (x == null || x === '' ? null : Number(x));
  return {
    ok: true,
    price: num(d.close),
    change: num(d.change),
    changePct: num(d.percent_change),
    high: num(d.high),
    low: num(d.low),
    open: num(d.open),
    prevClose: num(d.previous_close),
    // Twelve Data's /quote has no market cap (that's a paid endpoint), so the
    // treemap uses the editable approximation on the ticker config instead.
    marketCap: t.approxCapUSD ?? null,
    currency: d.currency || null,
  };
}
