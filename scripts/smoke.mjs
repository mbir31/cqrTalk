/**
 * cqrTalk server smoke test — exercises the REST + WebSocket protocol
 * end-to-end (session lifecycle, floor arbitration, host rights, moderation,
 * hardening). Run against a live server:
 *
 *   PORT=3199 OFFLINE_NOTIFY_DELAY_MS=800 npx tsx server.ts &
 *   node scripts/smoke.mjs http://localhost:3199
 */
import WebSocket from 'ws';

const BASE = process.argv[2] || 'http://localhost:3199';
const WS_BASE = BASE.replace(/^http/, 'ws');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function httpJson(path, opts) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  return { status: res.status, body, text: await res.text().catch(() => '') };
}

class Client {
  constructor() {
    this.ws = null;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_BASE + '/ws');
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const idx = this.waiters.findIndex((w) => w.pred(msg));
        if (idx >= 0) {
          const [w] = this.waiters.splice(idx, 1);
          clearTimeout(w.timer);
          w.resolve(msg);
        } else {
          this.queue.push(msg);
        }
      });
      this.ws.on('close', (code) => {
        this.closed = true;
        const idx = this.waiters.findIndex((w) => w.pred === undefined && w.predClose);
        // Reject any remaining waiters that expect an open socket
        for (const w of this.waiters) {
          clearTimeout(w.timer);
          w.reject(new Error(`socket closed (code ${code})`));
        }
        this.waiters = [];
      });
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  /** Wait for a message matching pred, or a previously queued one. */
  waitFor(pred, timeoutMs = 4000, label = 'message') {
    const queuedIdx = this.queue.findIndex(pred);
    if (queuedIdx >= 0) {
      const [msg] = this.queue.splice(queuedIdx, 1);
      return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`timeout waiting for ${label}`));
      }, timeoutMs);
      this.waiters.push({ pred, timer, resolve, reject });
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch (e) { /* ignore */ }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = (tag) => `usr_test_${tag}_${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  // 1. Health & config
  let r = await httpJson('/api/health');
  ok('GET /api/health -> 200', r.status === 200 && r.body?.status === 'ok');

  r = await httpJson('/api/webrtc/config');
  ok('GET /api/webrtc/config -> iceServers', r.status === 200 && Array.isArray(r.body?.iceServers) && r.body.iceServers.length > 0);

  r = await httpJson('/api/does-not-exist');
  ok('unknown /api route -> JSON 404', r.status === 404 && r.body?.error === 'Not found', JSON.stringify(r.body));

  r = await httpJson('/api/sessions/validate', { method: 'POST', body: JSON.stringify({ pin: '9999' }) });
  ok('validate unknown PIN -> 404', r.status === 404);

  r = await httpJson('/api/sessions/create', { method: 'POST', body: JSON.stringify({ type: 'one-to-one', displayName: 'Alpha' }) });
  ok('create 1:1 session', r.status === 200 && r.body?.sessionId && r.body?.hostToken, JSON.stringify(r.body));
  const sessionId = r.body.sessionId;
  const pin = r.body.pin;
  const hostToken = r.body.hostToken;

  // 2. Host joins with token
  const host = new Client();
  await host.connect();
  const hostId = pid('host');
  host.send({ type: 'join', sessionId, participantId: hostId, displayName: 'Alpha', hostToken });
  const hostState = await host.waitFor((m) => m.type === 'session_state', 4000, 'host session_state');
  ok('host claims host role via token', hostState.session.hostParticipantId === hostId, JSON.stringify(hostState.session.hostParticipantId));

  // 3. Guest joins
  const guest = new Client();
  await guest.connect();
  const guestId = pid('guest');
  guest.send({ type: 'join', sessionId, participantId: guestId, displayName: 'Bravo' });
  const guestState = await guest.waitFor((m) => m.type === 'session_state', 4000, 'guest session_state');
  ok('guest sees host already set', guestState.session.hostParticipantId === hostId);
  ok('guest roster lists host online', guestState.session.participants.some((p) => p.participantId === hostId && p.isOnline));
  const hostJoined = await host.waitFor((m) => m.type === 'participant_joined' && m.participant?.participantId === guestId, 4000, 'participant_joined');
  ok('host notified of guest join', !!hostJoined);

  // 4. Floor: guest speaks, host denied
  guest.send({ type: 'floor_request', participantId: guestId });
  const gGranted = await guest.waitFor((m) => m.type === 'floor_granted', 4000, 'guest floor_granted');
  ok('guest gets floor_granted', !!gGranted);
  const hostFloorBusy = await host.waitFor((m) => m.type === 'floor_updated' && m.floor?.currentSpeakerId === guestId, 4000, 'host floor_updated guest');
  ok('host sees guest speaking', !!hostFloorBusy);

  host.send({ type: 'floor_request', participantId: hostId });
  const hostDenied = await host.waitFor((m) => m.type === 'floor_denied', 4000, 'host floor_denied');
  ok('host floor_request denied while guest speaks', hostDenied?.reason === 'BUSY');

  // 5. Guest releases
  guest.send({ type: 'floor_release', participantId: guestId });
  const floorFree1 = await host.waitFor((m) => m.type === 'floor_updated' && !m.floor?.currentSpeakerId, 4000, 'floor free');
  ok('floor released -> free for all', !!floorFree1);

  // 6. Host speaks
  host.send({ type: 'floor_request', participantId: hostId });
  await host.waitFor((m) => m.type === 'floor_granted', 4000, 'host granted');
  const guestSeesHost = await guest.waitFor((m) => m.type === 'floor_updated' && m.floor?.currentSpeakerId === hostId, 4000, 'guest sees host');
  ok('guest sees host speaking', !!guestSeesHost);

  // 7. Host kicks guest (guest socket should be closed server-side)
  host.send({ type: 'host_remove_participant', targetParticipantId: guestId });
  const removedMsg = await guest.waitFor((m) => m.type === 'removed_by_host', 4000, 'removed_by_host');
  ok('guest receives removed_by_host', !!removedMsg);
  await wait(400);
  ok('guest socket closed by server', guest.closed);
  const hostLeft = await host.waitFor((m) => m.type === 'participant_left' && m.participantId === guestId, 4000, 'participant_left');
  ok('host receives participant_left', !!hostLeft);

  // 8. Removed guest can rejoin (ghost reuse)
  const guest2 = new Client();
  await guest2.connect();
  guest2.send({ type: 'join', sessionId, participantId: guestId, displayName: 'Bravo2' });
  const guest2State = await guest2.waitFor((m) => m.type === 'session_state', 4000, 'guest2 session_state');
  ok('removed guest can rejoin same identity', !!guest2State && guest2State.session.hostParticipantId === hostId);

  // 9. Host ends session
  host.send({ type: 'host_end_session' });
  const ended1 = await guest2.waitFor((m) => m.type === 'session_ended', 4000, 'guest2 session_ended');
  const ended2 = await host.waitFor((m) => m.type === 'session_ended', 4000, 'host session_ended');
  ok('session_ended broadcast to all', !!ended1 && !!ended2);

  r = await httpJson('/api/sessions/validate', { method: 'POST', body: JSON.stringify({ pin }) });
  ok('ended session PIN -> 404', r.status === 404);
  host.close();
  guest2.close();

  // 10. Group session: host transfer on abrupt drop (delayed grace period)
  r = await httpJson('/api/sessions/create', { method: 'POST', body: JSON.stringify({ type: 'group', groupName: 'Ops', displayName: 'Commander' }) });
  const g1 = new Client();
  const g2 = new Client();
  const id1 = pid('g1');
  const id2 = pid('g2');
  await g1.connect();
  await g2.connect();
  g1.send({ type: 'join', sessionId: r.body.sessionId, participantId: id1, displayName: 'Commander', hostToken: r.body.hostToken });
  await g1.waitFor((m) => m.type === 'session_state', 4000, 'g1 state');
  g2.send({ type: 'join', sessionId: r.body.sessionId, participantId: id2, displayName: 'Field' });
  await g2.waitFor((m) => m.type === 'session_state', 4000, 'g2 state');

  // Abrupt drop of host, quick rejoin BEFORE grace window -> host rights preserved
  g1.ws.terminate();
  await wait(300);
  const g1b = new Client();
  await g1b.connect();
  g1b.send({ type: 'join', sessionId: r.body.sessionId, participantId: id1, displayName: 'Commander' });
  const g1bState = await g1b.waitFor((m) => m.type === 'session_state', 4000, 'g1b state');
  ok('host keeps role after fast reconnect', g1bState.session.hostParticipantId === id1, JSON.stringify(g1bState.session.hostParticipantId));

  // Abrupt drop of host, NO return -> g2 inherits host after the grace delay
  g1b.ws.terminate();
  const g2Host = await g2.waitFor((m) => m.type === 'host_transferred', 6000, 'host_transferred to g2');
  ok('host transferred to remaining operator after grace', g2Host?.newHostParticipantId === id2, JSON.stringify(g2Host?.newHostParticipantId));

  // 11. Capacity: 1:1 full
  r = await httpJson('/api/sessions/create', { method: 'POST', body: JSON.stringify({ type: 'one-to-one' }) });
  const c1 = new Client();
  const c2 = new Client();
  const c3 = new Client();
  const p1 = pid('c1');
  const p2 = pid('c2');
  const p3 = pid('c3');
  await c1.connect();
  await c2.connect();
  await c3.connect();
  c1.send({ type: 'join', sessionId: r.body.sessionId, participantId: p1, displayName: 'One', hostToken: r.body.hostToken });
  await c1.waitFor((m) => m.type === 'session_state', 4000, 'c1 state');
  c2.send({ type: 'join', sessionId: r.body.sessionId, participantId: p2, displayName: 'Two' });
  await c2.waitFor((m) => m.type === 'session_state', 4000, 'c2 state');
  c3.send({ type: 'join', sessionId: r.body.sessionId, participantId: p3, displayName: 'Three' });
  const fullErr = await c3.waitFor((m) => m.type === 'error', 4000, 'SESSION_FULL error');
  ok('1:1 rejects third participant', fullErr?.code === 'SESSION_FULL', JSON.stringify(fullErr));

  // 12. Protocol hardening
  c1.ws.send('this is not json');
  const badJson = await c1.waitFor((m) => m.type === 'error', 4000, 'INVALID_JSON');
  ok('malformed JSON rejected', badJson?.code === 'INVALID_JSON', JSON.stringify(badJson));

  c1.send({ type: 'no_such_type' });
  const unknownType = await c1.waitFor((m) => m.type === 'error' && m.code === 'UNKNOWN_TYPE', 4000, 'UNKNOWN_TYPE');
  ok('unknown message type rejected', !!unknownType);

  c2.send({ type: 'join', sessionId: 'nope', participantId: p1, displayName: 'x' });
  const notFoundErr = await c2.waitFor((m) => m.type === 'error', 4000, 'SESSION_NOT_FOUND');
  ok('join to unknown session rejected', notFoundErr?.code === 'SESSION_NOT_FOUND');

  // Duplicate live join (same pid, second socket) — expect ALREADY_CONNECTED + close
  const dup = new Client();
  await dup.connect();
  dup.send({ type: 'join', sessionId: r.body.sessionId, participantId: p1, displayName: 'One' });
  const dupErr = await dup.waitFor((m) => m.type === 'error', 4000, 'ALREADY_CONNECTED');
  ok('duplicate live identity rejected', dupErr?.code === 'ALREADY_CONNECTED', JSON.stringify(dupErr));
  await wait(300);
  ok('duplicate socket closed', dup.closed);

  // Huge payload closes the socket (maxPayload 64KB)
  const big = new Client();
  await big.connect();
  big.ws.send(JSON.stringify({ type: 'signal', big: 'x'.repeat(200 * 1024) }));
  const bigClosed = await new Promise((resolve) => {
    big.ws.on('close', (code) => resolve(code));
    setTimeout(() => resolve(null), 3000);
  });
  ok('oversized WS payload rejected', bigClosed !== null, `code=${bigClosed}`);

  // 13. Guest cannot moderate
  c2.send({ type: 'host_end_session' });
  const noOp = await c2.waitFor((m) => m.type === 'session_ended', 1500, 'unexpected end').catch(() => null);
  ok('non-host cannot end session', noOp === null);

  c1.close();
  c2.close();
  c3.close();
  dup.close();
  big.close();
  g2.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
