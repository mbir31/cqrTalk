/**
 * cqrTalk® Signaling Transport Layer
 * 
 * Provides an intelligent hybrid signaling bus:
 * 1. Primary: Native high-performance WebSocket connection (/ws or custom VITE_SIGNALING_URL)
 * 2. Automatic Serverless Fallback: Public secure TLS MQTT WebSocket broker (HiveMQ / EMQX)
 *    enabling zero-install, zero-server deployment on Vercel, Netlify, or GitHub Pages.
 */

import Paho from 'paho-mqtt';
import { FloorState, Participant, SessionData, SessionType } from '../types';

export type TransportMode = 'native' | 'serverless';

export interface SignalingTransportOptions {
  sessionId: string;
  participantId: string;
  displayName: string;
  isHost?: boolean;
  hostToken?: string;
  customWsUrl?: string;
  sessionMeta?: {
    pin?: string;
    type?: SessionType;
    groupName?: string;
  };
  onOpen: () => void;
  onMessage: (msg: any) => void;
  onClose: (reason?: string) => void;
  onError: (err: any) => void;
  onModeChange?: (mode: TransportMode) => void;
}

const PUBLIC_BROKERS = [
  { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt' }
];

export class SignalingTransport {
  private mode: TransportMode = 'native';
  private ws: WebSocket | null = null;
  private mqttClient: Paho.Client | null = null;
  private isClosed = false;
  private opts: SignalingTransportOptions;
  private fallbackTimer: number | null = null;
  private pingInterval: number | null = null;
  private leaseCheckInterval: number | null = null;
  private lastPingSent = 0;
  private latency = 12;

  // In Serverless mode, the host client acts as the authoritative floor and room arbiter
  private serverlessState: SessionData | null = null;
  private isServerlessHost = false;

  constructor(opts: SignalingTransportOptions) {
    this.opts = opts;
    this.isServerlessHost = Boolean(opts.isHost);
  }

  public getMode(): TransportMode {
    return this.mode;
  }

  public getLatency(): number {
    return this.latency;
  }

  public start(): void {
    this.isClosed = false;

    // Check if custom signaling URL or native WebSocket should be attempted
    const customUrl = this.opts.customWsUrl || (import.meta as any).env?.VITE_SIGNALING_URL;
    const isVercelOrStatic = typeof window !== 'undefined' && 
      (window.location.hostname.includes('vercel.app') || 
       window.location.hostname.includes('netlify.app') || 
       window.location.hostname.includes('github.io'));

    if (customUrl) {
      this.connectNative(customUrl);
    } else if (!isVercelOrStatic) {
      // Local dev or dedicated server deployment — try native /ws first
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.connectNative(wsUrl);

      // Set a short fallback timeout: if native doesn't open in 2.5s, switch to serverless
      this.fallbackTimer = window.setTimeout(() => {
        if (this.mode === 'native' && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.cleanupNative();
          this.switchToSeverless();
        }
      }, 2500);
    } else {
      // On static/serverless hosts like Vercel, directly connect via serverless broker
      this.switchToSeverless();
    }
  }

  private connectNative(wsUrl: string): void {
    try {
      this.mode = 'native';
      this.opts.onModeChange?.('native');
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.isClosed || this.ws !== ws) return;
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        this.opts.onOpen();
      };

      ws.onmessage = (event) => {
        if (this.isClosed || this.ws !== ws) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong' && msg.clientTime) {
            this.latency = Math.max(1, Date.now() - msg.clientTime);
          }
          this.opts.onMessage(msg);
        } catch (err) {
          // Ignore invalid JSON
        }
      };

      ws.onerror = (err) => {
        if (this.isClosed || this.ws !== ws) return;
        // On native failure, switch to serverless if not already closed
        if (this.mode === 'native') {
          this.cleanupNative();
          this.switchToSeverless();
        }
      };

      ws.onclose = () => {
        if (this.isClosed || this.ws !== ws) return;
        if (this.mode === 'native') {
          this.cleanupNative();
          this.switchToSeverless();
        }
      };
    } catch (err) {
      this.switchToSeverless();
    }
  }

  private cleanupNative(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch (e) {
        // Ignore
      }
      this.ws = null;
    }
  }

  private switchToSeverless(brokerIndex = 0): void {
    if (this.isClosed) return;
    this.mode = 'serverless';
    this.opts.onModeChange?.('serverless');

    const broker = PUBLIC_BROKERS[brokerIndex % PUBLIC_BROKERS.length];
    const clientId = `cqr_${this.opts.participantId}_${Math.random().toString(36).substring(2, 7)}`;
    const topic = `cqrtalk/v1/session/${this.opts.sessionId}`;

    try {
      const client = new Paho.Client(broker.host, broker.port, broker.path, clientId);
      this.mqttClient = client;

      client.onConnectionLost = (responseObject) => {
        if (this.isClosed) return;
        if (responseObject.errorCode !== 0) {
          // Retry with next broker
          window.setTimeout(() => {
            if (!this.isClosed) {
              this.switchToSeverless(brokerIndex + 1);
            }
          }, 1500);
        }
      };

      client.onMessageArrived = (message) => {
        if (this.isClosed) return;
        try {
          const payload = JSON.parse(message.payloadString);
          this.handleServerlessIncoming(payload);
        } catch (err) {
          // Ignore invalid packet
        }
      };

      client.connect({
        useSSL: true,
        timeout: 5,
        keepAliveInterval: 20,
        cleanSession: true,
        onSuccess: () => {
          if (this.isClosed) {
            try { client.disconnect(); } catch (e) {}
            return;
          }

          client.subscribe(topic, {
            onSuccess: () => {
              this.initServerlessSession();
              this.opts.onOpen();
              this.startServerlessHeartbeats();
            },
            onFailure: () => {
              this.switchToSeverless(brokerIndex + 1);
            }
          });
        },
        onFailure: () => {
          if (!this.isClosed) {
            this.switchToSeverless(brokerIndex + 1);
          }
        }
      });
    } catch (err) {
      if (!this.isClosed) {
        window.setTimeout(() => this.switchToSeverless(brokerIndex + 1), 2000);
      }
    }
  }

  /** Initialize Serverless session state */
  private initServerlessSession(): void {
    const meta = this.opts.sessionMeta || {};
    const pin = meta.pin || this.opts.sessionId.replace(/^pin_/, '').slice(0, 4) || '9999';
    const type: SessionType = meta.type || 'one-to-one';
    const groupName = meta.groupName || (type === 'group' ? 'Walkie-Talkie Group' : 'Private Channel');

    // Create participant entry for self
    const me: Participant = {
      participantId: this.opts.participantId,
      displayName: this.opts.displayName,
      isHost: this.isServerlessHost,
      isOnline: true,
      joinedAt: Date.now()
    };

    if (this.isServerlessHost || !this.serverlessState) {
      this.serverlessState = {
        sessionId: this.opts.sessionId,
        pin,
        type,
        groupName,
        hostParticipantId: this.isServerlessHost ? this.opts.participantId : '',
        participants: [me],
        floor: {
          currentSpeakerId: null,
          currentSpeakerName: null,
          grantedAt: null,
          leaseExpiresAt: null
        }
      };
    }

    // Inform the client app of initial state
    this.opts.onMessage({
      type: 'session_state',
      session: this.serverlessState
    });

    // Broadcast join to peers
    this.sendServerlessRaw({
      type: 'join',
      sessionId: this.opts.sessionId,
      participantId: this.opts.participantId,
      displayName: this.opts.displayName,
      isHost: this.isServerlessHost
    });
  }

  /** Heartbeats and floor lease expiration check */
  private startServerlessHeartbeats(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.leaseCheckInterval) clearInterval(this.leaseCheckInterval);

    this.pingInterval = window.setInterval(() => {
      if (this.isClosed) return;
      this.lastPingSent = Date.now();
      this.sendServerlessRaw({
        type: 'ping',
        clientTime: this.lastPingSent,
        participantId: this.opts.participantId
      });
    }, 3000);

    // If acting as host, inspect floor lease expiration (25s max)
    this.leaseCheckInterval = window.setInterval(() => {
      if (!this.isServerlessHost || !this.serverlessState || this.isClosed) return;
      const floor = this.serverlessState.floor;
      if (floor.currentSpeakerId && floor.leaseExpiresAt && Date.now() > floor.leaseExpiresAt) {
        floor.currentSpeakerId = null;
        floor.currentSpeakerName = null;
        floor.grantedAt = null;
        floor.leaseExpiresAt = null;
        this.sendServerlessRaw({
          type: 'floor_updated',
          floor
        });
      }
    }, 1000);
  }

  /** Dispatch incoming messages across serverless mesh */
  private handleServerlessIncoming(msg: any): void {
    // Ignore echo of our own raw messages
    if (msg._fromSelf === this.opts.participantId) {
      return;
    }

    switch (msg.type) {
      case 'ping': {
        // Echo back pong
        if (msg.clientTime && msg.participantId !== this.opts.participantId) {
          this.sendServerlessRaw({
            type: 'pong',
            clientTime: msg.clientTime,
            targetId: msg.participantId
          });
        }
        break;
      }

      case 'pong': {
        if (msg.targetId === this.opts.participantId && msg.clientTime) {
          this.latency = Math.max(1, Date.now() - msg.clientTime);
          this.opts.onMessage({ type: 'pong', clientTime: msg.clientTime });
        }
        break;
      }

      case 'join': {
        const newPeer: Participant = {
          participantId: msg.participantId,
          displayName: msg.displayName || 'Operator',
          isHost: Boolean(msg.isHost),
          isOnline: true,
          joinedAt: Date.now()
        };

        if (this.serverlessState) {
          const exists = this.serverlessState.participants.some(p => p.participantId === newPeer.participantId);
          if (!exists) {
            this.serverlessState.participants.push(newPeer);
          } else {
            this.serverlessState.participants = this.serverlessState.participants.map(p =>
              p.participantId === newPeer.participantId ? { ...p, isOnline: true } : p
            );
          }
        }

        // Inform client hook
        this.opts.onMessage({
          type: 'participant_joined',
          participant: newPeer
        });

        // If we are host (or first online peer), send full session state to the newcomer
        if (this.isServerlessHost && this.serverlessState) {
          this.sendServerlessRaw({
            type: 'session_state',
            targetId: msg.participantId,
            session: this.serverlessState
          });
        }
        break;
      }

      case 'session_state': {
        if (msg.targetId && msg.targetId !== this.opts.participantId) return;
        this.serverlessState = msg.session;
        this.opts.onMessage(msg);
        break;
      }

      case 'floor_request': {
        // If host, arbitrate floor
        if (this.isServerlessHost && this.serverlessState) {
          const floor = this.serverlessState.floor;
          const isFree = !floor.currentSpeakerId || (floor.leaseExpiresAt && Date.now() > floor.leaseExpiresAt);

          if (isFree) {
            const requester = this.serverlessState.participants.find(p => p.participantId === msg.participantId);
            floor.currentSpeakerId = msg.participantId;
            floor.currentSpeakerName = requester?.displayName || 'Radio Operator';
            floor.grantedAt = Date.now();
            floor.leaseExpiresAt = Date.now() + 25_000;

            this.sendServerlessRaw({
              type: 'floor_granted',
              participantId: msg.participantId
            });
            this.sendServerlessRaw({
              type: 'floor_updated',
              floor
            });
          } else {
            this.sendServerlessRaw({
              type: 'floor_denied',
              participantId: msg.participantId
            });
          }
        }
        break;
      }

      case 'floor_release': {
        if (this.isServerlessHost && this.serverlessState) {
          const floor = this.serverlessState.floor;
          if (floor.currentSpeakerId === msg.participantId) {
            floor.currentSpeakerId = null;
            floor.currentSpeakerName = null;
            floor.grantedAt = null;
            floor.leaseExpiresAt = null;

            this.sendServerlessRaw({
              type: 'floor_updated',
              floor
            });
          }
        }
        break;
      }

      case 'floor_granted': {
        if (msg.participantId === this.opts.participantId) {
          this.opts.onMessage(msg);
        }
        break;
      }

      case 'floor_denied': {
        if (msg.participantId === this.opts.participantId) {
          this.opts.onMessage(msg);
        }
        break;
      }

      case 'floor_updated': {
        if (this.serverlessState) {
          this.serverlessState.floor = msg.floor;
        }
        this.opts.onMessage(msg);
        break;
      }

      case 'signal': {
        // Target filtering
        if (!msg.toParticipantId || msg.toParticipantId === this.opts.participantId) {
          this.opts.onMessage(msg);
        }
        break;
      }

      case 'leave': {
        if (this.serverlessState) {
          this.serverlessState.participants = this.serverlessState.participants.filter(
            p => p.participantId !== msg.participantId
          );
        }
        this.opts.onMessage({
          type: 'participant_left',
          participantId: msg.participantId
        });

        // Host failover if host left
        if (msg.isHost && this.serverlessState) {
          const remaining = this.serverlessState.participants.filter(p => p.isOnline);
          if (remaining.length > 0) {
            const nextHost = remaining.sort((a, b) => a.participantId.localeCompare(b.participantId))[0];
            if (nextHost.participantId === this.opts.participantId) {
              this.isServerlessHost = true;
            }
            this.opts.onMessage({
              type: 'host_transferred',
              newHostParticipantId: nextHost.participantId
            });
          }
        }
        break;
      }

      case 'kick_participant': {
        if (msg.targetParticipantId === this.opts.participantId) {
          this.opts.onMessage({
            type: 'removed_by_host',
            message: 'You were removed from this channel by the host.'
          });
        }
        break;
      }

      case 'end_session': {
        this.opts.onMessage({
          type: 'session_ended',
          message: 'The channel has been closed by the host.'
        });
        break;
      }

      default: {
        this.opts.onMessage(msg);
      }
    }
  }

  private sendServerlessRaw(msg: any): void {
    if (!this.mqttClient || !this.mqttClient.isConnected()) return;
    try {
      const topic = `cqrtalk/v1/session/${this.opts.sessionId}`;
      const payload = {
        ...msg,
        _fromSelf: this.opts.participantId
      };
      const message = new Paho.Message(JSON.stringify(payload));
      message.destinationName = topic;
      message.qos = 0;
      this.mqttClient.send(message);
    } catch (err) {
      // Ignore send error
    }
  }

  public send(msg: any): void {
    if (this.isClosed) return;

    if (this.mode === 'native' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        // Fall back to serverless
        this.cleanupNative();
        this.switchToSeverless();
      }
    } else if (this.mode === 'serverless') {
      // Map outgoing messages to serverless topic
      this.sendServerlessRaw({
        ...msg,
        fromParticipantId: this.opts.participantId
      });

      // If we are serverless host and requested floor locally
      if (this.isServerlessHost && msg.type === 'floor_request') {
        this.handleServerlessIncoming({
          type: 'floor_request',
          participantId: this.opts.participantId
        });
      } else if (this.isServerlessHost && msg.type === 'floor_release') {
        this.handleServerlessIncoming({
          type: 'floor_release',
          participantId: this.opts.participantId
        });
      }
    }
  }

  public close(): void {
    this.isClosed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.leaseCheckInterval) {
      clearInterval(this.leaseCheckInterval);
      this.leaseCheckInterval = null;
    }

    this.cleanupNative();

    if (this.mqttClient) {
      try {
        if (this.mqttClient.isConnected()) {
          this.sendServerlessRaw({
            type: 'leave',
            participantId: this.opts.participantId,
            isHost: this.isServerlessHost
          });
          this.mqttClient.disconnect();
        }
      } catch (e) {
        // Ignore
      }
      this.mqttClient = null;
    }
  }
}
