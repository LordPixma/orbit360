// Operational telemetry — the "monitor the rocket, not just the ticker" layer.
// Both sources are free and keyless. Cached in KV (daily-ish) to stay polite.

// --- constellation health (CelesTrak) ---------------------------------------
// Live count of tracked Starlink objects in orbit. More satellites = more
// network capacity = the ceiling on Starlink revenue. We store yesterday's
// count so we can show the delta.
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json';

export async function getConstellation(env) {
  const cacheKey = 'constellation:latest';
  const histKey = 'constellation:history'; // [{date, count}], newest last
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  // serve cache only if fresh AND it has a real count (a 403/empty must not stick)
  if (cached && cached.count != null && Date.now() - cached.fetchedAt < 6 * 3600e3) return cached;

  let count = null;
  try {
    const res = await fetch(CELESTRAK, { cf: { cacheTtl: 3600 } });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length) count = arr.length;
    }
  } catch (_) {}

  // CelesTrak soft-rate-limits shared-IP callers with a 403 "use your cache" reply.
  // Keep the last good count rather than blanking the hero number.
  if (count == null && cached && cached.count != null) {
    const kept = { ...cached, stale: true, fetchedAt: Date.now() };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(kept), { expirationTtl: 86400 });
    return kept;
  }

  // maintain a small daily history for the delta + sparkline
  const today = new Date().toISOString().slice(0, 10);
  const history = (await env.ORBIT_KV.get(histKey, 'json')) || [];
  if (count != null && (history.length === 0 || history[history.length - 1].date !== today)) {
    history.push({ date: today, count });
    while (history.length > 90) history.shift();
    await env.ORBIT_KV.put(histKey, JSON.stringify(history));
  }
  const prev = history.length > 1 ? history[history.length - 2].count : null;

  const payload = {
    count,
    delta: count != null && prev != null ? count - prev : null,
    history: history.map(h => h.count),
    fetchedAt: Date.now(),
  };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 86400 });
  return payload;
}

// --- launch cadence (Launch Library 2 / The Space Devs) ---------------------
// The company's heartbeat: launches YTD, success rate, days since last launch,
// next launch on the manifest.
// The Space Devs runs two hosts on the same schema:
//   - production (ll)  : freshest data, but throttles anon traffic to ~15 req/hr
//     and answers 429 once you cross it. Cloudflare's *shared* egress IP blows
//     that ceiling collectively (proven: the edge gets 429 while a home IP gets
//     200 at the same instant), which blanked both Launch Ops and the manifest.
//   - dev (lldev)      : a free, keyless mirror that's far more lenient. Data can
//     lag a little, but it actually works from the edge.
// So default to the free dev host; if an LL2_API_KEY is set, use production with
// the token (per-account limit, escapes the shared-IP problem entirely).
const LL2_PROD = 'https://ll.thespacedevs.com/2.2.0';
const LL2_DEV = 'https://lldev.thespacedevs.com/2.2.0';
const ll2Base = (env) => (env.LL2_API_KEY ? LL2_PROD : LL2_DEV);

// Shared backoff: the first 429 parks all LL2 calls in KV for a cool-off window
// so a cold-cache request storm can't keep burning the quota.
const LL2_BACKOFF_KEY = 'll2:backoff-until';
const LL2_BACKOFF_MS = 20 * 60e3; // cool off ~20 min after a throttle

async function ll2BackedOff(env) {
  const until = await env.ORBIT_KV.get(LL2_BACKOFF_KEY);
  return until != null && Date.now() < Number(until);
}

// LL2 burst-throttles: three near-simultaneous calls (the parallel snapshot build
// fires that many) can get one 429 even when spaced single calls are fine. Funnel
// every call through a single-file queue with a small gap so a cold cache rebuild
// doesn't trip the limiter on itself.
let ll2Queue = Promise.resolve();
const LL2_GAP_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ll2(path, env) {
  const run = () => ll2Fetch(path, env);
  const result = ll2Queue.then(run, run);          // chain regardless of prior outcome
  ll2Queue = result.then(() => sleep(LL2_GAP_MS), () => sleep(LL2_GAP_MS)); // space the next
  return result;
}

