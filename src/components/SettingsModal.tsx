import React, { useState, useEffect } from 'react';
import { Settings, X, User, Volume2, Mic, Download, ShieldCheck, Radio, Check } from 'lucide-react';
import { TactileToggle } from './TactileToggle';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
  soundEffects: boolean;
  onToggleSoundEffects: (enabled: boolean) => void;
  hapticsEnabled?: boolean;
  onToggleHaptics?: (enabled: boolean) => void;
  rfFilterEnabled?: boolean;
  onToggleRfFilter?: (enabled: boolean) => void;
  squelchTailEnabled?: boolean;
  onToggleSquelchTail?: (enabled: boolean) => void;
  speakerMuted: boolean;
  onToggleSpeakerMute: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  displayName,
  onSaveDisplayName,
  soundEffects,
  onToggleSoundEffects,
  hapticsEnabled = true,
  onToggleHaptics,
  rfFilterEnabled = true,
  onToggleRfFilter,
  squelchTailEnabled = true,
  onToggleSquelchTail,
  speakerMuted,
  onToggleSpeakerMute
}) => {
  const [nameInput, setNameInput] = useState(displayName);
  const [isSaved, setIsSaved] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

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

          {/* Sound Effects Toggle Switch */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Radio Roger & Chirp Tones
              </div>
              <p className="text-[11px] text-slate-400">
                PTT squelch chirps, dual-tone roger beeps, and busy alerts.
              </p>
            </div>
            <TactileToggle
              id="settings-sound-toggle"
              checked={soundEffects}
              onChange={onToggleSoundEffects}
            />
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
              Hardware & Protocol Specs
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Duplex Control:</span>
              <span className="text-slate-200 font-medium">Half-Duplex (Authoritative)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Echo Cancellation:</span>
              <span className="text-emerald-400 font-medium">Hardware Enabled</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Audio Codec:</span>
              <span className="text-slate-200 font-medium">WebRTC Opus (48 kHz)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Floor Lease Ceiling:</span>
              <span className="text-slate-200 font-medium">25 Seconds Maximum</span>
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
