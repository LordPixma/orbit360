// Alerts — detects significant events and emails you via Cloudflare's native
// send_email binding (free, to a verified destination address; no third party).
// Dedupe state lives in KV so you only get pinged once per event.
// Zero dependencies: the message is plain-text MIME, built by hand below.

import { EmailMessage } from 'cloudflare:email';

// Thresholds — tune to taste.
const SPCX_MOVE = 5;      // % move in SPCX
const ECO_MOVE  = 8;      // % move in any connected name

export function detectEvents(snapshot, lastState) {
  const events = [];
  const q = snapshot.quotes || {};

  // 1. SPCX big move
  const spcx = q.SPCX;
  if (spcx?.changePct != null && Math.abs(spcx.changePct) >= SPCX_MOVE) {
    events.push({ key: `spcx-move-${snapshot.day}-${Math.sign(spcx.changePct)}`,
      title: `SPCX ${spcx.changePct > 0 ? 'up' : 'down'} ${spcx.changePct.toFixed(1)}%`,
      detail: `Now ${fmtUsd(spcx.price)} (prev close ${fmtUsd(spcx.prevClose)}).` });
  }

  // 2. Connected name big move
  for (const [sym, d] of Object.entries(q)) {
    if (sym === 'SPCX' || d?.changePct == null) continue;
    if (Math.abs(d.changePct) >= ECO_MOVE) {
      events.push({ key: `eco-${sym}-${snapshot.day}-${Math.sign(d.changePct)}`,
        title: `${sym} ${d.changePct > 0 ? 'up' : 'down'} ${d.changePct.toFixed(1)}%`,
        detail: `A connected name is moving hard.` });
    }
  }

  // 3. New launch since last check
  const last = snapshot.launchOps?.lastLaunch;
  if (last?.net && last.net !== lastState?.lastLaunchNet) {
    events.push({ key: `launch-${last.net}`,
      title: `Launch: ${last.name}`,
      detail: `Status: ${last.status || 'n/a'}.` });
  }

  // 4. New federal award
  const newAward = (snapshot.contracts?.awards || [])[0];
  if (newAward?.id && newAward.id !== lastState?.lastAwardId) {
    events.push({ key: `award-${newAward.id}`,
      title: `New federal award`,
      detail: `${newAward.agency || 'Agency'} — ${fmtUsd(newAward.amount)}.` });
  }

  // 5. Pulse band change
  const band = snapshot.pulse?.status;
  if (band && lastState?.pulseBand && band !== lastState.pulseBand) {
    events.push({ key: `pulse-${snapshot.day}-${band}`,
      title: `Pulse -> ${band.toUpperCase()}`,
      detail: `Operational health crossed into ${band} (${snapshot.pulse.score}/100).` });
  }

  // 6. High-impact regulatory event — a clear approval or restriction with a
  // country attached. Only items from the last 24h qualify, so the first run
  // after deploy doesn't flood the inbox with backlog.
  for (const ev of (snapshot.regulatory?.events || []).slice(0, 10)) {
    if (!ev.major || !ev.country) continue;
    if (!ev.date || Date.now() - ev.date > 24 * 3600e3) continue;
    events.push({ key: `reg-${ev.id}`,
      title: `Regulatory (${ev.country}): ${ev.direction === 'positive' ? 'opening' : 'restriction'}`,
      detail: ev.title });
  }

  // 7. Supply-chain migration — a fresh relocation or risk headline (last 24h).
  for (const ev of (snapshot.supplyChain?.events || []).slice(0, 8)) {
    if (!ev.major) continue;
    if (!ev.date || Date.now() - ev.date > 24 * 3600e3) continue;
    const route = ev.from && ev.to ? ` ${ev.from}→${ev.to}` : ev.to ? ` →${ev.to}` : '';
    events.push({ key: `sc-${ev.id}`,
      title: `Supply chain: ${ev.kind === 'risk' ? 'risk flag' : 'relocation'}${route}`,
      detail: ev.title });
  }

  return events;
}

export async function fireAlerts(env, snapshot) {
  const lastState = (await env.ORBIT_KV.get('alert:state', 'json')) || {};
  const sentKeys = new Set(lastState.sentKeys || []);

  const fresh = detectEvents(snapshot, lastState).filter(e => !sentKeys.has(e.key));

  if (fresh.length && env.ALERT_TO && env.ALERT_FROM) {
    await sendEmail(env, fresh);
    fresh.forEach(e => sentKeys.add(e.key));
  }

  // persist dedupe + watermarks (keep last 200 keys)
  await env.ORBIT_KV.put('alert:state', JSON.stringify({
    sentKeys: [...sentKeys].slice(-200),
    lastLaunchNet: snapshot.launchOps?.lastLaunch?.net || lastState.lastLaunchNet,
    lastAwardId: (snapshot.contracts?.awards || [])[0]?.id || lastState.lastAwardId,
    pulseBand: snapshot.pulse?.status || lastState.pulseBand,
  }));

  return fresh;
}

// Headers are kept ASCII-only (email headers are fussy); the body is UTF-8.
async function sendEmail(env, events) {
  const subject = `Orbit360: ${events[0].title}${events.length > 1 ? ` (+${events.length - 1} more)` : ''}`;
  const lines = events.map(e => `* ${e.title}\r\n  ${e.detail}`).join('\r\n\r\n');
  const raw =
    `From: Orbit360 <${env.ALERT_FROM}>\r\n` +
    `To: ${env.ALERT_TO}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    `Significant activity in the SpaceX ecosystem:\r\n\r\n${lines}\r\n\r\n-- Orbit360`;
  await env.SEND_EMAIL.send(new EmailMessage(env.ALERT_FROM, env.ALERT_TO, raw));
}

const fmtUsd = (n) => n == null ? 'n/a'
  : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : `$${Number(n).toFixed(2)}`;
