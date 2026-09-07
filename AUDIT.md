# cqrTalk — Codebase Audit & Remediation Report

Audit date: 2026-09-07 · Branch: `arena/01a07bc2-cqrtalk` (based on `209e78e`)
Scope: every file under `src/`, `public/`, `server.ts`, build/tooling configs, README.

**Verification status:** `tsc --noEmit` clean · production build clean · 30/30 protocol
smoke tests pass against both the dev server and the production bundle
(`scripts/smoke.mjs`) · server survives hostile payload/duplicate-join/rate abuse.

---

## 1. Critical bugs (fixed)

### 1.1 WebSocket connection was torn down on every PTT press / state change
**File:** `src/hooks/useWalkieTalkie.ts`

`connectWebSocket` was a `useCallback` whose dependency array included
`txRxState`, `soundEffects`, and `displayName`. A mount `useEffect` depended on
`connectWebSocket`, and its cleanup **closed the live WebSocket** and re-ran
`connectWebSocket(null)` — which also nulled `activeSessionIdRef`.

Because `txRxState` changes on *every* PTT interaction
(`REQUESTING → TRANSMITTING → IDLE`, `BUSY`, …), pressing or releasing PTT
inside a session closed the socket, silently dropped the client out of the
session (the recreated socket never re-sent `join`), and left the UI stuck with
a "connected" appearance while floor requests were ignored by the server.
Changing sound effects or the display name mid-session had the same effect.

**Fix:** the socket lifecycle is decoupled from reactive state — socket
handlers read everything through refs, `connectWebSocket` has a stable
identity, and a connection "generation" counter makes stale handlers inert.

### 1.2 Reconnect race / socket churn loop
`ws.onclose` scheduled a reconnect without checking whether a newer socket had
already been opened. Joining a session while a reconnect timer was pending
produced a loop where each new socket killed the previous one (two sockets
joining the same 1:1 session = churn / session-full races).

**Fix:** generation counter, pending-timer cancellation, and exponential
backoff (1 s → 30 s cap); stale close events never schedule reconnects.

### 1.3 Floor grant arriving after the operator already released PTT
A fast tap (press + release before the server round-trip) could receive the
grant *after* release, leaving the mic open with no button held until the
25 s lease expired.

**Fix:** request/acknowledge tracking — grants are honoured only while the
request is pending; stale grants immediately send `floor_release`.

### 1.4 `REQUESTING` could hang forever
No server answer meant the UI stayed in `REQUESTING` indefinitely.

**Fix:** 4 s local timeout → `IDLE` + visible error.

### 1.5 Host could be stolen (or never claimed) on session creation
**File:** `server.ts` + `CreateSessionModal.tsx` / `App.tsx`

The create response carried a random `hostParticipantId` that never joined, so
whoever joined *first* (possibly a guest racing through the invite link) could
become host.

**Fix:** one-time `hostToken` returned at creation, persisted per tab in
`sessionStorage`, verified timing-safe on join; token-holders can reclaim their
channel; unowned/abandoned sessions are still adoptable by their first
operator. Host moderation (kick / end) is reliably owned by the creator.

### 1.6 Ghost participants never cleaned up; host could vanish forever
`leave`/socket-close only cleared `participant.ws`, so offline ghosts
accumulated for the session's 12 h TTL, and a host who dropped from an empty
room left the session permanently hostless (nobody could end it).

**Fix:** sweeper prunes ghosts offline > 10 min (broadcasting
`participant_left`); host role is cleared when the host leaves with nobody
online and is claimed by the next operator; host transfer after a drop has a
grace period so brief network blips don't strip host rights.

### 1.7 Orphaned socket close could kill a live replacement connection
The `close` handler unconditionally detached `participant.ws` and released the
floor — an orphaned duplicate socket closing after a reconnect would detach the
*live* socket and yank the floor from the operator actually transmitting.

**Fix:** the close handler only mutates state when the closing socket is still
the participant's registered socket; floor release only when that socket owned
it.

### 1.8 RF Bandpass "filter" toggle was completely inert
**Files:** `src/services/mediaEngine.ts`, Settings UI

The "Tactical RF Bandpass Filter (300 Hz – 3.4 kHz)" setting only stored a
boolean; no audio DSP was ever applied.

**Fix:** real RX DSP chain per remote peer (high-pass 300 Hz → low-pass
3.4 kHz when enabled, near-transparent 20 Hz/20 kHz when disabled), live
updatable on toggle, raw-stream fallback when Web Audio is unavailable.

### 1.9 Incoming audio could stay silent (autoplay policy / iOS)
Remote audio used a programmatic `Audio` element never inserted into the DOM,
with `play()` attempted outside any user gesture and no retry.

