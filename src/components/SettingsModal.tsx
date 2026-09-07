import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, User, Volume2, Mic, Download, ShieldCheck, Radio, Check, Activity, RefreshCw, Zap, Play, Square } from 'lucide-react';
import { TactileToggle } from './TactileToggle';
import { RogerBeepStyle } from '../types';
import { previewRogerBeep } from '../utils/audioTones';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
  soundEffects: boolean;
  onToggleSoundEffects: (enabled: boolean) => void;
  rogerBeepEnabled?: boolean;
  onToggleRogerBeep?: (enabled: boolean) => void;
  rogerBeepStyle?: RogerBeepStyle;
  onChangeRogerBeepStyle?: (style: RogerBeepStyle) => void;
  hapticsEnabled?: boolean;
  onToggleHaptics?: (enabled: boolean) => void;
  rfFilterEnabled?: boolean;
  onToggleRfFilter?: (enabled: boolean) => void;
  squelchTailEnabled?: boolean;
  onToggleSquelchTail?: (enabled: boolean) => void;
  speakerMuted: boolean;
  onToggleSpeakerMute: () => void;
  onStartMicCheck?: () => Promise<boolean>;
  onStopMicCheckAndPlay?: (onEnded?: () => void) => void;
  onCancelMicCheck?: () => void;
  onGetMicVolumeLevel?: () => number;
  rttMs?: number;
  packetLossPct?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  displayName,
  onSaveDisplayName,
  soundEffects,
  onToggleSoundEffects,
  rogerBeepEnabled = true,
  onToggleRogerBeep,
  rogerBeepStyle = 'classic' as RogerBeepStyle,
  onChangeRogerBeepStyle,
  hapticsEnabled = true,
  onToggleHaptics,
  rfFilterEnabled = true,
  onToggleRfFilter,
  squelchTailEnabled = true,
  onToggleSquelchTail,
  speakerMuted,
  onToggleSpeakerMute,
  onStartMicCheck,
  onStopMicCheckAndPlay,
  onCancelMicCheck,
  onGetMicVolumeLevel,
  rttMs = 24,
  packetLossPct = 0
}) => {
  const [nameInput, setNameInput] = useState(displayName);
  const [isSaved, setIsSaved] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Mic check loopback test states
  const [micCheckState, setMicCheckState] = useState<'idle' | 'recording' | 'playing'>('idle');
  const [micCheckSeconds, setMicCheckSeconds] = useState(3);
  const [micCheckLevel, setMicCheckLevel] = useState(0);
  const micIntervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

  // Clean up mic check on unmount/close
  useEffect(() => {
    if (!isOpen) {
      if (micCheckState !== 'idle') {
        onCancelMicCheck?.();
        setMicCheckState('idle');
      }
      if (micIntervalRef.current) {
        clearInterval(micIntervalRef.current);
        micIntervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  }, [isOpen, micCheckState, onCancelMicCheck]);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!isOpen) return null;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDisplayName(nameInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  const handleStartMicTest = async () => {
    if (!onStartMicCheck) return;
    const ok = await onStartMicCheck();
    if (!ok) return;

    setMicCheckState('recording');
    setMicCheckSeconds(3);

    // Track level meter
    micIntervalRef.current = window.setInterval(() => {
      if (onGetMicVolumeLevel) {
        setMicCheckLevel(onGetMicVolumeLevel());
      }
    }, 80);

    let remaining = 3;
    countdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setMicCheckSeconds(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) {
          window.clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        if (micIntervalRef.current) {
          window.clearInterval(micIntervalRef.current);
          micIntervalRef.current = null;
        }
        setMicCheckState('playing');
        onStopMicCheckAndPlay?.(() => {
          setMicCheckState('idle');
          setMicCheckLevel(0);
        });
      }
    }, 1000);
  };

  const handleCancelMicTest = () => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (micIntervalRef.current) {
      window.clearInterval(micIntervalRef.current);
      micIntervalRef.current = null;
    }
    onCancelMicCheck?.();
    setMicCheckState('idle');
    setMicCheckLevel(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1b212c] to-[#12161f] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#141822]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Radio Configuration
              </h2>
              <span className="text-[11px] text-slate-400">
                Audio hardware & protocol preferences
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Operator Call Sign */}
          <form onSubmit={handleSaveName} className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Operator Call Sign
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={24}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Operator"
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 shadow-inner"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer"
              >
                {isSaved ? <Check className="w-4 h-4" /> : 'Save'}
              </button>
            </div>
          </form>

          {/* Interactive Mic Check & Audio Quality Diagnostic */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Acoustic Mic Loopback Check</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Record 3s sample to preview your voice through the radio DSP filter.
                </p>
              </div>
            </div>

            {/* Mic Meter & Action */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3">
              {micCheckState === 'idle' && (
                <button
                  type="button"
                  onClick={handleStartMicTest}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Test Microphone (3s)</span>
                </button>
              )}

              {micCheckState === 'recording' && (
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-amber-300 font-bold">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                        RECORDING VOICE...
                      </span>
                      <span>{micCheckSeconds}s left</span>
                    </div>
                    {/* Live VU meter bar */}
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-75"
                        style={{ width: `${Math.max(5, micCheckLevel)}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelMicTest}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {micCheckState === 'playing' && (
                <div className="flex-1 flex items-center justify-between py-1.5 px-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs font-semibold animate-pulse">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-amber-400" />
                    Playing Loopback Audio...
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelMicTest}
                    className="text-[10px] uppercase font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sound Effects Toggle Switch */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Master Radio Tones
              </div>
              <p className="text-[11px] text-slate-400">
                PTT key chirps, incoming call chimes, and channel rotary clicks.
              </p>
            </div>
            <TactileToggle
              id="settings-sound-toggle"
              checked={soundEffects}
              onChange={onToggleSoundEffects}
            />
          </div>

          {/* Optional Roger Beep Sound Effect */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>'Roger' Beep Confirmation</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-semibold uppercase">
                    Half-Duplex
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Acoustic tone played upon releasing the floor, signaling over-to-listen.
                </p>
              </div>
              <TactileToggle
                id="settings-roger-beep-toggle"
                checked={rogerBeepEnabled}
                onChange={(checked) => onToggleRogerBeep?.(checked)}
              />
            </div>

            {rogerBeepEnabled && (
              <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">Tone Acoustic Style</span>
                  <button
                    type="button"
                    onClick={() => previewRogerBeep(rogerBeepStyle)}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 bg-amber-950/50 hover:bg-amber-950/80 border border-amber-800/70 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Test Beep</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'classic', label: 'Classic Dual', desc: '1150/1780 Hz DMR' },
                    { id: 'nasa', label: 'NASA Quindar', desc: '2475 Hz Apollo' },
                    { id: 'tactical', label: 'Tactical MDC', desc: '1850/1310 Hz Chirp' },
                    { id: 'cb', label: 'CB Radio', desc: '1520 Hz Single' }
                  ].map((style) => {
                    const isSelected = rogerBeepStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => {
                          onChangeRogerBeepStyle?.(style.id as RogerBeepStyle);
                          previewRogerBeep(style.id as RogerBeepStyle);
                        }}
                        className={`text-left p-2 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/50 border-amber-600/80 text-white shadow-xs'
                            : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{style.label}</span>
                          {isSelected && <Check className="w-3 h-3 text-amber-400" />}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{style.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Squelch Tail Noise Burst */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                RF Squelch Tail Burst
              </div>
              <p className="text-[11px] text-slate-400">
                Authentic FM carrier cutoff burst noise when keying releases.
              </p>
            </div>
            <TactileToggle
              id="settings-squelch-toggle"
              checked={squelchTailEnabled}
              onChange={(checked) => onToggleSquelchTail?.(checked)}
            />
          </div>

          {/* Tactical Mobile Haptics */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Tactile Haptic Feedback
              </div>
              <p className="text-[11px] text-slate-400">
                Vibrate on PTT keydown, transmission grant, and rotary knob clicks.
              </p>
            </div>
            <TactileToggle
              id="settings-haptics-toggle"
              checked={hapticsEnabled}
              onChange={(checked) => onToggleHaptics?.(checked)}
            />
          </div>

          {/* Tactical Voice Bandpass DSP Filter */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Tactical RF Bandpass Filter
              </div>
              <p className="text-[11px] text-slate-400">
                300 Hz - 3.4 kHz speech equalizer for authentic military radio acoustics.
              </p>
            </div>
            <TactileToggle
              id="settings-rf-filter-toggle"
              checked={rfFilterEnabled}
              onChange={(checked) => onToggleRfFilter?.(checked)}
            />
          </div>

          {/* Speaker Mute Control */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Speaker Output
              </div>
              <p className="text-[11px] text-slate-400">
                Mutes incoming speaker audio without disconnecting.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleSpeakerMute}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                speakerMuted
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800/80'
                  : 'bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              {speakerMuted ? 'Muted' : 'Active'}
            </button>
          </div>

          {/* PWA Installation Card */}
          {deferredPrompt && !isInstalled && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Install Walkie-Talkie App
                </div>
                <p className="text-[11px] text-emerald-300/70">
                  Fullscreen standalone access with tactile vibrations.
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstallPwa}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
            </div>
          )}

          {/* Audio Engine Specs */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-2">
            <div className="text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Hardware & DSP Engine Specs
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Duplex Control:</span>
              <span className="text-slate-200 font-medium">Half-Duplex (Authoritative)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Playout Buffer Target:</span>
              <span className="text-emerald-400 font-medium">0ms (Zero-Buffer Instant)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>In-Band Error Correction:</span>
              <span className="text-emerald-400 font-medium">FEC + DTX Enabled</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Noise & Rumble Suppression:</span>
              <span className="text-emerald-400 font-medium">80Hz High-Pass + Dynamics</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Live Round-Trip RTT:</span>
              <span className="text-slate-200 font-medium font-mono">{rttMs} ms</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Packet Loss:</span>
              <span className="text-slate-200 font-medium font-mono">{packetLossPct}%</span>
            </div>
          </div>
        </div>

        {/* Footer Credit */}
        <div className="p-3 border-t border-slate-800 bg-[#141822] text-center">
          <p className="text-xs text-slate-400">
            made with ♥ by ©munabbiRMushran
          </p>
        </div>
      </div>
    </div>
  );
};
