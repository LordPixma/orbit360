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
