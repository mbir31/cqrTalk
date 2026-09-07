import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Mic, Radio, Clock, User, Trash2 } from 'lucide-react';
import { TransmissionRecord } from '../types';

interface TransmissionHistoryDrawerProps {
  history: TransmissionRecord[];
  onClearHistory?: () => void;
}

export const TransmissionHistoryDrawer: React.FC<TransmissionHistoryDrawerProps> = ({
  history,
  onClearHistory
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatElapsed = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  };

  const latest = history[0];

  return (
    <div className="w-full select-none">
      {/* Collapsed Header Bar */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] shadow-sm">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer transition-colors flex-1 text-left"
        >
          <History className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
            Last Heard:
          </span>
          {latest ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className={`font-bold ${latest.wasSelf ? 'text-rose-400' : 'text-emerald-400'}`}>
                {latest.speakerName}
              </span>
              <span className="text-slate-500 font-mono text-[9px]">
                ({(latest.durationMs / 1000).toFixed(1)}s)
              </span>
              <span className="text-slate-500 text-[9px]">
                • {formatElapsed(latest.timestamp)}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 italic text-[10px]">No transmissions logged yet</span>
          )}
        </button>

        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono text-[9px] font-bold">
              {history.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(prev => !prev)}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isOpen ? 'Collapse Transmission Log' : 'Expand Transmission Log'}
          >
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Transmission History Drawer */}
      {isOpen && (
        <div className="mt-1.5 p-3 rounded-2xl bg-[#090d14] border border-slate-800 shadow-xl space-y-2 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-emerald-400" />
              RF Transmission Tape
            </span>
            {history.length > 0 && onClearHistory && (
              <button
                type="button"
                onClick={onClearHistory}
                className="flex items-center gap-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-4 text-center text-slate-500 text-xs italic">
              Channel silent. Transmissions will appear here once audio is keyed.
            </div>
          ) : (
            <div className="space-y-1.5">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      record.wasSelf ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                    }`} />
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                        <span>{record.speakerName}</span>
                        {record.wasSelf && (
                          <span className="px-1 rounded bg-rose-950 text-rose-300 text-[8px] font-bold uppercase border border-rose-800/50">
                            TX
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-slate-500" />
                          {(record.durationMs / 1000).toFixed(1)}s burst
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatElapsed(record.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
