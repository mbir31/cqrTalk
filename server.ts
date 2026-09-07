import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

const app = express();
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// Basic security headers (frame embedding kept permissive for sandboxed previews)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// In-Memory Data Models
export type SessionType = 'one-to-one' | 'group';

export interface Participant {
  participantId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  ws?: WebSocket;
}

export interface FloorState {
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  grantedAt: number | null;
  leaseExpiresAt: number | null;
}

export interface Session {
  sessionId: string;
  pin: string;
  type: SessionType;
  groupName: string;
  createdAt: number;
  expiresAt: number;
  /** Opaque one-time token that proves session-creator (host) rights. */
  hostTokenHash: string;
  hostParticipantId: string;
  participants: Map<string, Participant>;
  floor: FloorState;
  isEnded: boolean;
}

// Session store and PIN index
const sessions = new Map<string, Session>();
const pinToSessionId = new Map<string, string>();

// Rate limiting (keyed by client IP)
const joinAttempts = new Map<string, { count: number; resetAt: number }>();
const createAttempts = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_JOIN_PER_MINUTE = 30;
const RATE_LIMIT_CREATE_PER_MINUTE = 10;
const MAX_SESSIONS = 5000;

function isPrivateAddress(addr: string): boolean {
  return /^(::1|::ffff:127\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(addr);
}

/**
 * Best-effort real client IP: use the first X-Forwarded-For entry when the
 * direct peer is not a private/loopback address (i.e. we are behind a proxy).
 * Set TRUST_PROXY=true to have Express fully trust proxy headers instead.
 */
function getClientIp(req: express.Request): string {
  const remote = req.socket.remoteAddress || 'unknown';
  if (TRUST_PROXY && req.ip) {
    return req.ip;
  }
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0].trim() : '';
  if (first && !isPrivateAddress(remote)) {
    return first;
  }
  return remote;
}

function checkRateLimit(map: Map<string, { count: number; resetAt: number }>, ip: string, maxPerMinute: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = map.get(ip);
  if (!record || now > record.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxPerMinute) {
    return false;
  }
  record.count++;
  return true;
}

// Generate unique 4-digit PIN using crypto.randomInt
function generateUniquePin(): string {
  for (let attempts = 0; attempts < 2000; attempts++) {
    const pin = crypto.randomInt(1000, 10000).toString();
    if (!pinToSessionId.has(pin)) {
      return pin;
    }
  }
  // Fallback linear scan if dense
  for (let pin = 1000; pin <= 9999; pin++) {
    const candidate = String(pin);
    if (!pinToSessionId.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('NO_PINS_AVAILABLE');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ah = sha256(a);
  const bh = sha256(b);
  return crypto.timingSafeEqual(Buffer.from(ah, 'hex'), Buffer.from(bh, 'hex'));
}

// Default ICE / STUN servers configuration (optionally extended with TURN)
function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];
  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    const urls = turnUrl.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length > 0) {
      const turnServer: RTCIceServer = { urls };
      const username = process.env.TURN_USERNAME;
      const credential = process.env.TURN_CREDENTIAL;
      if (username) turnServer.username = username;
      if (credential) turnServer.credential = credential;
      servers.push(turnServer);
    }
  }
  return servers;
}

// Floor lease constants (Max 25 seconds of continuous transmit)
const FLOOR_LEASE_MS = 25_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const GHOST_TTL_MS = 10 * 60 * 1000; // offline participant records pruned after 10 min
const OFFLINE_NOTIFY_DELAY_MS = Number(process.env.OFFLINE_NOTIFY_DELAY_MS) || 4000;

const MAX_GROUP_CAPACITY = 15;
const MAX_ONE_TO_ONE_CAPACITY = 2;

function sessionCapacity(session: Session): number {
  return session.type === 'one-to-one' ? MAX_ONE_TO_ONE_CAPACITY : MAX_GROUP_CAPACITY;
}

// Helper to sanitize display names
function sanitizeName(name: string): string {
  const trimmed = (name || '').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
  return trimmed.slice(0, 24) || 'Operator';
}

