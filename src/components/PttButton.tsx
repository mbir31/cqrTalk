import React, { useState, useEffect } from 'react';
import { Mic, Radio, Lock } from 'lucide-react';
import { TxRxState, ConnectionState } from '../types';

interface PttButtonProps {
  txRxState: TxRxState;
  connectionState: ConnectionState;
  onRequestFloor: () => void;
  onReleaseFloor: () => void;
  onToggleFloor: () => void;
  disabled?: boolean;
}

export const PttButton: React.FC<PttButtonProps> = ({
  txRxState,
  connectionState,
  onRequestFloor,
  onReleaseFloor,
  onToggleFloor,
  disabled = false
}) => {
  const [isPressing, setIsPressing] = useState(false);
  const isTransmitting = txRxState === 'TRANSMITTING';
  const isReceiving = txRxState === 'RECEIVING';
  const isBusy = txRxState === 'BUSY';
  const isRequesting = txRxState === 'REQUESTING';
  const isConnected = connectionState === 'CONNECTED';

  // Global release safety
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isPressing) {
        setIsPressing(false);
        onReleaseFloor();
      }
    };

    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);

    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
    };
  }, [isPressing, onReleaseFloor]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || !isConnected || isReceiving || isBusy) return;
    e.preventDefault();
    setIsPressing(true);
    onRequestFloor();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    if (isPressing) {
      setIsPressing(false);
      onReleaseFloor();
    }
  };

  // Spacebar to talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        if (!disabled && isConnected && !isReceiving && !isBusy && !isPressing) {
          e.preventDefault();
          setIsPressing(true);
          onRequestFloor();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        if (isPressing) {
          e.preventDefault();
          setIsPressing(false);
          onReleaseFloor();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, isConnected, isReceiving, isBusy, isPressing, onRequestFloor, onReleaseFloor]);

  return (
    <div className="flex flex-col items-center gap-3 select-none w-full max-w-[280px]">
      
      {/* Outer Tactical Rubberized Housing Ring */}
      <div
        className={`relative w-48 h-48 sm:w-52 sm:h-52 rounded-full p-2.5 transition-all duration-200 bg-gradient-to-b from-[#1c222e] to-[#0e1218] border-2 ${
          isTransmitting
            ? 'border-rose-500 shadow-[0_0_35px_rgba(244,63,94,0.5)]'
            : isReceiving || isBusy
            ? 'border-amber-600/60 shadow-[0_0_20px_rgba(217,119,6,0.3)]'
            : 'border-slate-700/80 shadow-[0_12px_30px_rgba(0,0,0,0.6)]'
        }`}
      >
        {/* Recessed Bezel Frame */}
        <div className="w-full h-full rounded-full p-2 bg-[#090d14] border border-slate-800 flex items-center justify-center shadow-inner">
          
          {/* Main Large Tactile PTT Push Button */}
          <button
            id="ptt-transmit-button"
            type="button"
            role="button"
            aria-label="Push To Talk Button"
            disabled={disabled || !isConnected || isReceiving || isBusy}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`w-full h-full rounded-full transition-all duration-150 flex flex-col items-center justify-center p-3 text-center cursor-pointer focus:outline-none relative overflow-hidden active:scale-95 ${
              !isConnected
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : isTransmitting
                ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] border-2 border-rose-300'
                : isReceiving || isBusy
                ? 'bg-gradient-to-b from-slate-800 to-slate-900 text-amber-400 border border-amber-800/60 cursor-not-allowed'
                : 'bg-gradient-to-b from-[#252d3d] via-[#1b212d] to-[#151a24] hover:from-[#2a3447] hover:to-[#1a202c] active:from-[#131720] active:to-[#0f1218] text-slate-200 border-2 border-slate-600/70 shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)]'
            }`}
          >
            {/* Textured Silicone Ribs Accent */}
            <div className="absolute inset-x-8 top-5 flex flex-col gap-1 items-center opacity-25 pointer-events-none">
              <div className="w-16 h-0.5 bg-white rounded-full" />
              <div className="w-24 h-0.5 bg-white rounded-full" />
              <div className="w-16 h-0.5 bg-white rounded-full" />
            </div>

            {/* Center Icon */}
            <div className={`p-2.5 rounded-full mb-1 transition-transform ${
              isTransmitting
                ? 'bg-rose-800/80 text-white scale-110 shadow-md'
                : isReceiving || isBusy
                ? 'bg-amber-950/80 text-amber-400'
                : 'bg-slate-800/80 text-emerald-400 border border-slate-700'
            }`}>
              {isTransmitting ? (
                <Radio className="w-7 h-7 animate-pulse" />
              ) : isReceiving || isBusy ? (
                <Lock className="w-6 h-6" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </div>

            {/* Label */}
            <span className="text-xs sm:text-sm font-bold tracking-wider uppercase drop-shadow-sm">
              {!isConnected
                ? 'CONNECTING...'
                : isTransmitting
                ? 'TRANSMITTING [TX]'
                : isRequesting
                ? 'ACQUIRING...'
                : isReceiving || isBusy
                ? 'CHANNEL BUSY'
                : 'PUSH TO TALK'}
            </span>

            {/* Subtitle */}
            <span className="text-[10px] tracking-wide text-slate-400 mt-0.5">
              {isTransmitting
                ? 'RELEASE TO LISTEN'
                : isReceiving || isBusy
                ? 'WAIT FOR CLEAR'
                : 'HOLD SPACE OR CLICK'}
            </span>

            {/* Bottom Grip Ribs */}
            <div className="absolute inset-x-8 bottom-5 flex flex-col gap-1 items-center opacity-25 pointer-events-none">
              <div className="w-16 h-0.5 bg-white rounded-full" />
              <div className="w-24 h-0.5 bg-white rounded-full" />
              <div className="w-16 h-0.5 bg-white rounded-full" />
            </div>
          </button>
        </div>
      </div>

      {/* Hands-Free Latch Button */}
      <button
        id="ptt-latch-toggle-button"
        type="button"
        disabled={disabled || !isConnected || (isReceiving && !isTransmitting) || (isBusy && !isTransmitting)}
        onClick={onToggleFloor}
        className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-sm ${
          isTransmitting
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] border border-rose-400'
            : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 border border-slate-700'
        } ${disabled || !isConnected || (isReceiving && !isTransmitting) ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <div className={`w-2 h-2 rounded-full ${isTransmitting ? 'bg-white animate-ping' : 'bg-emerald-400'}`} />
        <span>{isTransmitting ? 'Halt Latch Transmission' : 'Latch Floor (Hands-Free)'}</span>
      </button>
    </div>
  );
};
