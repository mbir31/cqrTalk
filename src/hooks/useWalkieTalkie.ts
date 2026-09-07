import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionData, Participant, FloorState, TxRxState, ConnectionState, TransmissionRecord, RssiData, RogerBeepStyle } from '../types';
import { MediaEngine } from '../services/mediaEngine';
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

function computeRssi(latencyMs: number, isConnected: boolean): RssiData {
  if (!isConnected) {
    return {
      latencyMs: 0,
      rssiDbm: -120,
      bars: 0,
      quality: 'DISCONNECTED',
      sUnit: 'S0'
    };
  }

  const boundedLatency = Math.max(1, latencyMs);
  const jitter = (Math.random() - 0.5) * 3;
  const baseDbm = -38 - Math.round(Math.pow(boundedLatency, 0.44) * 4.8);
  const rssiDbm = Math.max(-115, Math.min(-42, Math.round(baseDbm + jitter)));

  let bars = 1;
  let quality: RssiData['quality'] = 'POOR';
  let sUnit = 'S3';

  if (boundedLatency < 45) {
    bars = 5;
    quality = 'EXCELLENT';
    sUnit = rssiDbm > -52 ? 'S9+20' : 'S9+10';
  } else if (boundedLatency < 95) {
    bars = 4;
    quality = 'GOOD';
    sUnit = 'S9';
  } else if (boundedLatency < 175) {
    bars = 3;
    quality = 'FAIR';
    sUnit = 'S7';
  } else if (boundedLatency < 300) {
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
    sUnit
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
  const [leaseSecondsLeft, setLeaseSecondsLeft] = useState<number>(0);
  const [micVolume, setMicVolume] = useState<number>(0);

  const [rssi, setRssi] = useState<RssiData>({
    latencyMs: 24,
    rssiDbm: -52,
    bars: 5,
    quality: 'EXCELLENT',
    sUnit: 'S9+10'
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaEngineRef = useRef<MediaEngine | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const fluctuationIntervalRef = useRef<number | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef<boolean>(false);
  const activeSessionIdRef = useRef<string | null>(null);

  const soundEffectsRef = useRef(soundEffects);
  soundEffectsRef.current = soundEffects;
  const squelchTailEnabledRef = useRef(squelchTailEnabled);
  squelchTailEnabledRef.current = squelchTailEnabled;
  const rogerBeepEnabledRef = useRef(rogerBeepEnabled);
  rogerBeepEnabledRef.current = rogerBeepEnabled;
  const rogerBeepStyleRef = useRef(rogerBeepStyle);
  rogerBeepStyleRef.current = rogerBeepStyle;

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
    playRotaryClick(soundEffects);
    hapticRotaryClick();
  }, [soundEffects]);

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

  // Send message via WebSocket safely
  const sendWs = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Initialize Media Engine
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
    mediaEngineRef.current = engine;

    return () => {
      engine.cleanup();
    };
  }, [participantId, sendWs]);

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
          // Release locally
          if (mediaEngineRef.current) {
            mediaEngineRef.current.stopTransmitting();
          }
          setTxRxState('IDLE');
        }
      };
      updateLease();
      const timer = setInterval(updateLease, 500);
      return () => clearInterval(timer);
    } else {
      setLeaseSecondsLeft(0);
    }
  }, [floor.leaseExpiresAt, txRxState]);

  // WebSocket Connection Logic
  const connectWebSocket = useCallback((targetSessionId?: string | null) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    activeSessionIdRef.current = targetSessionId || null;
    shouldReconnectRef.current = true;
    setConnectionState('CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('CONNECTED');
      setErrorMessage(null);

      // Immediately send a ping with client timestamp for instant latency measurement
      ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));

      // Join the session if targeting one
      if (targetSessionId) {
        playConnectChime(soundEffects);
        ws.send(JSON.stringify({
          type: 'join',
          sessionId: targetSessionId,
          participantId,
          displayName
        }));
      }

      // Ping WebSocket every 2000ms for continuous real WebSocket RTT tracking
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
        }
      }, 2000);

      // Micro-fluctuation drift interval (every 800ms) simulating natural RF carrier breathing
      if (fluctuationIntervalRef.current) clearInterval(fluctuationIntervalRef.current);
      fluctuationIntervalRef.current = window.setInterval(() => {
        setRssi(prev => {
          if (ws.readyState !== WebSocket.OPEN) return prev;
          const drift = (Math.random() - 0.5) * 3;
          const nextLatency = Math.max(6, Math.round(prev.latencyMs + drift));
          return computeRssi(nextLatency, true);
        });
      }, 800);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

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
            setFloor(data.floor);

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

            // Connect WebRTC with newly joined peer
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
            const newHostId = msg.newHostParticipantId;
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
            setTxRxState('TRANSMITTING');
            playPttChirp(soundEffects);
            hapticFloorGranted();
            currentTransmissionRef.current = {
              id: Math.random().toString(36).substring(2, 9),
              speakerId: participantId,
              speakerName: displayName,
              startedAt: Date.now(),
              wasSelf: true
            };
            if (mediaEngineRef.current) {
              mediaEngineRef.current.startTransmitting();
            }
            break;
          }

          case 'floor_denied': {
            setTxRxState('BUSY');
            playBusyTone(soundEffects);
            hapticFloorDenied();
            setTimeout(() => {
              setTxRxState(prev => prev === 'BUSY' ? 'IDLE' : prev);
            }, 1200);
            break;
          }

          case 'floor_updated': {
            const updatedFloor: FloorState = msg.floor;
            setFloor(updatedFloor);

            if (updatedFloor.currentSpeakerId) {
              if (updatedFloor.currentSpeakerId === participantId) {
                setTxRxState('TRANSMITTING');
              } else {
                setTxRxState('RECEIVING');
                playIncomingCue(soundEffects);
                hapticFloorGranted();
                currentTransmissionRef.current = {
                  id: Math.random().toString(36).substring(2, 9),
                  speakerId: updatedFloor.currentSpeakerId,
                  speakerName: updatedFloor.currentSpeakerName || 'Radio Operator',
                  startedAt: Date.now(),
                  wasSelf: false
                };
              }
            } else {
              // Floor is free
              recordTransmissionEnd();
              if (txRxState === 'TRANSMITTING') {
                if (rogerBeepEnabledRef.current) {
                  playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
                }
                if (squelchTailEnabledRef.current) {
                  playSquelchTail(soundEffectsRef.current);
                }
                if (mediaEngineRef.current) {
                  mediaEngineRef.current.stopTransmitting();
                }
              } else if (txRxState === 'RECEIVING') {
                if (rogerBeepEnabledRef.current) {
                  playRogerBeep(soundEffectsRef.current, rogerBeepStyleRef.current);
                }
                if (squelchTailEnabledRef.current) {
                  playSquelchTail(soundEffectsRef.current);
                }
              }
              setTxRxState('IDLE');
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
            setErrorMessage('You were removed from this channel by the host.');
            leaveSession();
            break;
          }

          case 'session_ended': {
            setErrorMessage(msg.message || 'This channel has been closed.');
            leaveSession();
            break;
          }

          case 'error': {
            setErrorMessage(msg.message || 'Radio error encountered.');
            break;
          }
        }
      } catch (e) {
        console.error('Error handling ws message:', e);
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (fluctuationIntervalRef.current) clearInterval(fluctuationIntervalRef.current);
      setRssi(computeRssi(0, false));

      if (shouldReconnectRef.current && activeSessionIdRef.current) {
        setConnectionState('RECONNECTING');
        playDisconnectChime(soundEffects);
        // Automatic reconnection attempt after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (shouldReconnectRef.current && activeSessionIdRef.current) {
            connectWebSocket(activeSessionIdRef.current);
          }
        }, 2000);
      } else {
        setConnectionState('DISCONNECTED');
      }
    };

    ws.onerror = () => {
      // ws.onclose handles reconnect
    };
  }, [participantId, displayName, soundEffects, txRxState]);

  // Maintain background carrier connection on load
  useEffect(() => {
    connectWebSocket(null);

    const handleOnline = () => {
      connectWebSocket(activeSessionIdRef.current);
    };
    const handleOffline = () => {
      setConnectionState('DISCONNECTED');
      setRssi(computeRssi(0, false));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (fluctuationIntervalRef.current) clearInterval(fluctuationIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Start joining or creating session
  const joinSession = useCallback(async (sessionId: string) => {
    setErrorMessage(null);
    try {
      // Preemptively acquire mic access
      if (mediaEngineRef.current) {
        await mediaEngineRef.current.acquireMicrophone();
      }
    } catch (err: any) {
      setErrorMessage('Microphone access is required for Push-to-Talk voice.');
      return false;
    }

    activeSessionIdRef.current = sessionId;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setConnectionState('CONNECTED');
      playConnectChime(soundEffects);
      wsRef.current.send(JSON.stringify({
        type: 'join',
        sessionId,
        participantId,
        displayName
      }));
    } else {
      connectWebSocket(sessionId);
    }
    return true;
  }, [connectWebSocket, displayName, participantId, soundEffects]);

  // Leave session
  const leaveSession = useCallback(() => {
    activeSessionIdRef.current = null;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' }));
    }

    if (mediaEngineRef.current) {
      mediaEngineRef.current.stopTransmitting();
      mediaEngineRef.current.cleanup();
    }

    setSession(null);
    setTxRxState('IDLE');
    setFloor({
      currentSpeakerId: null,
      currentSpeakerName: null,
      grantedAt: null,
      leaseExpiresAt: null
    });
  }, []);

  // Floor Control: Request PTT Floor
  const requestFloor = useCallback(() => {
    hapticPttPress();
    if (connectionState !== 'CONNECTED') return;
    if (floor.currentSpeakerId && floor.currentSpeakerId !== participantId) {
      setTxRxState('BUSY');
      playBusyTone(soundEffects);
      hapticFloorDenied();
      setTimeout(() => setTxRxState('IDLE'), 1000);
      return;
    }

    setTxRxState('REQUESTING');
    sendWs({
      type: 'floor_request',
      participantId
    });
  }, [connectionState, floor.currentSpeakerId, participantId, sendWs, soundEffects]);

  // Floor Control: Release PTT Floor
  const releaseFloor = useCallback(() => {
    hapticPttRelease();
    if (txRxState === 'TRANSMITTING' || txRxState === 'REQUESTING') {
      sendWs({
        type: 'floor_release',
        participantId
      });
      if (mediaEngineRef.current) {
        mediaEngineRef.current.stopTransmitting();
      }
      if (txRxState === 'TRANSMITTING') {
        recordTransmissionEnd();
        if (rogerBeepEnabled) {
          playRogerBeep(soundEffects, rogerBeepStyle);
        }
        if (squelchTailEnabled) {
          playSquelchTail(soundEffects);
        }
      }
      setTxRxState('IDLE');
    }
  }, [txRxState, sendWs, participantId, soundEffects, rogerBeepEnabled, rogerBeepStyle, squelchTailEnabled, recordTransmissionEnd]);

  // Secondary Toggle Start/Stop Transmission
  const toggleFloor = useCallback(() => {
    if (txRxState === 'TRANSMITTING') {
      releaseFloor();
    } else {
      requestFloor();
    }
  }, [txRxState, releaseFloor, requestFloor]);

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
    rssi,
    txRxState,
    floor,
    errorMessage,
    setErrorMessage,
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
    getAudioTimeDomainData
  };
}