function isValidParticipantId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(id);
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/webrtc/config', (req, res) => {
  res.json({ iceServers: getIceServers() });
});

// Create session
app.post('/api/sessions/create', (req, res) => {
  const ip = getClientIp(req);
  if (!checkRateLimit(createAttempts, ip, RATE_LIMIT_CREATE_PER_MINUTE)) {
    return res.status(429).json({ error: 'Too many channels created. Please wait a minute.' });
  }
  if (sessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server at channel capacity. Please retry shortly.' });
  }

  const { type = 'one-to-one', groupName = '', displayName = 'Operator' } = req.body || {};
  const sessionType: SessionType = type === 'group' ? 'group' : 'one-to-one';
  const cleanGroupName = (groupName || '').toString().trim().slice(0, 32) || (sessionType === 'group' ? 'Walkie-Talkie Group' : 'Private Channel');
  const cleanDisplayName = sanitizeName(displayName);

  let pin: string;
  let sessionId: string;
  const hostToken = crypto.randomBytes(24).toString('hex');
  try {
    sessionId = crypto.randomBytes(16).toString('hex');
    pin = generateUniquePin();
  } catch (err) {
    return res.status(503).json({ error: 'Server at channel capacity. Please retry shortly.' });
  }
  const now = Date.now();

  const session: Session = {
    sessionId,
    pin,
    type: sessionType,
    groupName: cleanGroupName,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    hostTokenHash: sha256(hostToken),
    // Host slot is unclaimed until the creator joins with their host token
    // (or an unowned session is adopted by its first operator)
    hostParticipantId: '',
    participants: new Map(),
    floor: {
      currentSpeakerId: null,
      currentSpeakerName: null,
      grantedAt: null,
      leaseExpiresAt: null
    },
    isEnded: false
  };

  sessions.set(sessionId, session);
  pinToSessionId.set(pin, sessionId);

  res.json({
    sessionId,
    pin,
    type: session.type,
    groupName: session.groupName,
    displayName: cleanDisplayName,
    hostToken,
    expiresAt: session.expiresAt
  });
});

// Validate PIN or Session ID
app.post('/api/sessions/validate', (req, res) => {
  const ip = getClientIp(req);
  if (!checkRateLimit(joinAttempts, ip, RATE_LIMIT_JOIN_PER_MINUTE)) {
    return res.status(429).json({ error: 'Too many join attempts. Please wait 1 minute.' });
  }

  const { pin, sessionId } = req.body || {};
  let targetSessionId = typeof sessionId === 'string' && sessionId ? sessionId : '';

  if (!targetSessionId && typeof pin === 'string') {
    const cleanPin = pin.trim();
    targetSessionId = pinToSessionId.get(cleanPin) || '';
  }

  const session = sessions.get(targetSessionId);
  if (!session) {
    return res.status(404).json({ error: 'Invalid or expired PIN / Session ID' });
  }
  if (session.isEnded) {
    return res.status(410).json({ error: 'This session has been ended by the host.' });
  }
  if (Date.now() > session.expiresAt) {
    return res.status(410).json({ error: 'This session has expired.' });
  }

  // Check capacity
  const maxCapacity = sessionCapacity(session);
  const activeCount = Array.from(session.participants.values()).filter(p => p.ws && p.ws.readyState === WebSocket.OPEN).length;

  if (activeCount >= maxCapacity) {
    return res.status(403).json({ error: `Session is full (max ${maxCapacity} participants).` });
  }

  res.json({
    sessionId: session.sessionId,
    pin: session.pin,
    type: session.type,
    groupName: session.groupName,
    participantCount: activeCount,
    maxCapacity
  });
});

// JSON 404 + error handling for API surface (prevents SPA fallback swallowing API misses)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Setup HTTP server & WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

// Broadcast helper within a session
function broadcastSession(session: Session, message: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    if (participant.ws && participant.ws.readyState === WebSocket.OPEN && participant.ws !== excludeWs) {
      try {
        if (participant.ws.bufferedAmount > 1024 * 1024) {
          // Backpressure guard: socket too slow, drop it rather than buffer unbounded
          participant.ws.close(1011, 'Slow consumer');
          continue;
        }
        participant.ws.send(payload);
      } catch (err) {
        // Socket died mid-send; the close handler will clean up
      }
    }
  }
}

