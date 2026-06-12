// Government revenue signal — federal awards to SpaceX, via the free USASpending
// API (no key). New NASA / Space Force / NRO / Starshield awards are public and
// lead reported revenue. Docs: https://api.usaspending.gov/

const USASPENDING = 'https://api.usaspending.gov/api/v2/search/spend_by_award/';

export async function getContracts(env) {
  const cacheKey = 'contracts:latest';
  const cached = await env.ORBIT_KV.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetchedAt < 12 * 3600e3) return cached;

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
  try {
    const res = await fetch(USASPENDING, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      awards = (data.results || []).map(a => ({
        id: a['Award ID'],
        amount: a['Award Amount'],
        agency: a['Awarding Agency'],
        date: a['Start Date'],
        description: a['Description'],
      }));
    }
  } catch (_) {}

  const cutoff = Date.now() - 30 * 864e5;
  const last30 = awards.filter(a => a.date && new Date(a.date).getTime() >= cutoff).length;

  const payload = { awards, last30, fetchedAt: Date.now() };
  await env.ORBIT_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 43200 });
  return payload;
}
