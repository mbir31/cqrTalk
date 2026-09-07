import React, { useState } from 'react';
import { Radio, Wifi, WifiOff, Activity, Info } from 'lucide-react';
import { RssiData, ConnectionState } from '../types';

interface RssiIndicatorProps {
  rssi: RssiData;
  connectionState?: ConnectionState;
  showDetails?: boolean;
}

export const RssiIndicator: React.FC<RssiIndicatorProps> = ({
  rssi,
  connectionState = 'CONNECTED',
  showDetails = true
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isConnected = connectionState === 'CONNECTED';
  const isConnecting = connectionState === 'CONNECTING' || connectionState === 'RECONNECTING';

  // Bar heights in pixels for 5 graduated bars
  const barHeights = [6, 9, 12, 15, 18];

  // Dynamic color palette based on quality/bars
  const getColorClass = (barIndex: number) => {
    if (!isConnected) return 'bg-slate-700/60 shadow-none';
    if (barIndex >= rssi.bars) return 'bg-slate-800/80 border border-slate-700/40 shadow-none';

    if (rssi.bars >= 4) {
      return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]';
    } else if (rssi.bars === 3) {
      return 'bg-amber-300 shadow-[0_0_6px_rgba(253,224,71,0.7)]';
    } else if (rssi.bars === 2) {
      return 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]';
    } else {
      return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse';
    }
  };

  const textToneClass = !isConnected
    ? 'text-slate-500'
    : rssi.bars >= 4
    ? 'text-emerald-400'
    : rssi.bars === 3
    ? 'text-amber-300'
    : rssi.bars === 2
    ? 'text-amber-400'
    : 'text-rose-400';

  return (
    <div className="relative inline-flex items-center select-none">
      <div
        onClick={() => setShowTooltip(prev => !prev)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
        title={`Signal Strength: ${rssi.rssiDbm} dBm (${rssi.latencyMs}ms RTT) - Click for RF Telemetry`}
      >
        {/* Antenna / Carrier Icon */}
        <div className="relative flex items-center justify-center">
          {isConnected ? (
            <Radio className={`w-3.5 h-3.5 ${textToneClass} transition-colors`} />
          ) : isConnecting ? (
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>

        {/* 5 Graduated RSSI Bars with Micro Fluctuation */}
        <div className="flex items-end gap-[2px] h-[19px] px-0.5">
          {barHeights.map((h, idx) => (
            <div
              key={idx}
              style={{ height: `${h}px` }}
              className={`w-[3px] rounded-t-xs transition-all duration-200 ${getColorClass(idx)}`}
            />
          ))}
        </div>

        {/* Tactical Signal Values */}
        {showDetails && (
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            {isConnected ? (
              <>
                <span className={`font-bold tracking-tight ${textToneClass}`}>
                  {rssi.rssiDbm} dBm
                </span>
                <span className="hidden sm:inline-block text-slate-500 text-[9px]">
                  •
                </span>
                <span className="hidden sm:inline-block text-slate-400 font-semibold text-[9.5px]">
                  {rssi.latencyMs}ms
                </span>
                <span className="px-1 py-0.2 rounded bg-slate-800 text-[8px] font-bold text-slate-400 border border-slate-700/60">
                  {rssi.sUnit}
                </span>
              </>
            ) : (
              <span className="text-slate-500 text-[9.5px] uppercase font-bold tracking-wider">
                {isConnecting ? 'SYNCING...' : 'NO CARRIER'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Floating Detailed Telemetry Tooltip / Card */}
      {showTooltip && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-56 p-2.5 rounded-xl bg-[#090d14] border border-slate-700/90 shadow-2xl backdrop-blur-md text-xs space-y-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              RF Telemetry (RSSI)
            </span>
            <span className={textToneClass}>
              {isConnected ? rssi.quality : 'OFFLINE'}
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-sans text-[10px]">WebSocket RTT:</span>
              <span className={`font-bold ${textToneClass}`}>
                {isConnected ? `${rssi.latencyMs} ms` : '---'}
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-sans text-[10px]">Signal Level:</span>
              <span className="font-bold text-slate-200">
                {isConnected ? `${rssi.rssiDbm} dBm` : '---'}
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-sans text-[10px]">S-Meter Reading:</span>
              <span className="font-bold text-slate-200">
                {isConnected ? rssi.sUnit : 'S0'}
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-sans text-[10px]">Link Status:</span>
              <span className="text-slate-200 text-[10px]">
                {isConnected ? 'Carrier Locked (100%)' : isConnecting ? 'Acquiring Lock...' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800/80 text-[9px] text-slate-500 font-sans">
            Real-time latency fluctuation based on WebSocket keepalive round-trip time.
          </div>
        </div>
      )}
    </div>
  );
};