async function ll2Fetch(path, env) {
  // don't even open a socket while we're in a throttle cool-off
  if (await ll2BackedOff(env)) throw new Error('LL2 backoff');

  const headers = { 'User-Agent': 'Orbit360/1.0 (personal dashboard)' };
  if (env.LL2_API_KEY) headers['Authorization'] = `Token ${env.LL2_API_KEY}`;

  const res = await fetch(`${ll2Base(env)}${path}`, { cf: { cacheTtl: 3600 }, headers });
  if (res.status === 429) {
    await env.ORBIT_KV.put(LL2_BACKOFF_KEY, String(Date.now() + LL2_BACKOFF_MS),
      { expirationTtl: Math.ceil(LL2_BACKOFF_MS / 1000) + 5 });
    throw new Error('LL2 429 (throttled)');
  }
  if (!res.ok) throw new Error(`LL2 ${res.status}`);
  return res.json();
}

export async function getLaunchOps(env) {
  const cacheKey = 'launchops:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  // serve cache only if it's fresh AND actually has data; an empty cache (from a
  // throttled fetch) must not block a retry.
  if (cached && cached.ytd > 0 && Date.now() - cached.fetchedAt < 3 * 3600e3) return cached;

  const yearStart = `${new Date().getFullYear()}-01-01T00:00:00Z`;
  let ytd = 0, success = 0, failure = 0, lastLaunch = null, nextLaunch = null;
  let ok = false;

  try {
    // recent SpaceX launches this year (agency id 121 = SpaceX in LL2)
    const past = await ll2(`/launch/?lsp__id=121&net__gte=${encodeURIComponent(yearStart)}&limit=100&mode=list&ordering=-net`, env);
    ok = true;
    for (const l of past.results || []) {
      ytd++;
      const s = (l.status?.abbrev || l.status?.name || '').toLowerCase();
      if (s.includes('success')) success++;
      else if (s.includes('fail')) failure++;
      if (!lastLaunch && l.net && new Date(l.net) <= new Date()) {
        lastLaunch = { name: l.name, net: l.net, status: l.status?.name };
      }
    }
  } catch (_) {}

  try {
    const upcoming = await ll2(`/launch/upcoming/?lsp__id=121&limit=1&mode=list&ordering=net`, env);
    const n = (upcoming.results || [])[0];
    if (n) nextLaunch = { name: n.name, net: n.net, pad: n.pad?.name };
  } catch (_) {}

  // LL2 unreachable/throttled — keep the last good figures rather than zeroing the card.
  if (!ok && cached && cached.ytd > 0) {
    const kept = { ...cached, stale: true, fetchedAt: Date.now() };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(kept), { expirationTtl: 43200 });
    return kept;
  }

  const daysSinceLast = lastLaunch
    ? Math.floor((Date.now() - new Date(lastLaunch.net).getTime()) / 864e5)
    : null;

  const payload = {
    ytd,
    successRate: ytd ? Math.round((success / (success + failure || 1)) * 100) : null,
    failures: failure,
    lastLaunch,
    daysSinceLast,
    nextLaunch,
    fetchedAt: Date.now(),
  };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 43200 });
  return payload;
}

// --- global launch manifest (Launch Library 2 / The Space Devs) -------------
// Every upcoming orbital launch on the manifest — all providers, worldwide.
// "Monitor the rocket" taken literally: who's flying next, on what, from where.
// Cached ~30 min so the live T-minus countdowns stay current without hammering
// the (rate-limited) anonymous LL2 endpoint.
const SPACEX_LSP_ID = 121;

