import React from 'react';
import { Radio, Wifi, WifiOff, Volume2, VolumeX, Battery, Users, Lock, Mic } from 'lucide-react';
import { ConnectionState, TxRxState, FloorState, SessionData, RssiData } from '../types';
import { AudioFrequencyVisualizer } from './AudioFrequencyVisualizer';
import { RssiIndicator } from './RssiIndicator';

interface RadioDisplayProps {
  session: SessionData | null;
  connectionState: ConnectionState;
  txRxState: TxRxState;
  floor: FloorState;
  participantId: string;
  leaseSecondsLeft: number;
  micVolume: number;
  speakerMuted: boolean;
  rssi?: RssiData;
  rogerBeepEnabled?: boolean;
  rogerBeepStyle?: string;
  onOpenParticipants: () => void;
  getAudioFrequencyData?: (outputArray: Uint8Array) => void;
  getAudioTimeDomainData?: (outputArray: Uint8Array) => void;
}

export const RadioDisplay: React.FC<RadioDisplayProps> = ({
  session,
  connectionState,
  txRxState,
  floor,
  participantId,
  leaseSecondsLeft,
  micVolume,
  speakerMuted,
  rssi,
  rogerBeepEnabled,
  rogerBeepStyle,
  onOpenParticipants,
  getAudioFrequencyData,
  getAudioTimeDomainData
}) => {
  const isTransmitting = txRxState === 'TRANSMITTING';
  const isReceiving = txRxState === 'RECEIVING';
  const isBusy = txRxState === 'BUSY';
  const isRequesting = txRxState === 'REQUESTING';
  const isConnected = connectionState === 'CONNECTED';

  const onlineCount = session ? session.participants.filter(p => p.isOnline).length : 1;
  const maxCapacity = session?.type === 'one-to-one' ? 2 : 15;

  return (
    <div
      id="radio-lcd-bezel"
      className="w-full bg-[#080c14] border-2 border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-[inset_0_2px_12px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.08)] relative overflow-hidden"
    >
      {/* Subtle anti-glare screen gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none" />

      {/* Top LCD Status Header */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 text-[10px]">
        {/* Signal & Channel Indicator */}
        <div className="flex items-center gap-1.5">
          {/* RSSI Signal Indicator with real-time latency fluctuation */}
          {rssi ? (
            <RssiIndicator rssi={rssi} connectionState={connectionState} />
          ) : (
            <div className="flex items-end gap-0.5 h-3">
              <div className={`w-1 h-1 rounded-2xs ${isConnected ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              <div className={`w-1 h-1.5 rounded-2xs ${isConnected ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              <div className={`w-1 h-2 rounded-2xs ${isConnected ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              <div className={`w-1 h-3 rounded-2xs ${isConnected ? 'bg-emerald-400' : 'bg-slate-700'}`} />
            </div>
          )}
          <span className="font-bold text-slate-300 text-[10px] tracking-wide">
            {session?.type === 'one-to-one' ? 'CH 01 // 1:1' : 'CH 02 // GRP'}
          </span>

          {session?.pin && (
            <span className="px-1.5 py-0.2 rounded-md bg-slate-800/90 text-emerald-400 font-digital font-bold text-[10px] border border-slate-700">
              PIN {session.pin}
            </span>
          )}

          {rogerBeepEnabled && (
            <span
              className="px-1 py-0.2 rounded-md bg-amber-950/70 border border-amber-800/60 text-amber-400 font-mono text-[8.5px] font-bold tracking-wider uppercase"
              title={`Roger Beep active (${rogerBeepStyle || 'classic'})`}
            >
              RGR
            </span>
          )}
        </div>

        {/* Right Status Indicators */}
        <div className="flex items-center gap-1.5">
          {speakerMuted && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-rose-950/80 text-rose-400 border border-rose-800/50 text-[9px] font-semibold">
              <VolumeX className="w-2.5 h-2.5" />
              MUTED
            </span>
          )}

          {/* Participants pill */}
          <button
            type="button"
            onClick={onOpenParticipants}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors text-[9.5px] font-semibold cursor-pointer"
            title="Channel Participants"
          >
            <Users className="w-2.5 h-2.5 text-emerald-400" />
            <span>{onlineCount}/{maxCapacity}</span>
          </button>

          {/* Battery */}
          <div className="flex items-center gap-0.5 text-slate-400 text-[10px]">
            <Battery className="w-3 h-3 text-emerald-400" />
          </div>
        </div>
      </div>

      {/* Main Center Readout */}
      <div className="py-0.5 space-y-1.5">
        {/* Channel Name */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[200px]">
            {session?.groupName || 'Point-to-Point Channel'}
          </span>
          <span className="text-[9px] font-mono text-slate-500 uppercase">
            Half-Duplex
          </span>
        </div>

        {/* Dynamic TX / RX Status Banner */}
        <div className="min-h-[40px] rounded-lg flex items-center justify-between p-2 sm:p-2.5 transition-all duration-200 border">
          {isTransmitting ? (
            /* TRANSMITTING (TX) */
            <div className="w-full flex items-center justify-between bg-rose-950/40 -m-2 sm:-m-2.5 p-2 sm:p-2.5 rounded-lg border border-rose-700/60 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                <div>
                  <div className="text-[8.5px] font-bold tracking-widest text-rose-400 uppercase leading-none">
                    ON-AIR TRANSMITTING
                  </div>
                  <div className="text-xs font-bold text-white tracking-wide mt-0.5">
                    You have the floor (TX)
                  </div>
                  <div className="text-[8.5px] text-rose-300/80 font-mono">
                    PTT Active • Release button below to finish
                  </div>
                </div>
              </div>
              {leaseSecondsLeft > 0 && (
                <div className="text-right">
                  <div className="text-[8px] text-rose-400 uppercase font-semibold">Lease</div>
                  <div className="text-sm font-digital font-bold text-white leading-none">
                    {leaseSecondsLeft}s
                  </div>
                </div>
              )}
            </div>
          ) : isReceiving && floor.currentSpeakerName ? (
            /* RECEIVING (RX) */
            <div className="w-full flex items-center justify-between bg-emerald-950/40 -m-2 sm:-m-2.5 p-2 sm:p-2.5 rounded-lg border border-emerald-700/60 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <div>
                  <div className="text-[8.5px] font-bold tracking-widest text-emerald-400 uppercase leading-none">
                    INCOMING AUDIO FEED
                  </div>
                  <div className="text-xs font-bold text-white tracking-wide truncate max-w-[200px] mt-0.5">
                    {floor.currentSpeakerName} is speaking
                  </div>
                  <div className="text-[8.5px] text-emerald-300/90 font-mono">
                    Floor busy • Ready below when clear
                  </div>
                </div>
              </div>
              <div className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[9px] font-bold">
                RX ON
              </div>
            </div>
          ) : isBusy ? (
            /* BUSY / LOCKED */
            <div className="w-full flex items-center justify-between bg-amber-950/30 -m-2 sm:-m-2.5 p-2 sm:p-2.5 rounded-lg border border-amber-800/50">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <div>
                  <div className="text-[8.5px] font-bold tracking-widest text-amber-400 uppercase leading-none">
                    CHANNEL ARBITRATED
                  </div>
                  <div className="text-[11px] font-semibold text-slate-200 mt-0.5">
                    Floor occupied • Please wait
                  </div>
                </div>
              </div>
            </div>
          ) : isRequesting ? (
            /* REQUESTING */
            <div className="w-full flex items-center gap-2 bg-slate-900/60 -m-2 sm:-m-2.5 p-2 sm:p-2.5 rounded-lg border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <div className="text-[11px] font-semibold text-slate-300">
                Acquiring transmission floor...
              </div>
            </div>
          ) : (
            /* IDLE & READY */
            <div className="w-full flex items-center justify-between bg-slate-900/50 -m-2 sm:-m-2.5 p-2 sm:p-2.5 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                <span>Channel Ready • Hold PTT below</span>
              </div>
              <span className="text-[9px] font-digital text-emerald-400 font-bold">
                STANDBY
              </span>
            </div>
          )}
        </div>

        {/* Real-time Audio Frequency Visualizer (Spectrum / Waveform / Dual) */}
        <div className="pt-0.5">
          <AudioFrequencyVisualizer
            txRxState={txRxState}
            getAudioFrequencyData={getAudioFrequencyData}
            getAudioTimeDomainData={getAudioTimeDomainData}
            height={32}
          />
        </div>

        {/* Clean Audio VU Level Meter Bar */}
        <div className="pt-0.5 flex items-center gap-2">
          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
            Audio
          </span>

          <div className="flex-1 h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex p-0.5 gap-0.5">
            {Array.from({ length: 16 }).map((_, i) => {
              const activeCount = isTransmitting
                ? Math.min(16, Math.ceil((micVolume / 100) * 16))
                : isReceiving
                ? 10 + (i % 3)
                : 1;

              const isActive = i < activeCount;
              let barColor = 'bg-emerald-400';
              if (i >= 13) barColor = 'bg-rose-500';
              else if (i >= 10) barColor = 'bg-amber-400';

              return (
                <div
                  key={i}
                  className={`flex-1 h-full rounded-2xs transition-all duration-75 ${
                    isActive ? barColor : 'bg-slate-800/50'
                  }`}
                />
              );
            })}
          </div>

          <span className="text-[9px] font-digital font-bold text-slate-400 w-7 text-right">
            {isTransmitting ? `${micVolume}%` : isReceiving ? 'LIVE' : 'AUTO'}
          </span>
        </div>
      </div>
    </div>
  );
};
