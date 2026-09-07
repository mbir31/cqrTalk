import React, { useState } from 'react';
import { Radio, Users, Volume2, VolumeX, LogOut, Power, Share2, Copy, Check, AlertTriangle } from 'lucide-react';
import { RadioDisplay } from './RadioDisplay';
import { PttButton } from './PttButton';
import { TactileToggle } from './TactileToggle';
import { ParticipantSheet } from './ParticipantSheet';
import { BiColorStatusLed } from './BiColorStatusLed';
import { RotaryChannelSelector } from './RotaryChannelSelector';
import { TransmissionHistoryDrawer } from './TransmissionHistoryDrawer';
import { SessionData, ConnectionState, TxRxState, FloorState, TransmissionRecord, RssiData, RogerBeepStyle } from '../types';

interface CommunicationScreenProps {
  session: SessionData | null;
  connectionState: ConnectionState;
  txRxState: TxRxState;
  floor: FloorState;
  participantId: string;
  leaseSecondsLeft: number;
  micVolume: number;
  speakerMuted: boolean;
  onToggleSpeakerMute: () => void;
  soundEffects: boolean;
  onToggleSoundEffects: (enabled: boolean) => void;
  rogerBeepEnabled?: boolean;
  onToggleRogerBeep?: (enabled: boolean) => void;
  rogerBeepStyle?: RogerBeepStyle;
  activeChannel: number;
  onChannelChange: (channel: number) => void;
  transmissionHistory: TransmissionRecord[];
  onClearHistory?: () => void;
  onRequestFloor: () => void;
  onReleaseFloor: () => void;
  onToggleFloor: () => void;
  onLeaveSession: () => void;
  onEndSession: () => void;
  onRemoveParticipant: (id: string) => void;
  errorMessage: string | null;
  onClearError: () => void;
  micPermissionDenied?: boolean;
  onRequestMicPermission?: () => void;
  rssi?: RssiData;
  getAudioFrequencyData?: (outputArray: Uint8Array) => void;
  getAudioTimeDomainData?: (outputArray: Uint8Array) => void;
}

