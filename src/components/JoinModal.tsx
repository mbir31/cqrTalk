import React, { useState, useEffect } from 'react';
import { Radio, Hash, X, ArrowRight } from 'lucide-react';

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
  onJoin: (sessionId: string) => void;
  initialPin?: string;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  isOpen,
  onClose,
  displayName,
  onSaveDisplayName,
  onJoin,
  initialPin = ''
}) => {
  const [pin, setPin] = useState(initialPin);
  const [operatorName, setOperatorName] = useState(displayName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPin) {
      setPin(initialPin.replace(/\D/g, '').slice(0, 4));
    }
  }, [initialPin]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing inside the operator name input, don't intercept digits
      if (document.activeElement?.tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setPin(prev => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (cleanPin.length < 4) {
      setError('Please enter a valid 4-digit PIN');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let resolvedSessionId = `pin_${cleanPin}`;

      const isStaticHost = typeof window !== 'undefined' && 
        (window.location.hostname.includes('vercel.app') || 
         window.location.hostname.includes('netlify.app') || 
         window.location.hostname.includes('github.io'));

      try {
        const res = await fetch('/api/sessions/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cleanPin })
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.sessionId) {
            resolvedSessionId = data.sessionId;
          }
        } else if (!isStaticHost) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || (res.status === 404 ? 'No active channel found with this PIN.' : 'Unable to tune into channel.'));
        }
      } catch (fetchErr: any) {
        if (fetchErr.message && (fetchErr.message.includes('No active') || fetchErr.message.includes('Too many') || fetchErr.message.includes('expired') || fetchErr.message.includes('full'))) {
          throw fetchErr;
        }
        // If static host or offline, fallback to direct PIN mesh
      }

      onSaveDisplayName(operatorName);
      onJoin(resolvedSessionId);
    } catch (err: any) {
      setError(err.message || 'Unable to join channel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1b212c] to-[#12161f] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#141822]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center justify-center font-bold">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Tune Into PIN
              </h2>
              <span className="text-[11px] text-slate-400">
                Connect to an existing frequency
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

        <div className="p-5 space-y-4">
          <form onSubmit={handleJoin} className="space-y-4">
            {/* 4-Digit Display View */}
            <div className="p-4 rounded-2xl bg-[#090d14] border border-slate-800 text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">
              <span className="text-[11px] font-semibold text-emerald-400 tracking-widest uppercase block mb-1">
                Enter 4-Digit PIN
              </span>
              <div className="text-4xl font-digital font-bold tracking-[0.35em] text-emerald-400 py-1 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]">
                {pin.padEnd(4, '_')}
              </div>
            </div>

            {/* Operator Call Sign Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Your Call Sign / Handle
              </label>
              <input
                type="text"
                maxLength={24}
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Operator"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 shadow-inner"
              />
            </div>

            {/* Tactile Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeypadPress(digit)}
                  className="py-3 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 text-slate-200 text-lg font-bold transition-all shadow-sm cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                className="py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-rose-400 text-xs font-bold transition-all cursor-pointer"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="py-3 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-black border border-slate-700 text-slate-200 text-lg font-bold transition-all shadow-sm cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-amber-400 text-xs font-bold transition-all cursor-pointer"
              >
                DEL
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || pin.length < 4}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 cursor-pointer mt-2 ${
                pin.length >= 4
                  ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950'
                  : 'bg-slate-800/60 border border-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Locking Frequency...' : 'Connect to Channel'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
