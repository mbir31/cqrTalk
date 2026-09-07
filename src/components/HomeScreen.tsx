import React from 'react';
import { Radio, Users, Hash, Settings, Wifi, WifiOff, Battery, Volume2, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react';
import { AudioFrequencyVisualizer } from './AudioFrequencyVisualizer';
import { BiColorStatusLed } from './BiColorStatusLed';
import { RotaryChannelSelector } from './RotaryChannelSelector';
import { RssiIndicator } from './RssiIndicator';
import { RssiData } from '../types';

interface HomeScreenProps {
  onOpenCreateOneToOne: () => void;
  onOpenCreateGroup: () => void;
  onOpenJoinPin: () => void;
  onOpenSettings: () => void;
  isOnline: boolean;
  displayName: string;
  activeChannel?: number;
  onChannelChange?: (channel: number) => void;
  rssi?: RssiData;
  rogerBeepEnabled?: boolean;
  rogerBeepStyle?: string;
  errorMessage?: string | null;
  onClearError?: () => void;
  micPermissionDenied?: boolean;
  onRequestMicPermission?: () => void;
  getAudioFrequencyData?: (outputArray: Uint8Array) => void;
  getAudioTimeDomainData?: (outputArray: Uint8Array) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenCreateOneToOne,
  onOpenCreateGroup,
  onOpenJoinPin,
  onOpenSettings,
  isOnline,
  displayName,
  activeChannel = 1,
  onChannelChange,
  rssi,
  rogerBeepEnabled = true,
  rogerBeepStyle = 'classic',
  errorMessage,
  onClearError,
  micPermissionDenied = false,
  onRequestMicPermission,
  getAudioFrequencyData,
  getAudioTimeDomainData
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto px-2 py-1 select-none">
      {/* Error notification banner (kicked / session ended / join rejected) */}
      {errorMessage && (
        <div className="w-full max-w-md mb-2 p-3 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-lg z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            className="px-2 py-0.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-semibold text-[11px] cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Microphone status advisory banner if permission was previously denied/blocked */}
      {micPermissionDenied && (
        <div className="w-full max-w-md mb-2 p-3 rounded-2xl bg-amber-950/70 border border-amber-800/80 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-lg z-20">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Microphone is in listen-only standby.</span>
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

      {/* Top Physical Hardware Accents (Antenna, Bi-Color LED, Brand Plate, Channel Dial & Settings Knob) */}
      <div className="w-full flex items-end justify-between px-4 sm:px-6 -mb-1 z-10">
        {/* Rubberized Walkie Antenna + Bi-Color Status LED Jewel */}
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col items-center">
            <div className="w-3.5 h-9 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 rounded-t-md border-t border-x border-slate-600 shadow-md relative">
              <div className="absolute inset-x-0 top-2.5 h-0.5 bg-slate-900/60" />
              <div className="absolute inset-x-0 top-5 h-0.5 bg-slate-900/60" />
            </div>
            <div className="w-6 h-2 bg-slate-900 rounded-t-sm border-x border-t border-slate-700 shadow-inner" />
          </div>

          <div className="mb-1.5">
            <BiColorStatusLed
              txRxState="IDLE"
              connectionState={isOnline ? 'CONNECTED' : 'DISCONNECTED'}
              speakerMuted={false}
            />
          </div>
        </div>

        {/* Center Metal Plate: Brand Logo */}
        <div className="px-3 py-0.5 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/80 rounded-t-lg shadow-sm flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-[10px] font-bold tracking-widest text-slate-200 uppercase font-digital">
            cqrTalk® DMR
          </span>
        </div>

        {/* Right: Rotary Channel Selector Knob & Settings/Power Knob */}
        <div className="flex items-end gap-2">
          {onChannelChange && (
            <RotaryChannelSelector
              currentChannel={activeChannel}
              onChannelChange={onChannelChange}
            />
          )}

          {/* Rotary Knurled Power/Settings Knob */}
          <div
            className="flex flex-col items-center cursor-pointer group"
            onClick={onOpenSettings}
            title="Open Radio Settings"
          >
            <div className="w-8 h-6 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 rounded-t-md border-t border-x border-slate-500 shadow-md flex items-center justify-center relative group-hover:brightness-110 transition-all">
              {/* Knurling ridges */}
              <div className="flex gap-0.5">
                <div className="w-0.5 h-3.5 bg-slate-900" />
                <div className="w-0.5 h-3.5 bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                <div className="w-0.5 h-3.5 bg-slate-900" />
              </div>
            </div>
            <div className="w-10 h-1.5 bg-slate-900 rounded-t-xs border-x border-t border-slate-700 flex items-center justify-center">
              <span className="text-[6px] font-bold font-mono text-slate-400 tracking-tighter">
                CFG
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Realistic Rugged Handset Chassis */}
      <div
        id="walkie-talkie-chassis"
        className="w-full bg-gradient-to-b from-[#1b212c] via-[#151a23] to-[#10141b] border-2 border-slate-700/80 rounded-[24px] p-3.5 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col gap-3 relative overflow-hidden"
      >
        {/* Ergonomic Textured Side Grips */}
        <div className="absolute left-1 top-20 bottom-20 w-1 flex flex-col justify-around opacity-30 pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-1.5 w-full bg-black rounded-full shadow-inner" />
          ))}
        </div>
        <div className="absolute right-1 top-20 bottom-20 w-1 flex flex-col justify-around opacity-30 pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-1.5 w-full bg-black rounded-full shadow-inner" />
          ))}
        </div>

        {/* Realistic Backlit Digital Color LCD Screen */}
        <div className="w-full bg-[#090d14] rounded-xl border-2 border-slate-800 p-2.5 sm:p-3 shadow-[inset_0_2px_12px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.1)] relative">
          
          {/* Top LCD Status Bar */}
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 text-[10px] text-slate-400">
            {/* Signal & Tech */}
            <div className="flex items-center gap-1.5">
              {rssi ? (
                <RssiIndicator rssi={rssi} connectionState={isOnline ? 'CONNECTED' : 'DISCONNECTED'} />
              ) : (
                <div className="flex items-end gap-0.5 h-3">
                  <div className="w-1 h-1 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-1.5 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-2 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-3 bg-emerald-400 rounded-2xs" />
                </div>
              )}
              <span className="font-semibold text-slate-300 text-[10px] tracking-wide">
                WEBRTC DMR
              </span>
              {rogerBeepEnabled && (
                <span
                  className="px-1 py-0.2 rounded-md bg-amber-950/70 border border-amber-800/60 text-amber-400 font-mono text-[8.5px] font-bold tracking-wider uppercase"
                  title={`Roger Beep Active (${rogerBeepStyle})`}
                >
                  RGR
                </span>
              )}
            </div>

            {/* Battery & Online Status */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold ${
                isOnline ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
              }`}>
                <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>

              <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                <Battery className="w-3 h-3 text-emerald-400" />
                <span className="font-mono text-[9px]">100%</span>
              </div>
            </div>
          </div>

          {/* Main Display Channel & Operator Info */}
          <div className="py-0.5 text-center space-y-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 block">
              CURRENT FREQUENCY STANDBY
            </span>

            <div className="text-xl sm:text-2xl font-bold tracking-wide text-emerald-400 font-digital drop-shadow-[0_0_10px_rgba(52,211,153,0.35)]">
              CH {activeChannel.toString().padStart(2, '0')} // {(462.5625 + (activeChannel - 1) * 0.025).toFixed(4)} MHz
            </div>

            <div className="pt-0.5 flex items-center justify-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">
                Call Sign:
              </span>
              <span className="text-[11px] font-bold text-white bg-slate-800/90 px-2 py-0.2 rounded-md border border-slate-700">
                {displayName || 'Operator'}
              </span>
            </div>
          </div>

          {/* Audio Frequency Visualizer (Carrier Spectrum Standby) */}
          <div className="mt-1.5">
            <AudioFrequencyVisualizer
              txRxState="IDLE"
              getAudioFrequencyData={getAudioFrequencyData}
              getAudioTimeDomainData={getAudioTimeDomainData}
              height={32}
            />
          </div>

          {/* Clean Audio Ready Status Pill */}
          <div className="mt-1.5 py-1 px-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Carrier Lock Ready</span>
            </div>
            <span className="text-[9px] font-mono text-slate-400">
              Half-Duplex PTT
            </span>
          </div>
        </div>

        {/* Front Acoustic Speaker Slots */}
        <div className="w-full flex flex-col items-center gap-0.5 py-0.5 opacity-35">
          <div className="w-32 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-44 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-32 h-0.5 bg-black rounded-full shadow-inner" />
        </div>

        {/* Primary Handset Channel Selectors (P1 & P2 style) */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase px-0.5 block">
            Select Channel Mode
          </span>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* 1-TO-1 BUTTON */}
            <button
              id="home-btn-one-to-one"
              type="button"
              onClick={onOpenCreateOneToOne}
              className="group p-2.5 sm:p-3 bg-gradient-to-b from-[#202735] to-[#181d28] hover:from-[#262f40] hover:to-[#1e2533] active:from-[#161a24] active:to-[#131720] border border-slate-700/80 hover:border-emerald-500/50 rounded-xl transition-all shadow-sm flex flex-col items-start gap-1.5 cursor-pointer text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs sm:text-[13px] font-bold text-white block leading-tight">
                  1-to-1 Private
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                  Direct peer connection
                </span>
              </div>
            </button>

            {/* GROUP BUTTON */}
            <button
              id="home-btn-group"
              type="button"
              onClick={onOpenCreateGroup}
              className="group p-2.5 sm:p-3 bg-gradient-to-b from-[#202735] to-[#181d28] hover:from-[#262f40] hover:to-[#1e2533] active:from-[#161a24] active:to-[#131720] border border-slate-700/80 hover:border-amber-500/50 rounded-xl transition-all shadow-sm flex flex-col items-start gap-1.5 cursor-pointer text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-700/60 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs sm:text-[13px] font-bold text-white block leading-tight">
                  Group Dispatch
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                  Up to 15 operators
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Secondary Front Panel Buttons (Tuning & Settings) */}
        <div className="flex gap-2 pt-0.5">
          <button
            id="home-btn-join-pin"
            type="button"
            onClick={onOpenJoinPin}
            className="flex-1 py-2 px-3 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 rounded-lg text-slate-200 text-[11px] font-semibold tracking-wider uppercase transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Hash className="w-3.5 h-3.5 text-emerald-400" />
            Tune In with PIN
          </button>

          <button
            id="home-btn-settings"
            type="button"
            onClick={onOpenSettings}
            className="py-2 px-3 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 rounded-lg text-slate-300 text-[11px] font-semibold uppercase transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            title="Configure Radio"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            Config
          </button>
        </div>
      </div>

      {/* Clean, Non-Congested Footer with Attribution */}
      <footer className="mt-3 text-center text-xs text-slate-500 font-medium">
        <span className="hover:text-slate-400 transition-colors select-text">
          made with ♥ by ©munabbiRMushran
        </span>
      </footer>
    </div>
  );
};