export const CommunicationScreen: React.FC<CommunicationScreenProps> = ({
  session,
  connectionState,
  txRxState,
  floor,
  participantId,
  leaseSecondsLeft,
  micVolume,
  speakerMuted,
  onToggleSpeakerMute,
  soundEffects,
  onToggleSoundEffects,
  rogerBeepEnabled = true,
  onToggleRogerBeep,
  rogerBeepStyle = 'classic',
  activeChannel,
  onChannelChange,
  transmissionHistory,
  onClearHistory,
  onRequestFloor,
  onReleaseFloor,
  onToggleFloor,
  onLeaveSession,
  onEndSession,
  onRemoveParticipant,
  errorMessage,
  onClearError,
  micPermissionDenied = false,
  onRequestMicPermission,
  rssi,
  getAudioFrequencyData,
  getAudioTimeDomainData
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isHost = session ? session.hostParticipantId === participantId : false;
  const inviteUrl = session?.pin ? `${window.location.origin}/?pin=${session.pin}` : '';

  const handleShare = () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      navigator.share({
        title: 'cqrTalk® Walkie-Talkie',
        text: `Tune into my cqrTalk® radio channel! PIN: ${session?.pin}`,
        url: inviteUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between w-full max-w-md mx-auto px-1 sm:px-2 py-1 select-none min-h-0">
      
      {/* Top Physical Hardware Accents (Antenna, Bi-Color LED, PIN Pill, Channel Knob, & Volume Knob) */}
      <div className="w-full flex items-end justify-between px-4 sm:px-6 -mb-1 z-10 shrink-0">
        {/* Left: Rubberized Walkie Antenna + Bi-Color Status LED Jewel */}
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col items-center">
            <div className="w-4 h-12 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 rounded-t-md border-t border-x border-slate-600 shadow-md relative">
              <div className="absolute inset-x-0 top-3 h-0.5 bg-slate-900/60" />
              <div className="absolute inset-x-0 top-6 h-0.5 bg-slate-900/60" />
            </div>
            <div className="w-7 h-2.5 bg-slate-900 rounded-t-sm border-x border-t border-slate-700 shadow-inner" />
          </div>

          {/* Bi-Color Physical LED Domed Jewel Indicator */}
          <div className="mb-2">
            <BiColorStatusLed
              txRxState={txRxState}
              connectionState={connectionState}
              speakerMuted={speakerMuted}
            />
          </div>
        </div>

        {/* Channel PIN Pill & Quick Share */}
        <button
          type="button"
          onClick={handleShare}
          className="px-3.5 py-1 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-t-xl shadow-sm hover:from-slate-700 hover:to-slate-800 transition-all flex items-center gap-2 cursor-pointer"
          title="Share PIN & link"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-digital">
            PIN: {session?.pin || '----'}
          </span>
          {copiedLink ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {/* Right: Rotary Channel Selector Knob & Rotary Knurled Power/Volume Knob */}
        <div className="flex items-end gap-2.5">
          {/* Stepped Channel Dial */}
          <RotaryChannelSelector
            currentChannel={activeChannel}
            onChannelChange={onChannelChange}
          />

          {/* Rotary Knurled Power/Volume Knob */}
          <div
            className="flex flex-col items-center cursor-pointer group"
            onClick={onToggleSpeakerMute}
            title={speakerMuted ? "Speaker Muted (Click to activate audio)" : "Speaker Active (Click to mute)"}
          >
            <div className="w-9 h-7 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 rounded-t-md border-t border-x border-slate-500 shadow-md flex items-center justify-center relative group-hover:brightness-110 transition-all">
              <div className="flex gap-1">
                <div className="w-0.5 h-4 bg-slate-900" />
                <div className={`w-0.5 h-4 ${speakerMuted ? 'bg-rose-400' : 'bg-emerald-400'} shadow-[0_0_4px_rgba(52,211,153,0.8)]`} />
                <div className="w-0.5 h-4 bg-slate-900" />
              </div>
            </div>
            <div className="w-11 h-2 bg-slate-900 rounded-t-xs border-x border-t border-slate-700 flex items-center justify-center">
              <span className={`text-[6.5px] font-bold font-mono tracking-tighter ${speakerMuted ? 'text-rose-400' : 'text-slate-400'}`}>
                {speakerMuted ? 'MUTED' : 'VOL'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Realistic Rugged Handset Chassis */}
      <div
        id="active-radio-chassis"
        className="w-full flex-1 bg-gradient-to-b from-[#1b212c] via-[#151a23] to-[#10141b] border-2 border-slate-700/80 rounded-[28px] p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col justify-between relative overflow-y-auto overflow-x-hidden gap-2.5 sm:gap-3"
      >
        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-lg shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="px-2 py-0.5 rounded bg-rose-800 hover:bg-rose-700 text-white font-semibold text-[11px]"
            >
              OK
            </button>
          </div>
        )}

        {/* Microphone status advisory banner */}
        {micPermissionDenied && (
          <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-800/80 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-lg shrink-0">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Microphone in listen standby.</span>
            </div>
            {onRequestMicPermission && (
              <button
                type="button"
                onClick={onRequestMicPermission}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] uppercase transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                Enable Mic
              </button>
            )}
          </div>
        )}

        {/* 1. Top Backlit LCD Color Screen */}
        <RadioDisplay
          session={session}
          connectionState={connectionState}
          txRxState={txRxState}
          floor={floor}
          participantId={participantId}
          leaseSecondsLeft={leaseSecondsLeft}
          micVolume={micVolume}
          speakerMuted={speakerMuted}
          rssi={rssi}
          rogerBeepEnabled={rogerBeepEnabled}
          rogerBeepStyle={rogerBeepStyle}
          onOpenParticipants={() => setIsSheetOpen(true)}
          getAudioFrequencyData={getAudioFrequencyData}
          getAudioTimeDomainData={getAudioTimeDomainData}
        />

        {/* Last Heard / Activity Tape Drawer */}
        <div className="shrink-0">
          <TransmissionHistoryDrawer
            history={transmissionHistory}
            onClearHistory={onClearHistory}
          />
        </div>

        {/* 2. Center Tactical PTT Transmit Button */}
        <div className="py-1 flex items-center justify-center shrink-0">
          <PttButton
            txRxState={txRxState}
            connectionState={connectionState}
            currentSpeakerName={floor.currentSpeakerName}
            onRequestFloor={onRequestFloor}
            onReleaseFloor={onReleaseFloor}
            onToggleFloor={onToggleFloor}
          />
        </div>

        {/* Front Acoustic Speaker Slots */}
        <div className="w-full flex flex-col items-center gap-1 opacity-30 shrink-0">
          <div className="w-32 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-44 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-32 h-0.5 bg-black rounded-full shadow-inner" />
        </div>

        {/* 3. Bottom Radio Controls (Speaker Mute, Tones, Disconnect) */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2.5">
            {/* Speaker Mute button */}
            <button
              id="speaker-mute-button"
              type="button"
              onClick={onToggleSpeakerMute}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold uppercase transition-all flex items-center justify-center gap-1.5 border shadow-sm cursor-pointer ${
                speakerMuted
                  ? 'bg-rose-950/80 hover:bg-rose-900/80 text-rose-300 border-rose-800/80'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Speaker output mute"
            >
              {speakerMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span>{speakerMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* Sound Effects Toggle Switch */}
            <div className="p-1 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center shadow-inner" title="Master Sound Effects">
              <TactileToggle
                id="comm-screen-sound-toggle"
                checked={soundEffects}
                onChange={onToggleSoundEffects}
              />
            </div>

            {/* Quick Roger Beep Toggle */}
            {onToggleRogerBeep && (
              <button
                id="comm-screen-roger-toggle"
                type="button"
                onClick={() => onToggleRogerBeep(!rogerBeepEnabled)}
                className={`py-2 px-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 border shadow-xs cursor-pointer ${
                  rogerBeepEnabled
                    ? 'bg-amber-950/70 hover:bg-amber-900/70 border-amber-700/80 text-amber-300'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title={`Floor Release Roger Beep: ${rogerBeepEnabled ? `Active (${rogerBeepStyle})` : 'Disabled'} (Click to toggle)`}
              >
                <span className="text-[10px] tracking-wide">RGR</span>
                <div className={`w-1.5 h-1.5 rounded-full ${rogerBeepEnabled ? 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]' : 'bg-slate-600'}`} />
              </button>
            )}

            {/* Leave / End Channel */}
            {isHost ? (
              <button
                id="btn-end-session"
                type="button"
                onClick={() => {
                  if (window.confirm('End this channel session for all operators?')) {
                    onEndSession();
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-semibold uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="End channel for everyone"
              >
                <Power className="w-4 h-4 text-rose-400" />
                <span>End</span>
              </button>
            ) : (
              <button
                id="btn-leave-session"
                type="button"
                onClick={() => {
                  if (window.confirm('Leave this walkie-talkie channel?')) {
                    onLeaveSession();
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Disconnect from channel"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Clean Footer with Attribution */}
      <footer className="mt-3 text-center text-xs text-slate-500 font-medium">
        <span className="hover:text-slate-400 transition-colors select-text">
          made with ♥ by ©munabbiRMushran
        </span>
      </footer>

      {/* Participant Sheet Drawer */}
      <ParticipantSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        participants={session?.participants || []}
        currentFloor={floor}
        currentParticipantId={participantId}
        isHost={isHost}
        onRemoveParticipant={onRemoveParticipant}
        pin={session?.pin}
        groupName={session?.groupName}
      />
    </div>
  );
};
