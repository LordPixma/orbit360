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
  if (cached && Date.now() - cached.fetchedAt < 6 * 3600e3) return cached;

  let count = null;
  try {
    const res = await fetch(CELESTRAK, { cf: { cacheTtl: 3600 } });
    if (res.ok) {
      const arr = await res.json();
      count = Array.isArray(arr) ? arr.length : null;
    }
  } catch (_) {}

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
const LL2 = 'https://ll.thespacedevs.com/2.2.0';

async function ll2(path, env) {
  const res = await fetch(`${LL2}${path}`, {
    cf: { cacheTtl: 3600 },
    headers: { 'User-Agent': 'Orbit360/1.0 (personal dashboard)' },
  });
  if (!res.ok) throw new Error(`LL2 ${res.status}`);
  return res.json();
}

export async function getLaunchOps(env) {
  const cacheKey = 'launchops:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetchedAt < 3 * 3600e3) return cached;

  const yearStart = `${new Date().getFullYear()}-01-01T00:00:00Z`;
  let ytd = 0, success = 0, failure = 0, lastLaunch = null, nextLaunch = null;

  try {
    // recent SpaceX launches this year (agency id 121 = SpaceX in LL2)
    const past = await ll2(`/launch/?lsp__id=121&net__gte=${encodeURIComponent(yearStart)}&limit=100&mode=list&ordering=-net`, env);
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
  if (cached && Date.now() - cached.fetchedAt < 1800e3) return cached;

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

  const payload = { launches, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 });
  return payload;
}