**Fix:** elements are appended to the document, `playsinline` set, and playback
retried on every user gesture; the shared `AudioContext` is resumed on
gestures.

### 1.10 Peer connections could get permanently stuck after a network drop
Pcs in `disconnected` state were never rebuilt, `restartIce()` had no
`onnegotiationneeded` handler to produce an offer, and no recovery existed.

**Fix:** `disconnected` pcs are rebuilt on (re)join; negotiation handler sends
offers automatically for established calls; failed connections self-heal
deterministically (lexically greater participant re-offers) with cooldown.

### 1.11 Haptics "disabled" preference ignored until toggled
The haptics engine started in its module default (`true`); the persisted
setting was only pushed when the user toggled it.

**Fix:** engine state synchronised from persisted settings at boot (haptics +
RF filter).

### 1.12 Join / kick / end-of-session errors were invisible on the Home screen
`errorMessage` was only rendered inside the communication screen.

**Fix:** dismissible error banner on the Home screen; terminal join errors
(`SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `SESSION_FULL`, `INVALID_JOIN`) now
return the user home with an explanation instead of stranding them.

### 1.13 Session (re)join didn't restore TX/RX presentation
Joining while another operator held the floor showed `STANDBY` while audio was
streaming.

**Fix:** `session_state` derives `RECEIVING` (no spurious chime) from the floor.

---

## 2. Server hardening (fixed — `server.ts`)

- WS `maxPayload` 64 KB (was default 100 MB); oversized messages close the
  socket — plus a socket-level `error` handler so such attacks can never crash
  the process (found & verified by the smoke test).
- Per-connection message throttle (~300 msg/s); abusive sockets closed.
- Rate limiting on session creation per IP + global session cap (503);
  join-validation rate limit retained.
- Real client-IP extraction from `X-Forwarded-For` behind proxies
  (`TRUST_PROXY`), private-address fallback in dev.
- Protocol validation: type whitelist, participant-ID format, field checks.
- Host claim token (crypto random, timing-safe comparison).
- Duplicate live-identity join rejected (`ALREADY_CONNECTED`).
- `express.json({ limit: '32kb' })`, JSON 404 for unknown `/api/*` (was
  returning `index.html` with 200), central JSON error handler,
  `X-Powered-By` removed, security headers added.
- WS heartbeat (30 s ping) terminates half-open connections.
- Offline status broadcast delayed ~4 s (`OFFLINE_NOTIFY_DELAY_MS`) so quick
  reconnects don't make operators flicker offline.
- Ghost pruning, host-role sweeps, rate-limit map GC, per-session timer cleanup.
- `PORT` env; production bundle bakes `NODE_ENV=production` via esbuild define,
  so `npm start` can never boot the Vite dev middleware.
- Optional TURN relay via `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`, served
  through `/api/webrtc/config` and `session_state` (STUN-only calls fail behind
  symmetric NATs).

---

## 3. PWA / UX / build fixes

- `public/sw.js`: cache-name bump + **bounded runtime cache** (was growing
  without limit across deployments → eventual quota overflow).
- `AudioFrequencyVisualizer.tsx`: buffers sized to the analyser (`fftSize 256`)
  — previously the waveform read half the FFT window and freq/time arrays were
  undersized for the analyser.
- `PttButton.tsx`: Space-key no longer hijacks focused buttons; pointer capture
  prevents stuck TX when releasing outside the window; window-blur /
  page-hide release safety; multi-touch guard; key-up always releases even if
  focus moved while the key was held.
- `audioTones.ts`: AudioContext resume-on-gesture so tones aren't blocked by
  autoplay policy.
- `ParticipantSheet.tsx`: roster header shows honest online/total.
- `package.json`: production define in the esbuild step, `NODE_ENV=production`
  in `start`, `test:smoke` script.
- `.env.example`: documents all new server env vars.
- README: deployment/env-var documentation (long-running host + WebSockets
  requirement, TURN, trust proxy).

---

## 4. Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean; `dist/server.cjs` logs `(production)`.
- `node scripts/smoke.mjs` — **30/30 pass** (dev + production bundle),
  covering: REST lifecycle, host-token claims, roster sync, floor arbitration
  (grant/deny/release), kick + rejoin, session end, host-transfer grace
  behavior, 1:1 capacity, malformed JSON, unknown types, duplicate identity,
  oversized payloads, non-host moderation attempts.

## 5. Remaining production recommendations (design-level, not code fixes)

See the final chat summary: TURN deployment, media topology (SFU/star),
wake-lock + screen-off PTT, `getStats`-driven RSSI instead of simulation,
audio device selection, invite/token security hardening, session persistence,
observability, and platform/hosting guidance.