// Launch Library returns providers by full legal name ("China Aerospace Science
// and Technology Corporation"). Shorten the common ones so the tiles stay legible.
const PROVIDER_SHORT = {
  'China Aerospace Science and Technology Corporation': 'CASC',
  'China Aerospace Science and Industry Corporation': 'CASIC',
  'United Launch Alliance': 'ULA',
  'Indian Space Research Organization': 'ISRO',
  'Indian Space Research Organisation': 'ISRO',
  'National Aeronautics and Space Administration': 'NASA',
  'Japan Aerospace Exploration Agency': 'JAXA',
  'Mitsubishi Heavy Industries': 'MHI',
  'Russian Federal Space Agency (ROSCOSMOS)': 'Roscosmos',
  'Roscosmos State Corporation for Space Activities': 'Roscosmos',
  'Northrop Grumman Innovation Systems': 'Northrop Grumman',
  'Northrop Grumman Space Systems': 'Northrop Grumman',
  'Firefly Aerospace': 'Firefly',
  'Korea Aerospace Research Institute': 'KARI',
  'European Space Agency': 'ESA',
  'International Launch Services': 'ILS',
  'Beijing Interstellar Glory Space Technology': 'iSpace',
  'Galactic Energy': 'Galactic Energy',
  'Relativity Space': 'Relativity',
};

function shortProvider(name) {
  if (!name) return null;
  if (PROVIDER_SHORT[name]) return PROVIDER_SHORT[name];
  // fall back to a trailing acronym in parentheses, e.g. "... (ESA)"
  const paren = name.match(/\(([A-Za-z0-9.\- ]{2,14})\)/);
  if (paren) return paren[1];
  return name; // already short, or unknown — the tile truncates if long
}

export async function getAllLaunches(env) {
  const cacheKey = 'launches:upcoming';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  // serve a cached list only if it's fresh AND non-empty; an empty cache (from a
  // throttled fetch) must not block a retry. 60-min window keeps steady-state LL2
  // load to ~1 call/hr from the manifest.
  if (cached && cached.launches?.length && Date.now() - cached.fetchedAt < 3600e3) return cached;

  let launches = [];
  try {
    // normal mode carries provider / rocket / pad detail; ordered soonest-first.
    // pull a few extra so we can drop already-flown launches and still fill the card.
    const data = await ll2('/launch/upcoming/?limit=16&ordering=net', env);
    const cutoff = Date.now() - 6 * 3600e3; // keep just-flown launches visible ~6h
    launches = (data.results || [])
      .filter(l => !l.net || new Date(l.net).getTime() >= cutoff)
      .slice(0, 12)
      .map(l => ({
      name: l.name || null,
      net: l.net || null,
      windowStart: l.window_start || null,
      windowEnd: l.window_end || null,
      status: l.status?.abbrev || l.status?.name || null,
      statusName: l.status?.name || null,
      provider: shortProvider(l.launch_service_provider?.name),
      providerFull: l.launch_service_provider?.name || null,
      rocket: l.rocket?.configuration?.name || l.rocket?.configuration?.full_name || null,
      pad: l.pad?.name || null,
      location: l.pad?.location?.name || null,
      mission: l.mission?.name || null,
      orbit: l.mission?.orbit?.abbrev || l.mission?.orbit?.name || null,
      isSpaceX: l.launch_service_provider?.id === SPACEX_LSP_ID
        || /spacex/i.test(l.launch_service_provider?.name || ''),
    }));
  } catch (_) {}

  // LL2 throttles anonymous traffic hard — if this fetch came back empty but we
  // have a previous good list, keep showing it rather than blanking the card.
  if (!launches.length && cached?.launches?.length) {
    const kept = { ...cached, stale: true, fetchedAt: Date.now() };
    await env.ORBIT_KV.put(cacheKey, JSON.stringify(kept), { expirationTtl: 3600 });
    return kept;
  }

  const payload = { launches, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 });
  return payload;
}
