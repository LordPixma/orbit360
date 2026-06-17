// Government revenue signal — federal awards to SpaceX, via the free USASpending
// API (no key). New NASA / Space Force / NRO / Starshield awards are public and
// lead reported revenue. Docs: https://api.usaspending.gov/

const USASPENDING = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

export async function getContracts(env) {
  const cacheKey = 'contracts:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  // serve a good list for 12h; serve an empty/failed result for only 30 min so we
  // retry the (flaky-from-the-edge) API periodically without re-hitting it every build.
  if (cached && Date.now() - cached.fetchedAt < (cached.awards?.length ? 12 * 3600e3 : 30 * 60e3)) return cached;

  const now = new Date();
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const body = {
    filters: {
      recipient_search_text: ['SPACE EXPLORATION TECHNOLOGIES'],
      award_type_codes: ['A', 'B', 'C', 'D'], // contract award types
      time_period: [{ start_date: start.toISOString().slice(0, 10), end_date: now.toISOString().slice(0, 10) }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Start Date', 'Description'],
    sort: 'Start Date',
    order: 'desc',
    limit: 15,
    page: 1,
  };

  let awards = [];
  let ok = false;
  // USASpending sits behind Cloudflare and erratically answers Worker requests with
  // 525 (SSL handshake failed) or just hangs. Retry a few times, but bound each
  // attempt so a hang can never stall the whole snapshot build.
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(USASPENDING, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Orbit360/1.0 (personal dashboard)',
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        ok = true;
        awards = (data.results || []).map(a => ({
          id: a['Award ID'],
          amount: a['Award Amount'],
          agency: a['Awarding Agency'],
          date: a['Start Date'],
          description: a['Description'],
        }));
      } else if (res.status < 500) {
        break; // a real client error won't fix itself on retry
      }
    } catch (_) { /* abort/network — fall through to retry */ }
    finally { clearTimeout(timer); }
    if (!ok && attempt < 2) await new Promise(r => setTimeout(r, 300));
  }

  // keep the last good award list through a transient API failure
  if (!ok && cached && cached.awards?.length) {
    const kept = { ...cached, stale: true, fetchedAt: Date.now() };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(kept), { expirationTtl: 43200 });
    return kept;
  }

  const cutoff = Date.now() - 30 * 864e5;
  const last30 = awards.filter(a => a.date && new Date(a.date).getTime() >= cutoff).length;

  const payload = { awards, last30, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 43200 });
  return payload;
}
