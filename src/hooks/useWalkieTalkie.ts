import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionData, Participant, FloorState, TxRxState, ConnectionState, TransmissionRecord, RssiData, RogerBeepStyle } from '../types';
import { MediaEngine } from '../services/mediaEngine';
import { SignalingTransport, TransportMode } from '../services/signalingTransport';
import {
  playPttChirp,
  playRogerBeep,
  playBusyTone,
  playIncomingCue,
  playConnectChime,
  playDisconnectChime,
  playSquelchTail,
  playRotaryClick
} from '../utils/audioTones';
import {
  hapticPttPress,
  hapticPttRelease,
  hapticFloorGranted,
  hapticFloorDenied,
  hapticRotaryClick,
  setHapticsEnabled as setHapticsEngineEnabled
} from '../utils/haptics';

const LOCAL_STORAGE_NAME_KEY = 'cqrtalk_display_name';
const LOCAL_STORAGE_SOUND_KEY = 'cqrtalk_sound_effects';
const LOCAL_STORAGE_PID_KEY = 'cqrtalk_participant_id';
const LOCAL_STORAGE_HAPTICS_KEY = 'cqrtalk_haptics_enabled';
const LOCAL_STORAGE_RF_FILTER_KEY = 'cqrtalk_rf_filter_enabled';
const LOCAL_STORAGE_SQUELCH_KEY = 'cqrtalk_squelch_tail_enabled';
const LOCAL_STORAGE_ROGER_BEEP_KEY = 'cqrtalk_roger_beep_enabled';
const LOCAL_STORAGE_ROGER_STYLE_KEY = 'cqrtalk_roger_beep_style';
const LOCAL_STORAGE_CHANNEL_KEY = 'cqrtalk_active_channel';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 4000;

function computeRssi(
  latencyMs: number,
  isConnected: boolean,
  packetLossPct: number = 0,
  jitterMs: number = 2
): RssiData {
  if (!isConnected) {
    return {
      latencyMs: 0,
      rssiDbm: -120,
      bars: 0,
      quality: 'DISCONNECTED',
      sUnit: 'S0',
      packetLossPct: 0,
      jitterMs: 0
    };
  }

  const boundedLatency = Math.max(1, latencyMs);
  const jitter = (Math.random() - 0.5) * 3;
  const baseDbm = -38 - Math.round(Math.pow(boundedLatency, 0.44) * 4.8);
  const rssiDbm = Math.max(-115, Math.min(-42, Math.round(baseDbm + jitter)));

  let bars = 1;
  let quality: RssiData['quality'] = 'POOR';
  let sUnit = 'S3';

  if (boundedLatency < 45 && packetLossPct <= 1) {
    bars = 5;
    quality = 'EXCELLENT';
    sUnit = rssiDbm > -52 ? 'S9+20' : 'S9+10';
  } else if (boundedLatency < 95 && packetLossPct <= 3) {
    bars = 4;
    quality = 'GOOD';
    sUnit = 'S9';
  } else if (boundedLatency < 175 && packetLossPct <= 7) {
    bars = 3;
    quality = 'FAIR';
    sUnit = 'S7';
  } else if (boundedLatency < 300 && packetLossPct <= 15) {
    bars = 2;
    quality = 'FAIR';
    sUnit = 'S5';
  } else {
    bars = 1;
    quality = 'POOR';
    sUnit = 'S2';
  }

  return {
    latencyMs: Math.round(boundedLatency),
    rssiDbm,
    bars,
    quality,
    sUnit,
    packetLossPct,
    jitterMs
  };
}

