import React from 'react';
import { TxRxState, ConnectionState } from '../types';

interface BiColorStatusLedProps {
  txRxState: TxRxState;
  connectionState: ConnectionState;
  speakerMuted?: boolean;
}

export const BiColorStatusLed: React.FC<BiColorStatusLedProps> = ({
  txRxState,
  connectionState,
  speakerMuted = false
}) => {
  const isTransmitting = txRxState === 'TRANSMITTING';
  const isReceiving = txRxState === 'RECEIVING';
  const isConnected = connectionState === 'CONNECTED';
  const isReconnecting = connectionState === 'RECONNECTING' || connectionState === 'CONNECTING';

  // Determine LED visual state
  let ledStateClass = 'bg-slate-700 shadow-none';
  let titleText = 'OFFLINE';
  let labelText = 'OFF';

  if (isTransmitting) {
    ledStateClass = 'bg-rose-500 shadow-[0_0_12px_#f43f5e,0_0_24px_rgba(244,63,94,0.6)] animate-none';
    titleText = 'TRANSMITTING (TX)';
    labelText = 'TX';
  } else if (isReceiving) {
    ledStateClass = 'bg-emerald-400 shadow-[0_0_12px_#34d399,0_0_24px_rgba(52,211,153,0.6)] animate-none';
    titleText = 'RECEIVING (RX)';
    labelText = 'RX';
  } else if (isConnected) {
    if (speakerMuted) {
      ledStateClass = 'bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.5)]';
      titleText = 'STANDBY (MUTED)';
      labelText = 'MUTE';
    } else {
      ledStateClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse';
      titleText = 'CARRIER LOCKED (READY)';
      labelText = 'STBY';
    }
  } else if (isReconnecting) {
    ledStateClass = 'bg-amber-500 shadow-[0_0_10px_#f59e0b] animate-ping';
    titleText = 'ACQUIRING SIGNAL...';
    labelText = 'SYNC';
  }

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none"
      title={`Radio Status Indicator: ${titleText}`}
    >
      {/* Machined Metal Bezel with Domed Lens */}
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 p-[2px] shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center relative">
        {/* Domed Colored Jewel */}
        <div
          className={`w-3.5 h-3.5 rounded-full transition-all duration-150 relative flex items-center justify-center ${ledStateClass}`}
        >
          {/* Specular Highlight */}
          <div className="absolute top-[1.5px] left-[2px] w-1.5 h-1 rounded-full bg-white/70 rotate-[-35deg] pointer-events-none" />
        </div>
      </div>

      {/* Micro Status Label */}
      <span className={`text-[7px] font-black tracking-tighter uppercase font-mono ${
        isTransmitting ? 'text-rose-400' : isReceiving ? 'text-emerald-400' : isConnected ? 'text-emerald-500' : 'text-slate-500'
      }`}>
        {labelText}
      </span>
    </div>
  );
};