function safeSend(ws: WebSocket, message: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    } catch (err) {
      // Ignore — close handler cleans up
    }
  }
}

// Get public participants list
function getSessionParticipantList(session: Session) {
  return Array.from(session.participants.values()).map(p => ({
    participantId: p.participantId,
    displayName: p.displayName,
    isHost: p.participantId === session.hostParticipantId,
    isOnline: !!(p.ws && p.ws.readyState === WebSocket.OPEN),
    joinedAt: p.joinedAt
  }));
}

/**
 * Claim host rights for a participant.
 * A participant becomes host when:
 *  - they already are the host,
 *  - they present the matching creation token (creator's key — always honoured;
 *    the creator may reclaim their own channel), or
 *  - no live host exists AND no other online participant is around to inherit it
 *    (unowned/abandoned sessions get adopted by their first operator).
 */
function tryClaimHost(session: Session, participantId: string, hostToken?: string): boolean {
  if (session.hostParticipantId === participantId) return true;

  if (hostToken && timingSafeEqualStr(session.hostTokenHash, sha256(hostToken))) {
    session.hostParticipantId = participantId;
    return true;
  }

  const currentHost = session.participants.get(session.hostParticipantId);
  const hostIsLive = !!currentHost && !!currentHost.ws && currentHost.ws.readyState === WebSocket.OPEN;
  if (hostIsLive) return false;

  const otherOnline = Array.from(session.participants.values()).some(
    p => p.participantId !== participantId && p.ws && p.ws.readyState === WebSocket.OPEN
  );
  if (!otherOnline) {
    session.hostParticipantId = participantId;
    return true;
  }
  return false;
}

// Floor control arbitration
function handleFloorRequest(session: Session, participantId: string, ws: WebSocket) {
  const now = Date.now();
  const participant = session.participants.get(participantId);
  if (!participant || participant.ws !== ws) return;

  // Check if someone currently has the floor
  if (session.floor.currentSpeakerId) {
    if (session.floor.currentSpeakerId !== participantId) {
      // Another operator owns the floor
      if (session.floor.leaseExpiresAt && now < session.floor.leaseExpiresAt) {
        ws.send(JSON.stringify({
          type: 'floor_denied',
          reason: 'BUSY',
          currentSpeakerId: session.floor.currentSpeakerId,
          currentSpeakerName: session.floor.currentSpeakerName
        }));
        return;
      }
      // Lease expired server-side; owner may keep it via re-request throttling below
      // Fall through only if the owner never re-requested — handled by ticker normally.
    } else {
      // Same speaker re-keying: throttle extensions to prevent lease-reset spam
      if (session.floor.grantedAt && now - session.floor.grantedAt < 1500) {
        // Keep current floor, no need to re-broadcast — just acknowledge
        ws.send(JSON.stringify({
          type: 'floor_granted',
          participantId,
          leaseExpiresAt: session.floor.leaseExpiresAt
        }));
        return;
      }
    }
  }

  // Grant floor
  session.floor = {
    currentSpeakerId: participantId,
    currentSpeakerName: participant.displayName,
    grantedAt: now,
    leaseExpiresAt: now + FLOOR_LEASE_MS
  };

  // Notify requester
  ws.send(JSON.stringify({
    type: 'floor_granted',
    participantId,
    leaseExpiresAt: session.floor.leaseExpiresAt
  }));

  // Broadcast to all participants
  broadcastSession(session, {
    type: 'floor_updated',
    floor: session.floor
  });
}

function handleFloorRelease(session: Session, participantId: string) {
  if (session.floor.currentSpeakerId === participantId) {
    session.floor = {
      currentSpeakerId: null,
      currentSpeakerName: null,
      grantedAt: null,
      leaseExpiresAt: null
    };

    broadcastSession(session, {
      type: 'floor_updated',
      floor: session.floor
    });
  }
}

/**
 * Release the floor if the given participant's *closing socket* owned it.
 * Prevents an orphaned duplicate socket from yanking a live operator's floor.
 */