export function useWalkieTalkie() {
  const [displayName, setDisplayNameState] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_NAME_KEY) || 'Operator';
  });

  const [soundEffects, setSoundEffectsState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_SOUND_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_HAPTICS_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [rfFilterEnabled, setRfFilterEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_RF_FILTER_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [squelchTailEnabled, setSquelchTailEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_SQUELCH_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [rogerBeepEnabled, setRogerBeepEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_ROGER_BEEP_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [rogerBeepStyle, setRogerBeepStyleState] = useState<RogerBeepStyle>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_ROGER_STYLE_KEY) as RogerBeepStyle;
    return ['classic', 'nasa', 'tactical', 'cb'].includes(saved) ? saved : 'classic';
  });

  const [activeChannel, setActiveChannelState] = useState<number>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_CHANNEL_KEY);
    const num = saved ? parseInt(saved, 10) : 1;
    return !isNaN(num) && num >= 1 && num <= 16 ? num : 1;
  });

  const [speakerMuted, setSpeakerMuted] = useState<boolean>(false);
  const [transmissionHistory, setTransmissionHistory] = useState<TransmissionRecord[]>([]);
  const currentTransmissionRef = useRef<{ id: string; speakerId: string; speakerName: string; startedAt: number; wasSelf: boolean } | null>(null);
  const [participantId] = useState<string>(() => {
    let pid = sessionStorage.getItem(LOCAL_STORAGE_PID_KEY);
    if (!pid) {
      pid = 'usr_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem(LOCAL_STORAGE_PID_KEY, pid);
    }
    return pid;
  });

  const [session, setSession] = useState<SessionData | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [txRxState, setTxRxState] = useState<TxRxState>('IDLE');
  const [floor, setFloor] = useState<FloorState>({
    currentSpeakerId: null,
    currentSpeakerName: null,
    grantedAt: null,
    leaseExpiresAt: null
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);
  const [leaseSecondsLeft, setLeaseSecondsLeft] = useState<number>(0);
  const [micVolume, setMicVolume] = useState<number>(0);

  const [rssi, setRssi] = useState<RssiData>({
    latencyMs: 24,
    rssiDbm: -52,
    bars: 5,
    quality: 'EXCELLENT',
    sUnit: 'S9+10'
  });

  // ---------------------------------------------------------------------------
  // Refs — the single source of truth for anything socket handlers read, so the
  // transport lifecycle is never coupled to frequently-changing React state.
  // ---------------------------------------------------------------------------
  const transportRef = useRef<SignalingTransport | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>('native');
  const socketGenerationRef = useRef<number>(0);
  const mediaEngineRef = useRef<MediaEngine | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const fluctuationIntervalRef = useRef<number | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectFailuresRef = useRef<number>(0);
  const shouldReconnectRef = useRef<boolean>(true);
  const activeSessionIdRef = useRef<string | null>(null);
  const pendingHostTokenRef = useRef<string | null>(null);

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const soundEffectsRef = useRef(soundEffects);
  soundEffectsRef.current = soundEffects;
  const squelchTailEnabledRef = useRef(squelchTailEnabled);
  squelchTailEnabledRef.current = squelchTailEnabled;
  const rogerBeepEnabledRef = useRef(rogerBeepEnabled);
  rogerBeepEnabledRef.current = rogerBeepEnabled;
  const rogerBeepStyleRef = useRef(rogerBeepStyle);
  rogerBeepStyleRef.current = rogerBeepStyle;
  const rfFilterEnabledRef = useRef(rfFilterEnabled);
  rfFilterEnabledRef.current = rfFilterEnabled;
  const txRxStateRef = useRef<TxRxState>('IDLE');
  const floorRef = useRef<FloorState>({
    currentSpeakerId: null,
    currentSpeakerName: null,
    grantedAt: null,
    leaseExpiresAt: null
  });
  /** True while the operator's floor_request is awaiting the server answer. */
  const pttRequestPendingRef = useRef<boolean>(false);

  /** Set TX/RX state and keep its ref mirror in sync. */
  const setTxState = useCallback((next: TxRxState) => {
    txRxStateRef.current = next;
    setTxRxState(next);
  }, []);

  // ---------------------------------------------------------------------------
  // Setters (persist + mirror into engines)
  // ---------------------------------------------------------------------------
  const setDisplayName = useCallback((name: string) => {
    const clean = name.trim().slice(0, 24) || 'Operator';
    setDisplayNameState(clean);
    localStorage.setItem(LOCAL_STORAGE_NAME_KEY, clean);
  }, []);

  const setSoundEffects = useCallback((enabled: boolean) => {
    setSoundEffectsState(enabled);
    localStorage.setItem(LOCAL_STORAGE_SOUND_KEY, String(enabled));
  }, []);

  const setHapticsEnabled = useCallback((enabled: boolean) => {
    setHapticsEnabledState(enabled);
    setHapticsEngineEnabled(enabled);
    localStorage.setItem(LOCAL_STORAGE_HAPTICS_KEY, String(enabled));
  }, []);

  const setRfFilterEnabled = useCallback((enabled: boolean) => {
    setRfFilterEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_RF_FILTER_KEY, String(enabled));
    if (mediaEngineRef.current) {
      mediaEngineRef.current.setRfFilterEnabled(enabled);
    }
  }, []);

  const setSquelchTailEnabled = useCallback((enabled: boolean) => {
    setSquelchTailEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_SQUELCH_KEY, String(enabled));
  }, []);

  const setRogerBeepEnabled = useCallback((enabled: boolean) => {
    setRogerBeepEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_ROGER_BEEP_KEY, String(enabled));
  }, []);

  const setRogerBeepStyle = useCallback((style: RogerBeepStyle) => {
    setRogerBeepStyleState(style);
    localStorage.setItem(LOCAL_STORAGE_ROGER_STYLE_KEY, style);
  }, []);

  const setActiveChannel = useCallback((ch: number) => {
    const validCh = Math.max(1, Math.min(16, ch));
    setActiveChannelState(validCh);
    localStorage.setItem(LOCAL_STORAGE_CHANNEL_KEY, String(validCh));
    playRotaryClick(soundEffectsRef.current);
    hapticRotaryClick();
  }, []);

  const toggleSpeakerMute = useCallback(() => {
    setSpeakerMuted(prev => {
      const next = !prev;
      if (mediaEngineRef.current) {
        mediaEngineRef.current.setSpeakerMuted(next);
      }
      return next;
    });
  }, []);

  const recordTransmissionEnd = useCallback(() => {
    if (currentTransmissionRef.current) {
      const { id, speakerId, speakerName, startedAt, wasSelf } = currentTransmissionRef.current;
      const durationMs = Math.max(400, Date.now() - startedAt);
      const record: TransmissionRecord = {
        id,
        speakerId,
        speakerName,
        timestamp: Date.now(),
        durationMs,
        wasSelf
      };
      setTransmissionHistory(prev => [record, ...prev.slice(0, 14)]);
      currentTransmissionRef.current = null;
    }
  }, []);

  /** Send message via transport safely. */
  const sendWs = useCallback((msg: any) => {
    if (transportRef.current) {
      try {
        transportRef.current.send(msg);
      } catch (err) {
        // Transport error mid-send
      }
    }
  }, []);

  /** Clear all timers owned by the current socket. */
  const clearSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (fluctuationIntervalRef.current) {
      clearInterval(fluctuationIntervalRef.current);
      fluctuationIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /** Leave the current session (keeps the background carrier socket). */
  const leaveSession = useCallback(() => {
    activeSessionIdRef.current = null;
    pttRequestPendingRef.current = false;
    shouldReconnectRef.current = true; // keep the background carrier alive

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (transportRef.current) {
      try {
        transportRef.current.send({ type: 'leave', participantId });
      } catch (err) {
        // Ignore
      }
    }

    if (mediaEngineRef.current) {
      mediaEngineRef.current.stopTransmitting();
      mediaEngineRef.current.cleanup();
    }

    currentTransmissionRef.current = null;
    setSession(null);
    setTxState('IDLE');
    const emptyFloor: FloorState = {
      currentSpeakerId: null,
      currentSpeakerName: null,
      grantedAt: null,
      leaseExpiresAt: null
    };
    floorRef.current = emptyFloor;
    setFloor(emptyFloor);
  }, [setTxState, participantId]);

  /**
   * WebSocket connection logic — STABLE identity. All state read inside the
   * socket handlers goes through refs, so the socket is never rebuilt on state
   * changes (previously every PTT press tore the session down).
   */
  const connectWebSocket = useCallback((targetSessionId?: string | null) => {
    // Cancel timers owned by any previous socket first
    clearSocketTimers();

    const generation = ++socketGenerationRef.current;
    activeSessionIdRef.current = targetSessionId || null;

    // Detach & close any previous transport
    const previous = transportRef.current;
    if (previous) {
      try {
        previous.close();
      } catch (err) {
        // Ignore
      }
      transportRef.current = null;
    }

    setConnectionState('CONNECTING');

    const hostToken = pendingHostTokenRef.current || undefined;

    const transport = new SignalingTransport({
      sessionId: targetSessionId || 'standby',
      participantId,
      displayName: displayNameRef.current,
      isHost: Boolean(hostToken),
      hostToken,
      onModeChange: (mode) => {
        setTransportMode(mode);
      },
      onOpen: () => {
        if (socketGenerationRef.current !== generation) return;
        reconnectFailuresRef.current = 0;
        setConnectionState('CONNECTED');
        setErrorMessage(null);

        // Immediately send a ping with client timestamp for instant latency measurement
        transport.send({ type: 'ping', clientTime: Date.now() });

        // Join the session if targeting one
        const sessionId = activeSessionIdRef.current;
        if (sessionId) {
          playConnectChime(soundEffectsRef.current);
          const currentToken = pendingHostTokenRef.current;
          pendingHostTokenRef.current = null;
          transport.send({
            type: 'join',
            sessionId,
            participantId,
            displayName: displayNameRef.current,
            ...(currentToken ? { hostToken: currentToken } : {})
          });
        }

        // Ping transport every 2000ms for continuous real RTT tracking
        clearSocketTimers();
        pingIntervalRef.current = window.setInterval(() => {
          if (transportRef.current === transport) {
            transport.send({ type: 'ping', clientTime: Date.now() });
          }
        }, 2000);

        // Micro-fluctuation drift interval (every 800ms) simulating natural RF carrier breathing
        fluctuationIntervalRef.current = window.setInterval(() => {
          setRssi(prev => {
            if (transportRef.current !== transport) return prev;
            const latency = transport.getLatency();
            const drift = (Math.random() - 0.5) * 3;
            const nextLatency = Math.max(6, Math.round(latency + drift));
            return computeRssi(nextLatency, true);
          });
        }, 800);
      },
      onMessage: (msg: any) => {
        if (socketGenerationRef.current !== generation) return;
        try {
          switch (msg.type) {
          case 'pong': {
            if (msg.clientTime) {
              const rtt = Math.max(1, Date.now() - msg.clientTime);
              setRssi(computeRssi(rtt, true));
            }
            break;
          }
          case 'session_state': {
            const data: SessionData = msg.session;
            setSession(data);
            floorRef.current = data.floor || floorRef.current;
            setFloor(floorRef.current);

            if (data.iceServers && mediaEngineRef.current) {
              mediaEngineRef.current.setIceServers(data.iceServers);
            }

            // Initiate WebRTC peer connections with existing online participants
            if (mediaEngineRef.current) {
              for (const peer of data.participants) {
                if (peer.participantId !== participantId && peer.isOnline) {
                  // The user with lexically greater ID initiates offer to avoid collision
                  const shouldOffer = participantId > peer.participantId;
                  mediaEngineRef.current.createOrGetPeerConnection(peer.participantId, shouldOffer);
                }
              }
            }

            // Restore coherent TX/RX presentation (e.g. another operator is mid-broadcast)
            const speaker = floorRef.current.currentSpeakerId;
            if (speaker && speaker !== participantId) {
              if (txRxStateRef.current !== 'RECEIVING') {
                setTxState('RECEIVING');
                currentTransmissionRef.current = {
                  id: Math.random().toString(36).substring(2, 9),
                  speakerId: speaker,
                  speakerName: floorRef.current.currentSpeakerName || 'Radio Operator',
                  startedAt: Date.now(),
                  wasSelf: false
                };
              }
            } else if (txRxStateRef.current === 'REQUESTING' || txRxStateRef.current === 'TRANSMITTING') {
              // A reconnect means the server released our previous floor grant
              pttRequestPendingRef.current = false;
              if (mediaEngineRef.current) {
                mediaEngineRef.current.stopTransmitting();
              }
              setTxState('IDLE');
            }
            break;
          }

          case 'participant_joined': {
            const newParticipant: Participant = msg.participant;
            setSession(prev => {
              if (!prev) return prev;
              const exists = prev.participants.some(p => p.participantId === newParticipant.participantId);
              const updatedList = exists
                ? prev.participants.map(p => p.participantId === newParticipant.participantId ? newParticipant : p)
                : [...prev.participants, newParticipant];
              return { ...prev, participants: updatedList };
            });

            // Connect WebRTC with newly joined / re-joined peer
            if (mediaEngineRef.current && newParticipant.participantId !== participantId) {
              const shouldOffer = participantId > newParticipant.participantId;
              mediaEngineRef.current.createOrGetPeerConnection(newParticipant.participantId, shouldOffer);
            }
            break;
          }

          case 'participant_left': {
            const leftId = msg.participantId;
            setSession(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                participants: prev.participants.filter(p => p.participantId !== leftId)
              };
            });
            if (mediaEngineRef.current) {
              mediaEngineRef.current.removePeer(leftId);
            }
            break;
          }

          case 'participant_status': {
            const { participantId: targetId, isOnline } = msg;
            setSession(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                participants: prev.participants.map(p =>
                  p.participantId === targetId ? { ...p, isOnline } : p
                )
              };
            });
            break;
          }

          case 'host_transferred': {
            const newHostId = msg.newHostParticipantId || '';
            setSession(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                hostParticipantId: newHostId,
                participants: prev.participants.map(p => ({
                  ...p,
                  isHost: p.participantId === newHostId
                }))
              };
            });
            break;
          }

          case 'floor_granted': {
            if (pttRequestPendingRef.current) {
              pttRequestPendingRef.current = false;
              setTxState('TRANSMITTING');
              playPttChirp(soundEffectsRef.current);
              hapticFloorGranted();
              currentTransmissionRef.current = {
                id: Math.random().toString(36).substring(2, 9),
                speakerId: participantId,
                speakerName: displayNameRef.current,
                startedAt: Date.now(),
                wasSelf: true
              };
              if (mediaEngineRef.current) {
                mediaEngineRef.current.startTransmitting();
              }
            } else {
              // Stale grant (operator already released PTT) — release the floor again
              sendWs({ type: 'floor_release', participantId });
            }
            break;
          }

          case 'floor_denied': {
            pttRequestPendingRef.current = false;
            setTxState('BUSY');
            playBusyTone(soundEffectsRef.current);
            hapticFloorDenied();
            window.setTimeout(() => {
              if (txRxStateRef.current === 'BUSY') {
                setTxState('IDLE');
              }
            }, 1200);
            break;
          }

          case 'floor_updated': {
            const updatedFloor: FloorState = msg.floor || floorRef.current;
            floorRef.current = updatedFloor;
            setFloor(updatedFloor);

            const prevState = txRxStateRef.current;
            const speakerId = updatedFloor.currentSpeakerId;

            if (speakerId) {
              if (speakerId === participantId) {
                // We hold the floor
                if (prevState !== 'TRANSMITTING') {
                  if (!pttRequestPendingRef.current) {
                    // Floor assigned to us without an active local request —
                    // do not open the mic; ask the server to release it.
                    sendWs({ type: 'floor_release', participantId });
                    setTxState('IDLE');
                  } else {
                    pttRequestPendingRef.current = false;
                    setTxState('TRANSMITTING');
                    playPttChirp(soundEffectsRef.current);
                    hapticFloorGranted();
                    currentTransmissionRef.current = {
                      id: Math.random().toString(36).substring(2, 9),
                      speakerId: participantId,
                      speakerName: displayNameRef.current,
                      startedAt: Date.now(),
                      wasSelf: true
                    };
                    if (mediaEngineRef.current) {
                      mediaEngineRef.current.startTransmitting();
                    }
                  }
                }
              } else {
                // Another operator took the floor
                if (prevState === 'TRANSMITTING' || prevState === 'REQUESTING') {
                  // We lost it (lease takeover / pre-emption) — cut the mic immediately
                  pttRequestPendingRef.current = false;
                  if (mediaEngineRef.current) {
                    mediaEngineRef.current.stopTransmitting();
                  }
                  recordTransmissionEnd();
                  if (rogerBeepEnabledRef.current) {
                    playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
                  }
                  if (squelchTailEnabledRef.current) {
                    playSquelchTail(soundEffectsRef.current);
                  }
                }
                if (prevState !== 'RECEIVING') {
                  setTxState('RECEIVING');
                  playIncomingCue(soundEffectsRef.current);
                  hapticFloorGranted();
                  currentTransmissionRef.current = {
                    id: Math.random().toString(36).substring(2, 9),
                    speakerId: speakerId,
                    speakerName: updatedFloor.currentSpeakerName || 'Radio Operator',
                    startedAt: Date.now(),
                    wasSelf: false
                  };
                }
              }
            } else {
              // Floor is free
              const endedActive = prevState === 'TRANSMITTING' || prevState === 'RECEIVING';
              if (endedActive) {
                recordTransmissionEnd();
                if (rogerBeepEnabledRef.current) {
                  playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
                }
                if (squelchTailEnabledRef.current) {
                  playSquelchTail(soundEffectsRef.current);
                }
              }
              if (prevState === 'TRANSMITTING' && mediaEngineRef.current) {
                mediaEngineRef.current.stopTransmitting();
              }
              pttRequestPendingRef.current = false;
              if (prevState !== 'REQUESTING') {
                setTxState('IDLE');
              }
            }
            break;
          }

          case 'signal': {
            if (mediaEngineRef.current) {
              mediaEngineRef.current.handleRemoteSignal(msg.fromParticipantId, msg.signal);
            }
            break;
          }

          case 'removed_by_host': {
            setErrorMessage(msg.message || 'You were removed from this channel by the host.');
            leaveSession();
            break;
          }

          case 'session_ended': {
            setErrorMessage(msg.message || 'This channel has been closed.');
            leaveSession();
            break;
          }

          case 'error': {
            const terminalCodes = ['SESSION_NOT_FOUND', 'SESSION_EXPIRED', 'SESSION_FULL', 'INVALID_JOIN', 'ALREADY_CONNECTED'];
            if (terminalCodes.includes(msg.code)) {
              // The session we were in (or tried to join) no longer accepts us —
              // drop back to the home screen with a clear explanation.
              setErrorMessage(msg.message || 'Radio error encountered.');
              leaveSession();
            } else {
              setErrorMessage(msg.message || 'Radio error encountered.');
            }
            break;
          }
        }
      } catch (e) {
        console.error('Error handling ws message:', e);
      }
      },
      onClose: () => {
        if (socketGenerationRef.current !== generation) return;

        clearSocketTimers();
        setRssi(computeRssi(0, false));

        if (shouldReconnectRef.current && typeof navigator !== 'undefined' && navigator.onLine === false) {
          // Wait for the 'online' event instead of burning retries
          setConnectionState(activeSessionIdRef.current ? 'RECONNECTING' : 'DISCONNECTED');
          return;
        }

        const hasSession = !!activeSessionIdRef.current;
        if (shouldReconnectRef.current) {
          setConnectionState(hasSession ? 'RECONNECTING' : 'DISCONNECTED');
          if (hasSession) {
            playDisconnectChime(soundEffectsRef.current);
          }

          // Exponential backoff: 1s -> 1.7s -> 2.9s -> ... capped at 30s
          const failures = reconnectFailuresRef.current;
          const delay = Math.min(
            RECONNECT_MAX_DELAY_MS,
            RECONNECT_BASE_DELAY_MS * Math.pow(1.7, failures)
          );
          reconnectFailuresRef.current = failures + 1;

          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (shouldReconnectRef.current) {
              connectWebSocket(activeSessionIdRef.current);
            }
          }, delay);
        } else {
          setConnectionState('DISCONNECTED');
        }
      },
      onError: () => {
        // Transport handles reconnection
      }
    });

    transportRef.current = transport;
    transport.start();
  }, [participantId, sendWs, clearSocketTimers, leaveSession, setTxState, setRssi]);

  // Maintain background carrier connection on load
  useEffect(() => {
    shouldReconnectRef.current = true;
    connectWebSocket(activeSessionIdRef.current);

    const handleOnline = () => {
      shouldReconnectRef.current = true;
      connectWebSocket(activeSessionIdRef.current);
      if (mediaEngineRef.current) {
        mediaEngineRef.current.restartIceAll();
      }
    };
    const handleOffline = () => {
      setConnectionState('DISCONNECTED');
      setRssi(computeRssi(0, false));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic WebRTC real stats telemetry polling
    const telemetryInterval = window.setInterval(async () => {
      if (mediaEngineRef.current && activeSessionIdRef.current && transportRef.current) {
        try {
          const stats = await mediaEngineRef.current.getNetworkTelemetry();
          if (stats.rttMs > 0) {
            setRssi(computeRssi(stats.rttMs, true, stats.packetLossPct, stats.jitterMs));
          }
        } catch (e) {}
      }
    }, 2500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(telemetryInterval);
      shouldReconnectRef.current = false;
      clearSocketTimers();
      if (transportRef.current) {
        try {
          transportRef.current.close();
        } catch (err) {
          // Ignore
        }
        transportRef.current = null;
      }
    };
  }, [connectWebSocket, clearSocketTimers]);

  // Initialize Media Engine (once)
  useEffect(() => {
    const engine = new MediaEngine({
      onSignal: (targetId, signal) => {
        sendWs({
          type: 'signal',
          targetParticipantId: targetId,
          signal
        });
      },
      onError: (err) => {
        setErrorMessage('Microphone access issue: ' + err.message);
      }
    });

    engine.setLocalParticipantId(participantId);
    engine.setRfFilterEnabled(rfFilterEnabledRef.current);
    mediaEngineRef.current = engine;

    return () => {
      engine.cleanup();
      mediaEngineRef.current = null;
    };
  }, [participantId, sendWs]);

  // Sync engine module state with persisted settings at boot
  useEffect(() => {
    setHapticsEngineEnabled(hapticsEnabled);
  }, [hapticsEnabled]);

  // Handle speaker mute change on media engine
  useEffect(() => {
    if (mediaEngineRef.current) {
      mediaEngineRef.current.setSpeakerMuted(speakerMuted);
    }
  }, [speakerMuted]);

  // Volume meter tracking during transmission
  useEffect(() => {
    if (txRxState === 'TRANSMITTING') {
      volumeIntervalRef.current = window.setInterval(() => {
        if (mediaEngineRef.current) {
          setMicVolume(mediaEngineRef.current.getMicVolumeLevel());
        }
      }, 100);
    } else {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
      setMicVolume(0);
    }

    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [txRxState]);

  // Lease timer tracking
  useEffect(() => {
    if (floor.leaseExpiresAt && txRxState === 'TRANSMITTING') {
      const updateLease = () => {
        const remaining = Math.max(0, Math.ceil((floor.leaseExpiresAt! - Date.now()) / 1000));
        setLeaseSecondsLeft(remaining);
        if (remaining <= 0) {
          // Release locally and send floor_release
          if (mediaEngineRef.current) {
            mediaEngineRef.current.stopTransmitting();
          }
          sendWs({ type: 'floor_release', participantId });
          recordTransmissionEnd();
          if (rogerBeepEnabledRef.current) {
            playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
          }
          if (squelchTailEnabledRef.current) {
            playSquelchTail(soundEffectsRef.current);
          }
          pttRequestPendingRef.current = false;
          setTxState('IDLE');
        }
      };
      updateLease();
      const timer = setInterval(updateLease, 500);
      return () => clearInterval(timer);
    } else {
      setLeaseSecondsLeft(0);
    }
  }, [floor.leaseExpiresAt, txRxState, setTxState]);

  // PTT request timeout: never leave the operator stuck in REQUESTING
  useEffect(() => {
    if (txRxState === 'REQUESTING') {
      const timer = window.setTimeout(() => {
        if (txRxStateRef.current === 'REQUESTING') {
          pttRequestPendingRef.current = false;
          setTxState('IDLE');
          setErrorMessage('No response from the channel server. Please try again.');
        }
      }, REQUEST_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [txRxState, setTxState]);

  // Request or re-request microphone permission with user gesture
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (!mediaEngineRef.current) return false;
    try {
      await mediaEngineRef.current.acquireMicrophone(true);
      setMicPermissionDenied(false);
      setErrorMessage(null);
      return true;
    } catch (err: any) {
      setMicPermissionDenied(true);
      return false;
    }
  }, []);

  // Join an existing session (optionally as the token-verified creator/host)
  const joinSession = useCallback(async (sessionId: string, hostToken?: string) => {
    setErrorMessage(null);
    try {
      // Preemptively acquire mic access if possible
      if (mediaEngineRef.current) {
        await mediaEngineRef.current.acquireMicrophone(false);
        setMicPermissionDenied(false);
      }
    } catch (err: any) {
      console.warn('Microphone permission not granted yet, connecting in standby/listen mode:', err);
      setMicPermissionDenied(true);
    }

    if (hostToken) {
      pendingHostTokenRef.current = hostToken;
    }

    activeSessionIdRef.current = sessionId;
    if (transportRef.current && connectionState === 'CONNECTED') {
      playConnectChime(soundEffectsRef.current);
      const currentToken = pendingHostTokenRef.current;
      pendingHostTokenRef.current = null;
      try {
        transportRef.current.send({
          type: 'join',
          sessionId,
          participantId,
          displayName: displayNameRef.current,
          ...(currentToken ? { hostToken: currentToken } : {})
        });
      } catch (err) {
        connectWebSocket(sessionId);
      }
    } else {
      connectWebSocket(sessionId);
    }
    return true;
  }, [connectWebSocket, participantId, connectionState]);

  // Floor Control: Request PTT Floor
  const requestFloor = useCallback(() => {
    hapticPttPress();
    if (!transportRef.current || connectionState !== 'CONNECTED') return;
    if (txRxStateRef.current === 'TRANSMITTING') return;

    const currentFloor = floorRef.current;
    if (currentFloor.currentSpeakerId && currentFloor.currentSpeakerId !== participantId) {
      if (txRxStateRef.current !== 'BUSY') {
        setTxState('BUSY');
      }
      playBusyTone(soundEffectsRef.current);
      hapticFloorDenied();
      window.setTimeout(() => {
        if (txRxStateRef.current === 'BUSY') {
          setTxState('IDLE');
        }
      }, 1200);
      return;
    }

    if (mediaEngineRef.current) {
      mediaEngineRef.current.unlockAudio();
    }
    pttRequestPendingRef.current = true;
    setTxState('REQUESTING');
    sendWs({
      type: 'floor_request',
      participantId
    });
  }, [participantId, sendWs, setTxState]);

  // Floor Control: Release PTT Floor
  const releaseFloor = useCallback(() => {
    hapticPttRelease();
    const state = txRxStateRef.current;
    if (state === 'TRANSMITTING' || state === 'REQUESTING') {
      pttRequestPendingRef.current = false;
      sendWs({
        type: 'floor_release',
        participantId
      });
      if (mediaEngineRef.current) {
        mediaEngineRef.current.stopTransmitting();
      }
      if (state === 'TRANSMITTING') {
        recordTransmissionEnd();
        if (rogerBeepEnabledRef.current) {
          playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
        }
        if (squelchTailEnabledRef.current) {
          playSquelchTail(soundEffectsRef.current);
        }
      }
      setTxState('IDLE');
    }
  }, [participantId, recordTransmissionEnd, sendWs, setTxState]);

  // Secondary Toggle Start/Stop Transmission
  const toggleFloor = useCallback(() => {
    if (txRxStateRef.current === 'TRANSMITTING') {
      releaseFloor();
    } else {
      requestFloor();
    }
  }, [releaseFloor, requestFloor]);

  // Host Action: Remove Participant
  const removeParticipant = useCallback((targetParticipantId: string) => {
    sendWs({
      type: 'host_remove_participant',
      targetParticipantId
    });
  }, [sendWs]);

  // Host Action: End Session
  const endSession = useCallback(() => {
    sendWs({
      type: 'host_end_session'
    });
    leaveSession();
  }, [sendWs, leaveSession]);

  const getAudioFrequencyData = useCallback((outputArray: Uint8Array) => {
    if (mediaEngineRef.current) {
      mediaEngineRef.current.getFrequencyData(outputArray);
    }
  }, []);

  const getAudioTimeDomainData = useCallback((outputArray: Uint8Array) => {
    if (mediaEngineRef.current) {
      mediaEngineRef.current.getTimeDomainData(outputArray);
    }
  }, []);

  const startMicCheck = useCallback(async (): Promise<boolean> => {
    if (!mediaEngineRef.current) return false;
    return await mediaEngineRef.current.startMicCheck();
  }, []);

  const stopMicCheckAndPlay = useCallback((onEnded?: () => void) => {
    if (mediaEngineRef.current) {
      mediaEngineRef.current.stopMicCheckAndPlay(onEnded);
    }
  }, []);

  const cancelMicCheck = useCallback(() => {
    if (mediaEngineRef.current) {
      mediaEngineRef.current.cancelMicCheck();
    }
  }, []);

  const getMicVolumeLevel = useCallback((): number => {
    if (mediaEngineRef.current) {
      return mediaEngineRef.current.getMicVolumeLevel();
    }
    return 0;
  }, []);

  return {
    displayName,
    setDisplayName,
    soundEffects,
    setSoundEffects,
    hapticsEnabled,
    setHapticsEnabled,
    rfFilterEnabled,
    setRfFilterEnabled,
    squelchTailEnabled,
    setSquelchTailEnabled,
    rogerBeepEnabled,
    setRogerBeepEnabled,
    rogerBeepStyle,
    setRogerBeepStyle,
    activeChannel,
    setActiveChannel,
    transmissionHistory,
    speakerMuted,
    toggleSpeakerMute,
    participantId,
    session,
    connectionState,
    transportMode,
    rssi,
    txRxState,
    floor,
    errorMessage,
    setErrorMessage,
    micPermissionDenied,
    requestMicrophonePermission,
    leaseSecondsLeft,
    micVolume,
    joinSession,
    leaveSession,
    requestFloor,
    releaseFloor,
    toggleFloor,
    removeParticipant,
    endSession,
    getAudioFrequencyData,
    getAudioTimeDomainData,
    startMicCheck,
    stopMicCheckAndPlay,
    cancelMicCheck,
    getMicVolumeLevel
  };
}
