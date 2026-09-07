import React, { useState, useEffect, useRef } from 'react';
import { Mic, Radio, Lock, Clock, Volume2 } from 'lucide-react';
import { TxRxState, ConnectionState } from '../types';

interface PttButtonProps {
  txRxState: TxRxState;
  connectionState: ConnectionState;
  onRequestFloor: () => void;
  onReleaseFloor: () => void;
  onToggleFloor: () => void;
  disabled?: boolean;
  currentSpeakerName?: string;
}

export const PttButton: React.FC<PttButtonProps> = ({
  txRxState,
  connectionState,
  onRequestFloor,
  onReleaseFloor,
  onToggleFloor,
  disabled = false,
  currentSpeakerName
}) => {
  const [isPressing, setIsPressing] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [busyTapNotice, setBusyTapNotice] = useState(false);
  const pressingRef = useRef(false);
  const queuedRef = useRef(false);
  const busyNoticeTimeoutRef = useRef<number | null>(null);

  const isTransmitting = txRxState === 'TRANSMITTING';
  const isReceiving = txRxState === 'RECEIVING';
  const isBusy = txRxState === 'BUSY';
  const isRequesting = txRxState === 'REQUESTING';
  const isConnected = connectionState === 'CONNECTED';

  // Keep a ref mirror so global release handlers never go stale
  const setPressing = (value: boolean) => {
    pressingRef.current = value;
    setIsPressing(value);
  };

  const releasePtt = () => {
    if (queuedRef.current) {
      queuedRef.current = false;
      setIsQueued(false);
    }
    if (pressingRef.current) {
      setPressing(false);
      onReleaseFloor();
    }
  };

  // Auto-acquire floor when queued transmission was waiting for channel clear
  useEffect(() => {
    if (txRxState === 'IDLE' && queuedRef.current && pressingRef.current) {
      queuedRef.current = false;
      setIsQueued(false);
      onRequestFloor();
    }
  }, [txRxState, onRequestFloor]);

  // Global release safety (mouse up outside, touch cancel, window blur,
  // and page hide — e.g. Alt-Tab while holding Space/PTT must never stick TX)
  useEffect(() => {
    const handleGlobalRelease = () => releasePtt();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        releasePtt();
      }
    };

    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('blur', handleGlobalRelease);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('blur', handleGlobalRelease);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onReleaseFloor]);

  const triggerBusyNotice = () => {
    setBusyTapNotice(true);
    if (busyNoticeTimeoutRef.current) {
      window.clearTimeout(busyNoticeTimeoutRef.current);
    }
    busyNoticeTimeoutRef.current = window.setTimeout(() => {
      setBusyTapNotice(false);
    }, 2000);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || !isConnected) return;
    if (pressingRef.current) return; // multi-touch guard: one active finger only
    e.preventDefault();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch (err) {
      // Pointer capture unsupported — global release listeners still protect us
    }

    setPressing(true);

    if (isReceiving || isBusy) {
      // Channel is currently busy with incoming talking activity.
      // Queue floor acquisition so as soon as speaker finishes, user gets floor!
      queuedRef.current = true;
      setIsQueued(true);
      triggerBusyNotice();
      return;
    }

    onRequestFloor();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    releasePtt();
  };

  // Spacebar to talk (never hijack focused interactive elements)
  useEffect(() => {
    const isTypingTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(document.activeElement)) {
        if (!disabled && isConnected && !pressingRef.current) {
          e.preventDefault();
          setPressing(true);
          if (isReceiving || isBusy) {
            queuedRef.current = true;
            setIsQueued(true);
            triggerBusyNotice();
            return;
          }
          onRequestFloor();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Always release on key-up — even if focus moved to a text field while
      // the key was held (a missed release would stick TX until lease expiry).
      if (e.code === 'Space' && pressingRef.current) {
        e.preventDefault();
        releasePtt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, isConnected, isReceiving, isBusy, onRequestFloor, onReleaseFloor]);

  return (
    <div className="flex flex-col items-center gap-2 select-none w-full max-w-[280px]">
      
      {/* Outer Tactical Rubberized Housing Ring */}
      <div
        className={`relative w-36 h-36 sm:w-40 sm:h-40 rounded-full p-1.5 transition-all duration-200 bg-gradient-to-b from-[#1c222e] to-[#0e1218] border-2 ${
          isTransmitting
            ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.5)]'
            : isQueued
            ? 'border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)] animate-pulse'
            : isReceiving || isBusy
            ? 'border-amber-600/70 shadow-[0_0_15px_rgba(217,119,6,0.3)]'
            : 'border-slate-700/80 shadow-[0_10px_25px_rgba(0,0,0,0.6)]'
        }`}
      >
        {/* Recessed Bezel Frame */}
        <div className="w-full h-full rounded-full p-1 bg-[#090d14] border border-slate-800 flex items-center justify-center shadow-inner">
          
          {/* Main Large Tactile PTT Push Button */}
          <button
            id="ptt-transmit-button"
            type="button"
            role="button"
            aria-label="Push To Talk Button"
            disabled={disabled || !isConnected}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`w-full h-full rounded-full transition-all duration-150 flex flex-col items-center justify-center p-1.5 text-center cursor-pointer focus:outline-none relative overflow-hidden active:scale-95 ${
              !isConnected
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : isTransmitting
                ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] border-2 border-rose-300'
                : isQueued
                ? 'bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800 text-white border-2 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                : isReceiving || isBusy
                ? 'bg-gradient-to-b from-[#202734] via-[#1a202c] to-[#141923] text-amber-300 border-2 border-amber-600/60 hover:border-amber-500 shadow-[0_4px_12px_rgba(0,0,0,0.4)]'
                : 'bg-gradient-to-b from-[#252d3d] via-[#1b212d] to-[#151a24] hover:from-[#2a3447] hover:to-[#1a202c] active:from-[#131720] active:to-[#0f1218] text-slate-200 border-2 border-slate-600/70 shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)]'
            }`}
          >
            {/* Top Permanent PTT Identifier Badge */}
            <div className="flex items-center gap-1 px-2 py-0.2 rounded-full bg-black/40 border border-white/10 mb-0.5 pointer-events-none">
              <span className="text-[8px] font-black tracking-widest text-slate-200 uppercase font-mono">
                PTT ACTION
              </span>
              <span className={`w-1 h-1 rounded-full ${
                isTransmitting
                  ? 'bg-white animate-ping'
                  : isQueued
                  ? 'bg-amber-300 animate-pulse'
                  : isReceiving || isBusy
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-400'
              }`} />
            </div>

            {/* Center Icon */}
            <div className={`p-1.5 rounded-full mb-0.5 transition-transform pointer-events-none ${
              isTransmitting
                ? 'bg-rose-800/80 text-white scale-110 shadow-md'
                : isQueued
                ? 'bg-amber-900/90 text-white scale-105'
                : isReceiving || isBusy
                ? 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
                : 'bg-slate-800/80 text-emerald-400 border border-slate-700'
            }`}>
              {isTransmitting ? (
                <Radio className="w-5 h-5 animate-pulse" />
              ) : isQueued ? (
                <Clock className="w-5 h-5 animate-spin" />
              ) : isReceiving || isBusy ? (
                <div className="relative">
                  <Mic className="w-5 h-5 text-amber-400" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 border border-slate-900 flex items-center justify-center">
                    <Lock className="w-1 h-1 text-slate-950" />
                  </div>
                </div>
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </div>

            {/* Primary Action Label - ALWAYS prominent PUSH TO TALK indicator */}
            <span className="text-[11px] sm:text-xs font-black tracking-wider uppercase drop-shadow-sm pointer-events-none">
              {!isConnected
                ? 'CONNECTING...'
                : isTransmitting
                ? 'PUSH TO TALK [TX]'
                : isQueued
                ? 'PTT QUEUED'
                : isRequesting
                ? 'ACQUIRING...'
                : isReceiving || isBusy
                ? 'PTT [BUSY]'
                : 'PUSH TO TALK'}
            </span>

            {/* Subtitle with Context & Action Hint */}
            <span className="text-[9px] font-semibold tracking-wide text-slate-300 mt-0.5 px-1 truncate max-w-[150px] pointer-events-none">
              {isTransmitting
                ? 'ON AIR • RELEASE'
                : isQueued
                ? 'HOLDING • QUEUED'
                : isReceiving && currentSpeakerName
                ? `${currentSpeakerName} talking`
                : isReceiving || isBusy
                ? 'HOLD TO QUEUE'
                : 'HOLD SPACE OR CLICK'}
            </span>
          </button>
        </div>
      </div>

      {/* Busy notice pill if tapped during active channel talk */}
      {busyTapNotice && (
        <div className="text-[10px] text-amber-300 font-medium bg-amber-950/90 px-2.5 py-1 rounded-lg border border-amber-700/80 shadow-md text-center max-w-[260px] animate-in fade-in duration-150">
          Channel busy with talking activity. Hold PTT to automatically talk as soon as floor clears!
        </div>
      )}

      {/* Hands-Free Latch Button */}
      <button
        id="ptt-latch-toggle-button"
        type="button"
        disabled={disabled || !isConnected || (isReceiving && !isTransmitting) || (isBusy && !isTransmitting)}
        onClick={onToggleFloor}
        className={`px-3.5 py-1.5 rounded-xl text-[11px] font-semibold tracking-wider uppercase transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm ${
          isTransmitting
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] border border-rose-400'
            : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 border border-slate-700'
        } ${disabled || !isConnected || (isReceiving && !isTransmitting) ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <div className={`w-2 h-2 rounded-full ${isTransmitting ? 'bg-white animate-ping' : 'bg-emerald-400'}`} />
        <span>{isTransmitting ? 'Release PTT Latch' : 'PTT Hands-Free Latch'}</span>
      </button>
    </div>
  );
};

