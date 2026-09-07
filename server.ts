import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const app = express();
app.use(express.json());

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
  hostParticipantId: string;
  participants: Map<string, Participant>;
  floor: FloorState;
  isEnded: boolean;
}

// Session store and PIN index
const sessions = new Map<string, Session>();
const pinToSessionId = new Map<string, string>();

// Rate limiting for join attempts by IP
const joinAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = joinAttempts.get(ip);
  if (!record || now > record.resetAt) {
    joinAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (record.count >= 20) {
    return false; // Rate limit exceeded (20 attempts per minute)
  }
  record.count++;
  return true;
}

// Generate unique 4-digit PIN
function generateUniquePin(): string {
  let attempts = 0;
  while (attempts < 1000) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!pinToSessionId.has(pin)) {
      return pin;
    }
    attempts++;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Default ICE / STUN servers configuration
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

// Floor lease constants (Max 25 seconds of continuous transmit)
const FLOOR_LEASE_MS = 25_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Helper to sanitize display names
function sanitizeName(name: string): string {
  const trimmed = (name || '').trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
  return trimmed.slice(0, 24) || 'Operator';
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/webrtc/config', (req, res) => {
  res.json({
    iceServers: DEFAULT_ICE_SERVERS
  });
});

// Create session
app.post('/api/sessions/create', (req, res) => {
  const { type = 'one-to-one', groupName = '', displayName = 'Operator' } = req.body;
  const sessionType: SessionType = type === 'group' ? 'group' : 'one-to-one';
  const cleanGroupName = (groupName || '').trim().slice(0, 32) || (sessionType === 'group' ? 'Walkie-Talkie Group' : 'Private Channel');
  const cleanDisplayName = sanitizeName(displayName);

  const sessionId = crypto.randomBytes(16).toString('hex');
  const pin = generateUniquePin();
  const hostParticipantId = crypto.randomBytes(8).toString('hex');
  const now = Date.now();

  const session: Session = {
    sessionId,
    pin,
    type: sessionType,
    groupName: cleanGroupName,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    hostParticipantId,
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
    hostParticipantId,
    displayName: cleanDisplayName,
    expiresAt: session.expiresAt
  });
});

// Validate PIN or Session ID
app.post('/api/sessions/validate', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many join attempts. Please wait 1 minute.' });
  }

  const { pin, sessionId } = req.body;
  let targetSessionId = sessionId;

  if (!targetSessionId && pin) {
    const cleanPin = String(pin).trim();
    targetSessionId = pinToSessionId.get(cleanPin);
  }

  if (!targetSessionId || !sessions.has(targetSessionId)) {
    return res.status(404).json({ error: 'Invalid or expired PIN / Session ID' });
  }

  const session = sessions.get(targetSessionId)!;
  if (session.isEnded) {
    return res.status(410).json({ error: 'This session has been ended by the host.' });
  }

  if (Date.now() > session.expiresAt) {
    return res.status(410).json({ error: 'This session has expired.' });
  }

  // Check capacity
  const maxCapacity = session.type === 'one-to-one' ? 2 : 15;
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

