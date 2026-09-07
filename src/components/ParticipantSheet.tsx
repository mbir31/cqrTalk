import React from 'react';
import { Users, Crown, X, UserMinus, Radio, Shield, Copy, Check } from 'lucide-react';
import { Participant, FloorState } from '../types';

interface ParticipantSheetProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  currentFloor: FloorState;
  currentParticipantId: string;
  isHost: boolean;
  onRemoveParticipant: (id: string) => void;
  pin?: string;
  groupName?: string;
}

export const ParticipantSheet: React.FC<ParticipantSheetProps> = ({
  isOpen,
  onClose,
  participants,
  currentFloor,
  currentParticipantId,
  isHost,
  onRemoveParticipant,
  pin,
  groupName
}) => {
  const [copiedPin, setCopiedPin] = React.useState(false);

  if (!isOpen) return null;

  const handleCopyPin = () => {
    if (pin) {
      navigator.clipboard.writeText(pin).then(() => {
        setCopiedPin(true);
        setTimeout(() => setCopiedPin(false), 2000);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs transition-opacity duration-200">
      {/* Backdrop tap to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Clean Bottom Sheet */}
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1c222e] to-[#12161f] border-t border-x border-slate-700/80 rounded-t-3xl p-5 z-10 max-h-[80vh] flex flex-col shadow-2xl">
        {/* Top Sheet Drag Handle */}
        <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {groupName || 'Channel Operators'}
              </h3>
              <span className="text-xs text-slate-400">
                {participants.filter(p => p.isOnline).length}/{participants.length} online
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

        {/* Channel PIN quick badge */}
        {pin && (
          <div className="my-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Channel Pairing PIN
              </span>
              <span className="text-xl font-digital font-bold text-emerald-400 tracking-wider">
                {pin}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyPin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
            >
              {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
            </button>
          </div>
        )}

        {/* Operators list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2">
          {participants.map((p) => {
            const isMe = p.participantId === currentParticipantId;
            const isSpeaking = currentFloor.currentSpeakerId === p.participantId;
            const isOnline = p.isOnline;

            return (
              <div
                key={p.participantId}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isSpeaking
                    ? 'bg-rose-950/40 border-rose-700/60 text-white shadow-sm'
                    : isMe
                    ? 'bg-emerald-950/30 border-emerald-800/50'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Status Indicator */}
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
                      {p.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                      isSpeaking ? 'bg-rose-500 animate-pulse' : isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                    }`} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">
                        {p.displayName}
                      </span>
                      {isMe && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-[9px] font-bold">
                          YOU
                        </span>
                      )}
                      {p.isHost && (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60 text-[9px] font-bold">
                          <Crown className="w-2.5 h-2.5" />
                          HOST
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {isSpeaking ? '● Transmitting [TX]' : isOnline ? 'Ready / In Channel' : 'Reconnecting...'}
                    </span>
                  </div>
                </div>

                {/* Host remove action */}
                {isHost && !isMe && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove operator ${p.displayName} from this channel?`)) {
                        onRemoveParticipant(p.participantId);
                      }
                    }}
                    className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/50 transition-colors cursor-pointer"
                    title="Remove operator"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
