import React from 'react';
import { Radio, Users, Hash, Settings, Wifi, WifiOff, Battery, Volume2, ShieldCheck, Sparkles } from 'lucide-react';
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
  getAudioFrequencyData,
  getAudioTimeDomainData
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto px-2 py-1 select-none">
      
      {/* Top Physical Hardware Accents (Antenna, Bi-Color LED, Brand Plate, Channel Dial & Settings Knob) */}
      <div className="w-full flex items-end justify-between px-4 sm:px-6 -mb-1 z-10">
        {/* Rubberized Walkie Antenna + Bi-Color Status LED Jewel */}
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col items-center">
            <div className="w-4 h-12 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 rounded-t-md border-t border-x border-slate-600 shadow-md relative">
              <div className="absolute inset-x-0 top-3 h-0.5 bg-slate-900/60" />
              <div className="absolute inset-x-0 top-6 h-0.5 bg-slate-900/60" />
            </div>
            <div className="w-7 h-2.5 bg-slate-900 rounded-t-sm border-x border-t border-slate-700 shadow-inner" />
          </div>

          <div className="mb-2">
            <BiColorStatusLed
              txRxState="IDLE"
              connectionState={isOnline ? 'CONNECTED' : 'DISCONNECTED'}
              speakerMuted={false}
            />
          </div>
        </div>

        {/* Center Metal Plate: Brand Logo */}
        <div className="px-3.5 py-1 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/80 rounded-t-lg shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-digital">
            cqrTalk DMR
          </span>
        </div>

        {/* Right: Rotary Channel Selector Knob & Settings/Power Knob */}
        <div className="flex items-end gap-2.5">
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
            <div className="w-9 h-7 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 rounded-t-md border-t border-x border-slate-500 shadow-md flex items-center justify-center relative group-hover:brightness-110 transition-all">
              {/* Knurling ridges */}
              <div className="flex gap-1">
                <div className="w-0.5 h-4 bg-slate-900" />
                <div className="w-0.5 h-4 bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                <div className="w-0.5 h-4 bg-slate-900" />
              </div>
            </div>
            <div className="w-11 h-2 bg-slate-900 rounded-t-xs border-x border-t border-slate-700 flex items-center justify-center">
              <span className="text-[6.5px] font-bold font-mono text-slate-400 tracking-tighter">
                CFG
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Realistic Rugged Handset Chassis */}
      <div
        id="walkie-talkie-chassis"
        className="w-full bg-gradient-to-b from-[#1b212c] via-[#151a23] to-[#10141b] border-2 border-slate-700/80 rounded-[28px] p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col gap-4 relative overflow-hidden"
      >
        {/* Ergonomic Textured Side Grips */}
        <div className="absolute left-1 top-24 bottom-24 w-1.5 flex flex-col justify-around opacity-30 pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-2 w-full bg-black rounded-full shadow-inner" />
          ))}
        </div>
        <div className="absolute right-1 top-24 bottom-24 w-1.5 flex flex-col justify-around opacity-30 pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-2 w-full bg-black rounded-full shadow-inner" />
          ))}
        </div>

        {/* Realistic Backlit Digital Color LCD Screen */}
        <div className="w-full bg-[#090d14] rounded-2xl border-2 border-slate-800 p-3.5 sm:p-4 shadow-[inset_0_2px_12px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.1)] relative">
          
          {/* Top LCD Status Bar */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800/80 text-xs text-slate-400">
            {/* Signal & Tech */}
            <div className="flex items-center gap-2">
              {rssi ? (
                <RssiIndicator rssi={rssi} connectionState={isOnline ? 'CONNECTED' : 'DISCONNECTED'} />
              ) : (
                <div className="flex items-end gap-0.5 h-3.5">
                  <div className="w-1 h-1.5 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-2 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-2.5 bg-emerald-400 rounded-2xs" />
                  <div className="w-1 h-3.5 bg-emerald-400 rounded-2xs" />
                </div>
              )}
              <span className="font-semibold text-slate-300 text-[11px] tracking-wide">
                WEBRTC DMR
              </span>
              {rogerBeepEnabled && (
                <span
                  className="px-1.5 py-0.5 rounded-md bg-amber-950/70 border border-amber-800/60 text-amber-400 font-mono text-[9px] font-bold tracking-wider uppercase"
                  title={`Roger Beep Active (${rogerBeepStyle})`}
                >
                  RGR
                </span>
              )}
            </div>

            {/* Battery & Online Status */}
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isOnline ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>

              <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                <Battery className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-[10px]">100%</span>
              </div>
            </div>
          </div>

          {/* Main Display Channel & Operator Info */}
          <div className="py-1 text-center space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 block">
              CURRENT FREQUENCY STANDBY
            </span>

            <div className="text-2xl sm:text-3xl font-bold tracking-wider text-emerald-400 font-digital drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]">
              CH {activeChannel.toString().padStart(2, '0')} // {(462.5625 + (activeChannel - 1) * 0.025).toFixed(4)} MHz
            </div>

            <div className="pt-1 flex items-center justify-center gap-2">
              <span className="text-xs text-slate-300 font-medium">
                Call Sign:
              </span>
              <span className="text-xs font-bold text-white bg-slate-800/90 px-2.5 py-0.5 rounded-md border border-slate-700">
                {displayName || 'Operator'}
              </span>
            </div>
          </div>

          {/* Audio Frequency Visualizer (Carrier Spectrum Standby) */}
          <div className="mt-2.5">
            <AudioFrequencyVisualizer
              txRxState="IDLE"
              getAudioFrequencyData={getAudioFrequencyData}
              getAudioTimeDomainData={getAudioTimeDomainData}
              height={52}
            />
          </div>

          {/* Clean Audio Ready Status Pill */}
          <div className="mt-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between px-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Carrier Lock Ready</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Half-Duplex PTT
            </span>
          </div>
        </div>

        {/* Front Acoustic Speaker Slots */}
        <div className="w-full flex flex-col items-center gap-1 py-1 opacity-40">
          <div className="w-36 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-48 h-0.5 bg-black rounded-full shadow-inner" />
          <div className="w-36 h-0.5 bg-black rounded-full shadow-inner" />
        </div>

        {/* Primary Handset Channel Selectors (P1 & P2 style) */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase px-1 block">
            Select Channel Mode
          </span>

          <div className="grid grid-cols-2 gap-3">
            {/* 1-TO-1 BUTTON */}
            <button
              id="home-btn-one-to-one"
              type="button"
              onClick={onOpenCreateOneToOne}
              className="group p-3.5 bg-gradient-to-b from-[#202735] to-[#181d28] hover:from-[#262f40] hover:to-[#1e2533] active:from-[#161a24] active:to-[#131720] border border-slate-700/80 hover:border-emerald-500/50 rounded-2xl transition-all shadow-md flex flex-col items-start gap-2.5 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">
                  1-to-1 Private
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Direct peer connection
                </span>
              </div>
            </button>

            {/* GROUP BUTTON */}
            <button
              id="home-btn-group"
              type="button"
              onClick={onOpenCreateGroup}
              className="group p-3.5 bg-gradient-to-b from-[#202735] to-[#181d28] hover:from-[#262f40] hover:to-[#1e2533] active:from-[#161a24] active:to-[#131720] border border-slate-700/80 hover:border-amber-500/50 rounded-2xl transition-all shadow-md flex flex-col items-start gap-2.5 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-950/80 border border-amber-700/60 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">
                  Group Dispatch
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Up to 15 operators
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Secondary Front Panel Buttons (Tuning & Settings) */}
        <div className="flex gap-2.5 pt-1">
          <button
            id="home-btn-join-pin"
            type="button"
            onClick={onOpenJoinPin}
            className="flex-1 py-3 px-4 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 rounded-xl text-slate-200 text-xs font-semibold tracking-wider uppercase transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Hash className="w-4 h-4 text-emerald-400" />
            Tune In with PIN
          </button>

          <button
            id="home-btn-settings"
            type="button"
            onClick={onOpenSettings}
            className="py-3 px-4 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 rounded-xl text-slate-300 text-xs font-semibold uppercase transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            title="Configure Radio"
          >
            <Settings className="w-4 h-4 text-slate-400" />
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
