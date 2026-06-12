// The SpaceX ecosystem. Every name is tagged by WHY it is connected, so when it
// moves on the board you know the linkage. `feed` decides which provider quotes it:
//   "us"     -> Finnhub (live now, your key)
//   "global" -> Twelve Data (slots in when you add TWELVEDATA_API_KEY)
//
// Tiers:
//   subject  - SpaceX itself
//   direct   - confirmed supplier or financial interdependence
//   partner  - commercial partner (revenue-linked)
//   pureplay - space-economy competitor; moves on SpaceX *sentiment*
//   legacy   - incumbent aerospace prime (competitor / partial supplier)
//   ai       - AI-infrastructure exposure via the xAI merger (thesis-driven)

export const TICKERS = [
  { symbol: 'SPCX',       name: 'SpaceX',                 tier: 'subject',  feed: 'us',     region: 'US', linkage: 'The subject. Space + AI after the xAI merger.' },

  // Direct ties — suppliers and financial interdependence
  { symbol: 'SATS',       name: 'EchoStar',               tier: 'direct',   feed: 'us',     region: 'US', linkage: 'Sold spectrum to SpaceX partly for equity; holds ~$11B of SpaceX stock.' },
  { symbol: 'STM',        name: 'STMicroelectronics',     tier: 'direct',   feed: 'us',     region: 'EU', linkage: 'Decade-long co-designer of Starlink terminal chips (NYSE ADR).' },
  { symbol: 'AVGO',       name: 'Broadcom',               tier: 'direct',   feed: 'us',     region: 'US', linkage: 'Communications components for Starlink hardware.' },
  // Global names carry: `td` = Twelve Data batch symbol (SYMBOL:EXCHANGE — verify
  // against /symbol_search if a name comes back "no data"), and `approxCapUSD` =
  // rough market cap in $M, used ONLY for treemap sizing (Twelve Data's quote
  // endpoint has no cap field). Update these occasionally; precision isn't needed.
  { symbol: 'FTC.L',      name: 'Filtronic',              tier: 'direct',   feed: 'global', region: 'UK', td: 'FTC:LSE',       approxCapUSD: 650,    linkage: 'RF/GaN amplifiers; confirmed multi-year SpaceX partnership (AIM).' },
  { symbol: '347700.KS',  name: 'Sphere Corp',            tier: 'direct',   feed: 'global', region: 'KR', td: '347700:KOSDAQ', approxCapUSD: 1500,   linkage: 'Superalloys for Starship; ~$1.05B 10-yr supply agreement (KOSDAQ).' },
  { symbol: '6285.TW',    name: 'Wistron NeWeb',          tier: 'direct',   feed: 'global', region: 'TW', td: '6285:TWSE',     approxCapUSD: 1900,   linkage: 'Primary maker of Starlink user terminals (TWSE).' },
  { symbol: 'MDA.TO',     name: 'MDA Space',              tier: 'direct',   feed: 'global', region: 'CA', td: 'MDA:TSX',       approxCapUSD: 3000,   linkage: 'Satellite systems & robotics supply (TSX).' },

  // Partner — revenue-linked commercial deal
  { symbol: 'TMUS',       name: 'T-Mobile US',            tier: 'partner',  feed: 'us',     region: 'US', linkage: 'Starlink direct-to-cell partner.' },

  // Pure-play space — competitors that trade on SpaceX sentiment
  { symbol: 'RKLB',       name: 'Rocket Lab',             tier: 'pureplay', feed: 'us',     region: 'US', linkage: 'The public "alternative to SpaceX": launch + space systems.' },
  { symbol: 'ASTS',       name: 'AST SpaceMobile',        tier: 'pureplay', feed: 'us',     region: 'US', linkage: 'Direct-to-cell rival (BlueBird constellation).' },
  { symbol: 'RDW',        name: 'Redwire',                tier: 'pureplay', feed: 'us',     region: 'US', linkage: 'In-space manufacturing & infrastructure.' },
  { symbol: 'LUNR',       name: 'Intuitive Machines',     tier: 'pureplay', feed: 'us',     region: 'US', linkage: 'Lunar landers & cislunar services.' },
  { symbol: 'ETL.PA',     name: 'Eutelsat',               tier: 'pureplay', feed: 'global', region: 'EU', td: 'ETL:Euronext',  approxCapUSD: 3300,   linkage: 'Owns OneWeb — the European "sovereign alternative" to Starlink.' },
  { symbol: 'AVIO.MI',    name: 'Avio',                   tier: 'pureplay', feed: 'global', region: 'EU', td: 'AVIO:MTA',      approxCapUSD: 1400,   linkage: 'European launch (Vega).' },

  // Legacy primes
  { symbol: 'BA',         name: 'Boeing',                 tier: 'legacy',   feed: 'us',     region: 'US', linkage: 'ULA joint-venture partner; launch competitor.' },
  { symbol: 'LMT',        name: 'Lockheed Martin',        tier: 'legacy',   feed: 'us',     region: 'US', linkage: 'ULA joint-venture partner; defence/space.' },
  { symbol: 'NOC',        name: 'Northrop Grumman',       tier: 'legacy',   feed: 'us',     region: 'US', linkage: 'Satellites & space vehicles.' },
  { symbol: 'AIR.PA',     name: 'Airbus',                 tier: 'legacy',   feed: 'global', region: 'EU', td: 'AIR:Euronext',  approxCapUSD: 170000, linkage: 'Satellite manufacturing (incl. OneWeb); European prime.' },

  // AI infrastructure — relevant because SPCX is now part-AI (xAI)
  { symbol: 'NVDA',       name: 'NVIDIA',                 tier: 'ai',       feed: 'us',     region: 'US', linkage: 'GPU supply underpinning the xAI compute build-out.' },
];

export const TIER_META = {
  subject:  { label: 'SUBJECT',   order: 0 },
  direct:   { label: 'DIRECT',    order: 1 },
  partner:  { label: 'PARTNER',   order: 2 },
  pureplay: { label: 'PURE-PLAY', order: 3 },
  legacy:   { label: 'LEGACY',    order: 4 },
  ai:       { label: 'AI INFRA',  order: 5 },
};

export const usTickers     = () => TICKERS.filter(t => t.feed === 'us');
export const globalTickers = () => TICKERS.filter(t => t.feed === 'global');
export const ecosystem     = () => TICKERS.filter(t => t.tier !== 'subject');