function handleFloorReleaseOnClose(session: Session, participantId: string, ws: WebSocket) {
  const participant = session.participants.get(participantId);
  const ownsFloor = session.floor.currentSpeakerId === participantId;
  const socketIsRegistered = !participant || participant.ws === ws || participant.ws === undefined;
  if (ownsFloor && socketIsRegistered) {
    handleFloorRelease(session, participantId);
  }
}

// Track pending "offline" notifications so quick reconnects don't flap status
const offlineNotifyTimers = new Map<string, NodeJS.Timeout>();
// Track pending host transfers so transient drops don't strip host rights
const hostTransferTimers = new Map<string, NodeJS.Timeout>();

function sessionParticipantKey(sessionId: string, participantId: string) {
  return `${sessionId}:${participantId}`;
}

/**
 * Transfer (or clear) host when the current host is gone for good.
 * If online operators remain, the first online operator becomes host;
 * otherwise the host role is cleared and the next joiner claims it.
 */
function transferHostAway(session: Session, leavingParticipantId: string) {
  if (session.hostParticipantId !== leavingParticipantId) return;

  const remainingOnline = Array.from(session.participants.values()).filter(
    p => p.participantId !== leavingParticipantId && p.ws && p.ws.readyState === WebSocket.OPEN
  );

  if (remainingOnline.length > 0) {
    session.hostParticipantId = remainingOnline[0].participantId;
    remainingOnline[0].isHost = true;
    broadcastSession(session, {
      type: 'host_transferred',
      newHostParticipantId: session.hostParticipantId,
      participants: getSessionParticipantList(session)
    });
  } else {
    session.hostParticipantId = '';
    broadcastSession(session, {
      type: 'host_transferred',
      newHostParticipantId: '',
      participants: getSessionParticipantList(session)
    });
  }
}

/** Schedule a delayed host transfer when the host's socket drops. */
function scheduleHostTransfer(sessionId: string, participantId: string) {
  const key = sessionParticipantKey(sessionId, participantId);
  const timer = setTimeout(() => {
    hostTransferTimers.delete(key);
    const session = sessions.get(sessionId);
    if (!session) return;
    const host = session.participants.get(participantId);
    const hostStillOffline = !host || !host.ws || host.ws.readyState !== WebSocket.OPEN;
    if (hostStillOffline) {
      transferHostAway(session, participantId);
    }
  }, OFFLINE_NOTIFY_DELAY_MS);
  const prev = hostTransferTimers.get(key);
  if (prev) clearTimeout(prev);
  hostTransferTimers.set(key, timer);
}

