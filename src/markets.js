// Market-access board — the country-by-country state of Starlink's licensing
// fight. This is SEED data (honestly labelled with asOf on the dashboard):
// the live regulatory stream annotates news against it, but status changes
// here are a judgement call, so they're yours to make. Edit and redeploy.
//
// status: 'live' | 'approved' (licensed, rollout in progress) | 'pending'
//         | 'blocked' (regulatory obstacle) | 'banned'

export const MARKET_BOARD = {
  asOf: '2026-06',
  markets: [
    { country: 'United States',  status: 'live',     note: 'Home market; FCC dockets are the main watch item.' },
    { country: 'United Kingdom', status: 'live',     note: 'Ofcom-licensed.' },
    { country: 'European Union', status: 'live',     note: 'Consumer service broadly live; sovereignty politics around IRIS2 continue.' },
    { country: 'India',          status: 'approved', note: 'GMPCS licence granted 2025; commercial rollout in progress — the big subscriber prize.' },
    { country: 'Brazil',         status: 'live',     note: 'Anatel-licensed; the 2024 court clash is resolved.' },
    { country: 'Indonesia',      status: 'live',     note: 'Licensed 2024.' },
    { country: 'Vietnam',        status: 'approved', note: 'Pilot approved 2025 under a foreign-ownership carve-out.' },
    { country: 'Bangladesh',     status: 'live',     note: 'Approved and launched 2025.' },
    { country: 'Pakistan',       status: 'pending',  note: 'Temporary registration granted; full PTA licence still pending.' },
    { country: 'South Africa',   status: 'pending',  note: 'Not licensed; equity-equivalence workaround under ICASA consultation.' },
    { country: 'Taiwan',         status: 'blocked',  note: 'Local-ownership rules; no service.' },
    { country: 'Italy',          status: 'live',     note: 'Consumer service live; government security deal politically contested.' },
    { country: 'Saudi Arabia',   status: 'live',     note: 'Approved 2025 (aviation and maritime first).' },
    { country: 'DR Congo',       status: 'live',     note: 'Earlier ban reversed; licensed 2025.' },
    { country: 'Cameroon',       status: 'banned',   note: 'Equipment seizures; service suspended.' },
    { country: 'Russia',         status: 'banned',   note: 'Prohibited.' },
    { country: 'China',          status: 'banned',   note: 'No prospect; building rival constellations (Guowang, Qianfan).' },
  ],
};

// Country / regulator detection for the live stream. First match wins, so
// regulators are listed before bare country names where it matters.
export const COUNTRY_PATTERNS = [
  [/\bfcc\b|federal communications/i, 'United States'],
  [/\bofcom\b/i, 'United Kingdom'],
  [/\bicasa\b/i, 'South Africa'],
  [/\banatel\b/i, 'Brazil'],
  [/\btrai\b|\bdot\b.*india|india.*\bdot\b/i, 'India'],
  [/\barcep\b/i, 'France'],
  [/\bacma\b/i, 'Australia'],
  [/\bpta\b.*pakistan|pakistan.*\bpta\b/i, 'Pakistan'],
  [/european commission|brussels|\beu\b(?![a-z])/i, 'European Union'],
  [/united states|\bu\.?s\.?\b(?![a-z])/i, 'United States'],
  [/united kingdom|\buk\b(?![a-z])|britain/i, 'United Kingdom'],
  [/south africa/i, 'South Africa'],
  [/\bindia\b/i, 'India'],
  [/\bbrazil\b/i, 'Brazil'],
  [/\bitaly\b|italian/i, 'Italy'],
  [/\bfrance\b|french/i, 'France'],
  [/german/i, 'Germany'],
  [/\bcanada\b|canadian/i, 'Canada'],
  [/\bmexico\b/i, 'Mexico'],
  [/\bvietnam\b/i, 'Vietnam'],
  [/indonesia/i, 'Indonesia'],
  [/\btaiwan\b/i, 'Taiwan'],
  [/philippines/i, 'Philippines'],
  [/malaysia/i, 'Malaysia'],
  [/\bjapan\b/i, 'Japan'],
  [/south korea|korean?\b/i, 'South Korea'],
  [/australia/i, 'Australia'],
  [/new zealand/i, 'New Zealand'],
  [/pakistan/i, 'Pakistan'],
  [/bangladesh/i, 'Bangladesh'],
  [/sri lanka/i, 'Sri Lanka'],
  [/saudi/i, 'Saudi Arabia'],
  [/\buae\b|emirates/i, 'UAE'],
  [/israel/i, 'Israel'],
  [/turkey|t\u00fcrkiye/i, 'Turkey'],
  [/nigeria/i, 'Nigeria'],
  [/\bkenya\b/i, 'Kenya'],
  [/zimbabwe/i, 'Zimbabwe'],
  [/\bcongo\b|\bdrc\b/i, 'DR Congo'],
  [/cameroon/i, 'Cameroon'],
  [/russia/i, 'Russia'],
  [/\bchina\b|chinese/i, 'China'],
  [/ukraine/i, 'Ukraine'],
  [/poland/i, 'Poland'],
];
