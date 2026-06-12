// Alerts — detects significant events and emails you via Cloudflare's native
// send_email binding (free, to a verified destination address; no third party).
// Dedupe state lives in KV so you only get pinged once per event.

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

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
      title: `Pulse → ${band.toUpperCase()}`,
      detail: `Operational health crossed into ${band} (${snapshot.pulse.score}/100).` });
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

async function sendEmail(env, events) {
  const msg = createMimeMessage();
  msg.setSender({ name: 'Orbit360', addr: env.ALERT_FROM });
  msg.setRecipient(env.ALERT_TO);
  msg.setSubject(`Orbit360 · ${events[0].title}${events.length > 1 ? ` (+${events.length - 1} more)` : ''}`);

  const lines = events.map(e => `• ${e.title}\n  ${e.detail}`).join('\n\n');
  msg.addMessage({ contentType: 'text/plain', data:
    `Significant activity in the SpaceX ecosystem:\n\n${lines}\n\n— Orbit360` });

  await env.SEND_EMAIL.send(new EmailMessage(env.ALERT_FROM, env.ALERT_TO, msg.asRaw()));
}

const fmtUsd = (n) => n == null ? 'n/a'
  : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : `$${Number(n).toFixed(2)}`;