function cancelSessionTimers(sessionId: string) {
  for (const map of [offlineNotifyTimers, hostTransferTimers]) {
    for (const [key, timer] of map.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        clearTimeout(timer);
        map.delete(key);
      }
    }
  }
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  let currentSessionId: string | null = null;
  let currentParticipantId: string | null = null;

  // Never let a socket-level error (e.g. maxPayload exceeded, aborted frames)
  // bubble up as an unhandled 'error' — it would crash the whole process.
  ws.on('error', (err: any) => {
    if (err && err.code !== 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
      console.error('WebSocket error:', err.message || err);
    }
  });

  // Per-socket message throttle: 300 messages / second burst ceiling
  let msgWindowStart = Date.now();
  let msgCount = 0;

  const throttleHit = (): boolean => {
    const now = Date.now();
    if (now - msgWindowStart > 1000) {
      msgWindowStart = now;
      msgCount = 0;
    }
    msgCount++;
    return msgCount > 300;
  };

  ws.on('message', (data) => {
    try {
      let msg: any;
      if (throttleHit()) {
        safeSend(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Message rate exceeded.' });
        ws.close(1008, 'Message rate exceeded');
        return;
      }

      try {
        msg = JSON.parse(data.toString());
      } catch {
        safeSend(ws, { type: 'error', code: 'INVALID_JSON', message: 'Malformed message.' });
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        safeSend(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Malformed message.' });
        return;
      }

      switch (msg.type) {
        case 'join': {
          const { sessionId, participantId, displayName, hostToken } = msg;
          if (typeof sessionId !== 'string' || !isValidParticipantId(participantId)) {
            safeSend(ws, { type: 'error', code: 'INVALID_JOIN', message: 'Invalid session or participant ID.' });
            return;
          }
          const session = sessions.get(sessionId);
          if (!session || session.isEnded) {
            safeSend(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found or ended.' });
            return;
          }
          if (Date.now() > session.expiresAt) {
            safeSend(ws, { type: 'error', code: 'SESSION_EXPIRED', message: 'This session has expired.' });
            return;
          }

          const maxCapacity = sessionCapacity(session);
          const existing = session.participants.get(participantId);
          if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN && existing.ws !== ws) {
            // Same identity already live on another socket — refuse the duplicate
            safeSend(ws, { type: 'error', code: 'ALREADY_CONNECTED', message: 'This operator identity is already connected.' });
            ws.close(4001, 'Duplicate connection');
            return;
          }

          const activeOthers = Array.from(session.participants.values()).filter(
            p => p !== existing && p.ws && p.ws.readyState === WebSocket.OPEN
          );
          if (activeOthers.length >= maxCapacity) {
            safeSend(ws, { type: 'error', code: 'SESSION_FULL', message: `Session is full (max ${maxCapacity} participants).` });
            return;
          }

          // Cancel any pending offline notification / host transfer for this participant (rejoin)
          const pendingKey = sessionParticipantKey(session.sessionId, participantId);
          const pendingTimer = offlineNotifyTimers.get(pendingKey);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            offlineNotifyTimers.delete(pendingKey);
          }
          const pendingHostTimer = hostTransferTimers.get(pendingKey);
          if (pendingHostTimer) {
            clearTimeout(pendingHostTimer);
            hostTransferTimers.delete(pendingKey);
          }

          currentSessionId = sessionId;
          currentParticipantId = participantId;

          if (!existing) {
            tryClaimHost(session, participantId, typeof hostToken === 'string' ? hostToken : undefined);

            const participant: Participant = {
              participantId,
              displayName: sanitizeName(displayName || 'Operator'),
              isHost: session.hostParticipantId === participantId,
              joinedAt: Date.now(),
              lastSeen: Date.now(),
              ws
            };
            session.participants.set(participantId, participant);
          } else {
            // Reconnecting — allow the operator to reclaim a cleared/absent host slot
            if (session.hostParticipantId !== participantId) {
              tryClaimHost(session, participantId, typeof hostToken === 'string' ? hostToken : undefined);
            }
            existing.ws = ws;
            existing.lastSeen = Date.now();
            existing.isHost = session.hostParticipantId === participantId;
            if (typeof displayName === 'string' && displayName.trim()) {
              existing.displayName = sanitizeName(displayName);
            }
          }

          // Send session state to joining client
          safeSend(ws, {
            type: 'session_state',
            session: {
              sessionId: session.sessionId,
              pin: session.pin,
              type: session.type,
              groupName: session.groupName,
              hostParticipantId: session.hostParticipantId,
              participants: getSessionParticipantList(session),
              floor: session.floor,
              iceServers: getIceServers()
            }
          });

          // Notify everyone else
          broadcastSession(session, {
            type: 'participant_joined',
            participant: {
              participantId,
              displayName: (session.participants.get(participantId) || { displayName: 'Operator' }).displayName,
              isHost: session.hostParticipantId === participantId,
              isOnline: true,
              joinedAt: (session.participants.get(participantId) || { joinedAt: 0 }).joinedAt
            },
            participants: getSessionParticipantList(session)
          }, ws);

          break;
        }

        case 'floor_request': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (session) {
            handleFloorRequest(session, currentParticipantId, ws);
          }
          break;
        }

        case 'floor_release': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (session) {
            handleFloorRelease(session, currentParticipantId);
          }
          break;
        }

        // WebRTC Signaling: SDP Offer, Answer, ICE Candidate
        case 'signal': {
          if (!currentSessionId || !currentParticipantId) return;
          const { targetParticipantId, signal } = msg;
          if (typeof targetParticipantId !== 'string' || !signal || typeof signal !== 'object' || Array.isArray(signal)) return;
          const session = sessions.get(currentSessionId);
          if (!session) return;

          const target = session.participants.get(targetParticipantId);
          if (target && target.ws && target.ws.readyState === WebSocket.OPEN && target.ws !== ws) {
            target.ws.send(JSON.stringify({
              type: 'signal',
              fromParticipantId: currentParticipantId,
              signal
            }));
          }
          break;
        }

        case 'host_remove_participant': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (!session || session.hostParticipantId !== currentParticipantId) return;

          const { targetParticipantId } = msg;
          if (typeof targetParticipantId !== 'string' || targetParticipantId === currentParticipantId) return;
          const target = session.participants.get(targetParticipantId);
          if (target) {
            // Remove floor if the target was transmitting
            handleFloorRelease(session, targetParticipantId);

            session.participants.delete(targetParticipantId);

            const removeKey = sessionParticipantKey(session.sessionId, targetParticipantId);
            const pendingTimer = offlineNotifyTimers.get(removeKey);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              offlineNotifyTimers.delete(removeKey);
            }
            const pendingHostTimer = hostTransferTimers.get(removeKey);
            if (pendingHostTimer) {
              clearTimeout(pendingHostTimer);
              hostTransferTimers.delete(removeKey);
            }

            if (target.ws && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ type: 'removed_by_host', message: 'You were removed from the channel by the host.' }));
              target.ws.close();
            }

            broadcastSession(session, {
              type: 'participant_left',
              participantId: targetParticipantId,
              participants: getSessionParticipantList(session)
            });
          }
          break;
        }

        case 'host_end_session': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (!session || session.hostParticipantId !== currentParticipantId) return;

          session.isEnded = true;
          broadcastSession(session, {
            type: 'session_ended',
            message: 'This session has been ended by the host.'
          });

          // Disconnect active participant sockets
          for (const p of session.participants.values()) {
            if (p.ws && p.ws.readyState === WebSocket.OPEN) {
              p.ws.close(4000, 'Session ended by host');
            }
          }

          // Cleanup session
          pinToSessionId.delete(session.pin);
          sessions.delete(session.sessionId);
          cancelSessionTimers(session.sessionId);
          currentSessionId = null;
          currentParticipantId = null;
          break;
        }

        case 'leave': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (session) {
            handleFloorRelease(session, currentParticipantId);
            const participant = session.participants.get(currentParticipantId);
            if (participant) {
              // Keep a lightweight offline record so a quick rejoin reuses identity,
              // but never let this socket's close handler clobber a replacement.
              participant.ws = undefined;
              participant.lastSeen = Date.now();
            }

            maybeTransferHost(session, currentParticipantId);

            broadcastSession(session, {
              type: 'participant_left',
              participantId: currentParticipantId,
              participants: getSessionParticipantList(session)
            });
          }
          currentSessionId = null;
          currentParticipantId = null;
          break;
        }

        case 'ping': {
          safeSend(ws, {
            type: 'pong',
            clientTime: typeof msg.clientTime === 'number' ? msg.clientTime : Date.now(),
            time: Date.now()
          });
          if (currentSessionId && currentParticipantId) {
            const session = sessions.get(currentSessionId);
            const p = session?.participants.get(currentParticipantId);
            if (p) p.lastSeen = Date.now();
          }
          break;
        }

        default: {
          safeSend(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: 'Unknown message type.' });
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  ws.on('close', () => {
    if (!currentSessionId || !currentParticipantId) return;
    const session = sessions.get(currentSessionId);
    if (session) {
      const participant = session.participants.get(currentParticipantId);
      const isRegisteredSocket = participant?.ws === ws;

      // Release the floor immediately if the closing socket owned it
      handleFloorReleaseOnClose(session, currentParticipantId, ws);

      if (isRegisteredSocket && participant) {
        participant.ws = undefined;
        participant.lastSeen = Date.now();
      }

      if (isRegisteredSocket) {
        // Host transfer (delayed) if needed — grace period lets quick reconnects keep host rights
        if (session.hostParticipantId === currentParticipantId) {
          scheduleHostTransfer(session.sessionId, currentParticipantId);
        }

        // Delay the offline broadcast so brief reconnects don't flap status
        const notifyKey = sessionParticipantKey(session.sessionId, currentParticipantId);
        const timer = setTimeout(() => {
          offlineNotifyTimers.delete(notifyKey);
          const stillSession = sessions.get(currentSessionId!);
          if (!stillSession || !currentParticipantId) return;
          const stillOffline = stillSession.participants.get(currentParticipantId);
          if (!stillOffline || !stillOffline.ws || stillOffline.ws.readyState !== WebSocket.OPEN) {
            broadcastSession(stillSession, {
              type: 'participant_status',
              participantId: currentParticipantId,
              isOnline: false,
              participants: getSessionParticipantList(stillSession)
            });
          }
        }, OFFLINE_NOTIFY_DELAY_MS);
        const prevTimer = offlineNotifyTimers.get(notifyKey);
        if (prevTimer) clearTimeout(prevTimer);
        offlineNotifyTimers.set(notifyKey, timer);
      }
    }
  });
});

