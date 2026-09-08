import React, { useState, useEffect, useRef } from 'react';
import { Mic, Radio, Lock, Unlock, Clock, Volume2 } from 'lucide-react';
import { TxRxState, ConnectionState } from '../types';

interface PttButtonProps {
  txRxState: TxRxState;
  connectionState: ConnectionState;
  onRequestFloor: () => void;
  onReleaseFloor: () => void;
  onToggleFloor: () => void;
  disabled?: boolean;
  currentSpeakerName?: string;
  isPttLocked?: boolean;
  onTogglePttLock?: () => void;
}

export const PttButton: React.FC<PttButtonProps> = ({
  txRxState,
  connectionState,
  onRequestFloor,
  onReleaseFloor,
  onToggleFloor,
  disabled = false,
  currentSpeakerName,
  isPttLocked: controlledLocked,
  onTogglePttLock: controlledToggleLock
}) => {
  const [internalLocked, setInternalLocked] = useState(false);
  const isLocked = controlledLocked !== undefined ? controlledLocked : internalLocked;
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

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

  // Automatically disengage lock if channel state returns to IDLE/BUSY/RECEIVING
  useEffect(() => {
    if (txRxState !== 'TRANSMITTING' && txRxState !== 'REQUESTING') {
      if (internalLocked) {
        setInternalLocked(false);
      }
    }
  }, [txRxState, internalLocked]);

  // Keep a ref mirror so global release handlers never go stale
  const setPressing = (value: boolean) => {
    pressingRef.current = value;
    setIsPressing(value);
  };

  const setLockState = (val: boolean) => {
    if (controlledToggleLock) {
      if (val !== isLocked) controlledToggleLock();
    } else {
      setInternalLocked(val);
    }
    isLockedRef.current = val;
  };

  const togglePttLock = () => {
    if (disabled || !isConnected) return;
    if (isLocked || (isTransmitting && !pressingRef.current)) {
      setLockState(false);
      setPressing(false);
      onReleaseFloor();
    } else {
      if (isReceiving || isBusy) {
        triggerBusyNotice();
        return;
      }
      setLockState(true);
      onRequestFloor();
    }
  };

  const releasePtt = () => {
    if (queuedRef.current) {
      queuedRef.current = false;
      setIsQueued(false);
    }
    // If locked in continuous hands-free mode, do not release on pointer/key lift
    if (isLockedRef.current) {
      return;
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
    const handleGlobalRelease = () => {
      // If locked in hands-free mode, mouseup outside should NOT release
      if (!isLockedRef.current) {
        releasePtt();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (isLockedRef.current) {
          setLockState(false);
        }
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

    // If PTT Lock is currently active, tapping the main PTT button unlocks and ends TX
    if (isLockedRef.current || (isTransmitting && !pressingRef.current)) {
      setLockState(false);
      setPressing(false);
      onReleaseFloor();
      return;
    }

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
    if (isLockedRef.current) {
      return;
    }
    releasePtt();
  };

  // Keyboard controls: Space to talk (momentary) or L to toggle PTT Lock (continuous)
  useEffect(() => {
    const isTypingTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;

      // Blur any focused button so Spacebar doesn't trigger its native click handler
      if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }

      // 'L' key: Toggle PTT Lock hands-free continuous talk mode
      if ((e.code === 'KeyL' || (e.code === 'Space' && e.shiftKey)) && !e.repeat) {
        e.preventDefault();
        togglePttLock();
        return;
      }

      // Spacebar: Momentary PTT or unlock if locked
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (isLockedRef.current) {
          // If locked, space unlocks and stops transmission
          setLockState(false);
          setPressing(false);
          onReleaseFloor();
          return;
        }

        if (!disabled && isConnected && !pressingRef.current) {
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
      if (isTypingTarget(document.activeElement)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (pressingRef.current && !isLockedRef.current) {
          releasePtt();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, isConnected, isReceiving, isBusy, onRequestFloor, onReleaseFloor, isLocked]);

  const isHandsFreeActive = isLocked || (isTransmitting && !isPressing);

  return (
    <div className="flex flex-col items-center gap-2 select-none w-full max-w-[280px]">
      
      {/* Outer Tactical Rubberized Housing Ring */}
      <div
        className={`relative w-36 h-36 sm:w-40 sm:h-40 rounded-full p-1.5 transition-all duration-200 bg-gradient-to-b from-[#1c222e] to-[#0e1218] border-2 ${
          isHandsFreeActive
            ? 'border-rose-500 shadow-[0_0_35px_rgba(244,63,94,0.65)] ring-2 ring-rose-500/50 animate-pulse'
            : isTransmitting
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
            aria-label={isHandsFreeActive ? "PTT Locked - Continuous Transmission Active. Click to unlock." : "Push To Talk Button"}
            disabled={disabled || !isConnected}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`w-full h-full rounded-full transition-all duration-150 flex flex-col items-center justify-center p-1.5 text-center cursor-pointer focus:outline-none relative overflow-hidden active:scale-95 ${
              !isConnected
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : isHandsFreeActive
                ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] border-2 border-rose-300'
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
            <div className={`flex items-center gap-1 px-2 py-0.2 rounded-full border mb-0.5 pointer-events-none ${
              isHandsFreeActive
                ? 'bg-black/60 border-rose-400/50'
                : 'bg-black/40 border-white/10'
            }`}>
              <span className={`text-[8px] font-black tracking-widest uppercase font-mono ${
                isHandsFreeActive ? 'text-rose-200' : 'text-slate-200'
              }`}>
                {isHandsFreeActive ? 'PTT LOCKED' : 'PTT ACTION'}
              </span>
              <span className={`w-1 h-1 rounded-full ${
                isHandsFreeActive
                  ? 'bg-white shadow-[0_0_4px_#fff] animate-ping'
                  : isTransmitting
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
              isHandsFreeActive
                ? 'bg-rose-900/90 text-white scale-110 shadow-md ring-2 ring-rose-300/40'
                : isTransmitting
                ? 'bg-rose-800/80 text-white scale-110 shadow-md'
                : isQueued
                ? 'bg-amber-900/90 text-white scale-105'
                : isReceiving || isBusy
                ? 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
                : 'bg-slate-800/80 text-emerald-400 border border-slate-700'
            }`}>
              {isHandsFreeActive ? (
                <Lock className="w-5 h-5 text-white animate-pulse" />
              ) : isTransmitting ? (
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

            {/* Primary Action Label - ALWAYS prominent indicator */}
            <span className="text-[11px] sm:text-xs font-black tracking-wider uppercase drop-shadow-sm pointer-events-none">
              {!isConnected
                ? 'CONNECTING...'
                : isHandsFreeActive
                ? 'CONTINUOUS TALK [TX]'
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
              {isHandsFreeActive
                ? 'CLICK OR [L] TO UNLOCK'
                : isTransmitting
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

      {/* PTT Lock (Continuous Hands-Free Transmission Mode) Button */}
      <button
        id="ptt-lock-toggle-button"
        type="button"
        role="switch"
        aria-checked={isHandsFreeActive}
        aria-label="PTT Continuous Transmission Lock"
        disabled={disabled || !isConnected || (isReceiving && !isTransmitting) || (isBusy && !isTransmitting)}
        onClick={togglePttLock}
        className={`px-4 py-2 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-sm select-none ${
          isHandsFreeActive
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.6)] border-2 border-rose-300 ring-2 ring-rose-500/40'
            : 'bg-slate-800/90 hover:bg-slate-700 active:bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500 hover:text-white'
        } ${disabled || !isConnected || (isReceiving && !isTransmitting) ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Toggle continuous transmission (hands-free talk mode). Press 'L' to toggle."
      >
        {isHandsFreeActive ? (
          <Lock className="w-3.5 h-3.5 text-white animate-pulse" />
        ) : (
          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span>{isHandsFreeActive ? 'PTT Locked (Hands-Free)' : 'PTT Lock [L]'}</span>
        <div className={`w-2 h-2 rounded-full ${isHandsFreeActive ? 'bg-white shadow-[0_0_6px_#fff] animate-ping' : 'bg-emerald-400/80'}`} />
      </button>
    </div>
  );
};