// Setup HTTP server & WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Broadcast helper within a session
function broadcastSession(session: Session, message: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    if (participant.ws && participant.ws.readyState === WebSocket.OPEN && participant.ws !== excludeWs) {
      participant.ws.send(payload);
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

// Floor control arbitration
function handleFloorRequest(session: Session, participantId: string, ws: WebSocket) {
  const now = Date.now();
  const participant = session.participants.get(participantId);
  if (!participant) return;

  // Check if someone currently has the floor
  if (session.floor.currentSpeakerId) {
    // If the lease has not expired and someone else owns the floor
    if (session.floor.leaseExpiresAt && now < session.floor.leaseExpiresAt && session.floor.currentSpeakerId !== participantId) {
      ws.send(JSON.stringify({
        type: 'floor_denied',
        reason: 'BUSY',
        currentSpeakerId: session.floor.currentSpeakerId,
        currentSpeakerName: session.floor.currentSpeakerName
      }));
      return;
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

// Handle WebSocket connections
wss.on('connection', (ws) => {
  let currentSessionId: string | null = null;
  let currentParticipantId: string | null = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'join': {
          const { sessionId, participantId, displayName } = msg;
          const session = sessions.get(sessionId);

          if (!session || session.isEnded) {
            ws.send(JSON.stringify({ type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found or ended.' }));
            return;
          }

          const maxCapacity = session.type === 'one-to-one' ? 2 : 15;
          const activeParticipants = Array.from(session.participants.values()).filter(p => p.ws && p.ws.readyState === WebSocket.OPEN && p.participantId !== participantId);
          
          if (activeParticipants.length >= maxCapacity) {
            ws.send(JSON.stringify({ type: 'error', code: 'SESSION_FULL', message: 'Session is full.' }));
            return;
          }

          currentSessionId = sessionId;
          currentParticipantId = participantId;

          // Check if reconnecting or new participant
          let participant = session.participants.get(participantId);
          if (!participant) {
            // First user joining becomes host if host is empty
            const isHost = session.hostParticipantId === participantId || session.participants.size === 0;
            if (isHost) {
              session.hostParticipantId = participantId;
            }

            participant = {
              participantId,
              displayName: sanitizeName(displayName || 'Operator'),
              isHost,
              joinedAt: Date.now(),
              lastSeen: Date.now(),
              ws
            };
            session.participants.set(participantId, participant);
          } else {
            // Reconnecting
            participant.ws = ws;
            participant.lastSeen = Date.now();
            if (displayName) {
              participant.displayName = sanitizeName(displayName);
            }
          }

          // Send session state to joining client
          ws.send(JSON.stringify({
            type: 'session_state',
            session: {
              sessionId: session.sessionId,
              pin: session.pin,
              type: session.type,
              groupName: session.groupName,
              hostParticipantId: session.hostParticipantId,
              participants: getSessionParticipantList(session),
              floor: session.floor,
              iceServers: DEFAULT_ICE_SERVERS
            }
          }));

          // Notify everyone else
          broadcastSession(session, {
            type: 'participant_joined',
            participant: {
              participantId: participant.participantId,
              displayName: participant.displayName,
              isHost: participant.participantId === session.hostParticipantId,
              isOnline: true,
              joinedAt: participant.joinedAt
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
          if (!currentSessionId) return;
          const { targetParticipantId, signal } = msg;
          const session = sessions.get(currentSessionId);
          if (!session) return;

          const target = session.participants.get(targetParticipantId);
          if (target && target.ws && target.ws.readyState === WebSocket.OPEN) {
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
          const target = session.participants.get(targetParticipantId);
          if (target) {
            if (target.ws && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ type: 'removed_by_host', message: 'You were removed from the channel by the host.' }));
              target.ws.close();
            }
            session.participants.delete(targetParticipantId);
            handleFloorRelease(session, targetParticipantId);

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

          // Cleanup session
          pinToSessionId.delete(session.pin);
          sessions.delete(session.sessionId);
          break;
        }

        case 'leave': {
          if (!currentSessionId || !currentParticipantId) return;
          const session = sessions.get(currentSessionId);
          if (session) {
            handleFloorRelease(session, currentParticipantId);
            const participant = session.participants.get(currentParticipantId);
            if (participant) {
              participant.ws = undefined;
            }

            // If host left, transfer host role to another active participant
            if (session.hostParticipantId === currentParticipantId) {
              const remainingOnline = Array.from(session.participants.values()).filter(p => p.ws && p.ws.readyState === WebSocket.OPEN && p.participantId !== currentParticipantId);
              if (remainingOnline.length > 0) {
                session.hostParticipantId = remainingOnline[0].participantId;
                remainingOnline[0].isHost = true;
                broadcastSession(session, {
                  type: 'host_transferred',
                  newHostParticipantId: session.hostParticipantId,
                  participants: getSessionParticipantList(session)
                });
              }
            }

            broadcastSession(session, {
              type: 'participant_left',
              participantId: currentParticipantId,
              participants: getSessionParticipantList(session)
            });
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({
            type: 'pong',
            clientTime: msg.clientTime,
            time: Date.now()
          }));
          if (currentSessionId && currentParticipantId) {
            const session = sessions.get(currentSessionId);
            const p = session?.participants.get(currentParticipantId);
            if (p) p.lastSeen = Date.now();
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    if (currentSessionId && currentParticipantId) {
      const session = sessions.get(currentSessionId);
      if (session) {
        // Release floor immediately if this user was transmitting
        handleFloorRelease(session, currentParticipantId);

        const participant = session.participants.get(currentParticipantId);
        if (participant) {
          participant.ws = undefined;
          participant.lastSeen = Date.now();
        }

        // Host transfer if needed
        if (session.hostParticipantId === currentParticipantId) {
          const remainingOnline = Array.from(session.participants.values()).filter(p => p.ws && p.ws.readyState === WebSocket.OPEN && p.participantId !== currentParticipantId);
          if (remainingOnline.length > 0) {
            session.hostParticipantId = remainingOnline[0].participantId;
            remainingOnline[0].isHost = true;
            broadcastSession(session, {
              type: 'host_transferred',
              newHostParticipantId: session.hostParticipantId,
              participants: getSessionParticipantList(session)
            });
          }
        }

        broadcastSession(session, {
          type: 'participant_status',
          participantId: currentParticipantId,
          isOnline: false,
          participants: getSessionParticipantList(session)
        });
      }
    }
  });
});

// Periodic floor lease timer & session cleanup ticker (every 1 second)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    // Check floor lease expiration
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

    // Check session TTL expiration
    if (now > session.expiresAt) {
      broadcastSession(session, {
        type: 'session_ended',
        message: 'This session has expired.'
      });
      pinToSessionId.delete(session.pin);
      sessions.delete(sessionId);
    }
  }
}, 1000);

// Integrate Vite middleware in development or serve static in production
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`cqrTalk server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