/**
 * Immediate host hand-off used when a host explicitly leaves the session.
 * (Socket drops use the delayed scheduleHostTransfer path instead, so brief
 * network blips do not strip host rights.)
 */
function maybeTransferHost(session: Session, leavingParticipantId: string) {
  transferHostAway(session, leavingParticipantId);
}

// Periodic floor lease timer, ghost pruning & session cleanup ticker (every 1 second)
const SWEEP_INTERVAL_MS = 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    // 1. Check floor lease expiration
    if (session.floor.currentSpeakerId && session.floor.leaseExpiresAt && now >= session.floor.leaseExpiresAt) {
      session.floor = {
        currentSpeakerId: null,
        currentSpeakerName: null,
        grantedAt: null,
        leaseExpiresAt: null
      };
      broadcastSession(session, {
        type: 'floor_updated',
        floor: session.floor,
        reason: 'LEASE_EXPIRED'
      });
    }

    // 2. Prune long-offline ghost participants
    for (const [participantId, participant] of Array.from(session.participants.entries())) {
      const isOnline = participant.ws && participant.ws.readyState === WebSocket.OPEN;
      if (!isOnline && now - participant.lastSeen > GHOST_TTL_MS) {
        session.participants.delete(participantId);
        if (session.floor.currentSpeakerId === participantId) {
          handleFloorRelease(session, participantId);
        }
        broadcastSession(session, {
          type: 'participant_left',
          participantId,
          participants: getSessionParticipantList(session)
        });
      }
    }

    // 3. If the host record was pruned, hand the role to an online operator or clear it
    if (session.hostParticipantId && !session.participants.has(session.hostParticipantId)) {
      const anyOnline = Array.from(session.participants.values()).some(p => p.ws && p.ws.readyState === WebSocket.OPEN);
      if (anyOnline) {
        transferHostAway(session, session.hostParticipantId);
      } else {
        session.hostParticipantId = '';
      }
    }

    // 4. Check session TTL expiration
    if (now > session.expiresAt) {
      broadcastSession(session, {
        type: 'session_ended',
        message: 'This session has expired.'
      });
      pinToSessionId.delete(session.pin);
      sessions.delete(sessionId);
      cancelSessionTimers(sessionId);
    }
  }

  // GC rate-limit maps every ~2 minutes
  if (now % 120_000 < 1000) {
    for (const map of [joinAttempts, createAttempts]) {
      for (const [ip, record] of map.entries()) {
        if (now > record.resetAt) map.delete(ip);
      }
    }
  }
}, SWEEP_INTERVAL_MS);

// WebSocket heartbeat — terminate half-open connections
const HEARTBEAT_INTERVAL_MS = 30_000;
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const anyWs = ws as any;
    if (anyWs.isAlive === false) {
      ws.terminate();
      continue;
    }
    anyWs.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeat);
});

// Integrate Vite middleware in development or serve static in production
async function start() {
  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback — never swallow /api or /ws routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`cqrTalk server running on http://0.0.0.0:${PORT} (${IS_PRODUCTION ? 'production' : 'development'})`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
