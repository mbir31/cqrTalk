export type SessionType = 'one-to-one' | 'group';

export type TxRxState = 'IDLE' | 'REQUESTING' | 'TRANSMITTING' | 'RECEIVING' | 'BUSY';

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export interface Participant {
  participantId: string;
  displayName: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: number;
}

export interface FloorState {
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  grantedAt: number | null;
  leaseExpiresAt: number | null;
}

export interface SessionData {
  sessionId: string;
  pin: string;
  type: SessionType;
  groupName: string;
  hostParticipantId: string;
  participants: Participant[];
  floor: FloorState;
  iceServers?: RTCIceServer[];
}

export type RogerBeepStyle = 'classic' | 'nasa' | 'tactical' | 'cb';

export interface UserPreferences {
  displayName: string;
  soundEffectsEnabled: boolean;
  speakerMuted: boolean;
  pttMode: 'hold' | 'toggle';
  hapticsEnabled?: boolean;
  rfFilterEnabled?: boolean;
  squelchTailEnabled?: boolean;
  rogerBeepEnabled?: boolean;
  rogerBeepStyle?: RogerBeepStyle;
  customStunTurnUrl?: string;
}

export interface TransmissionRecord {
  id: string;
  speakerId: string;
  speakerName: string;
  timestamp: number;
  durationMs: number;
  wasSelf: boolean;
}

export interface RssiData {
  latencyMs: number;
  rssiDbm: number;
  bars: number; // 0 to 5
  quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED';
  sUnit: string; // e.g. 'S9+20', 'S9', 'S7', 'S5', 'S2', 'S0'
}

