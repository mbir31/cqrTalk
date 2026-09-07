import React, { useState } from 'react';
import { Radio, Users, User, X, Share2, Copy, Check, ArrowRight } from 'lucide-react';
import { SessionType } from '../types';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: SessionType;
  displayName: string;
  onSessionCreated: (sessionId: string, hostToken?: string) => void;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  type,
  displayName,
  onSessionCreated
}) => {
  const [operatorName, setOperatorName] = useState(displayName);
  const [groupName, setGroupName] = useState(type === 'group' ? 'Walkie-Talkie Group' : '');
  const [isCreating, setIsCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<{ sessionId: string; pin: string; groupName: string; hostToken?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          groupName: type === 'group' ? groupName : '1-to-1 Private Radio',
          displayName: operatorName
        })
      });

      if (!res.ok) {
        throw new Error('Failed to create channel session');
      }

      const data = await res.json();
      if (data?.sessionId && data?.hostToken) {
        // Persist the creator token for this tab so a reload keeps host rights
        try {
          sessionStorage.setItem(`cqrtalk_host_token_${data.sessionId}`, data.hostToken);
        } catch (err) {
          // Storage unavailable — token still flows in-memory via onSessionCreated
        }
      }
      setCreatedSession(data);
    } catch (err: any) {
      setError(err.message || 'Error creating session');
    } finally {
      setIsCreating(false);
    }
  };

  const inviteUrl = createdSession ? `${window.location.origin}/?pin=${createdSession.pin}` : '';

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyPin = () => {
    if (!createdSession?.pin) return;
    navigator.clipboard.writeText(createdSession.pin).then(() => {
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    });
  };

  const handleNativeShare = async () => {
    if (navigator.share && createdSession) {
      try {
        await navigator.share({
          title: 'cqrTalk Radio Invitation',
          text: `Connect to my cqrTalk walkie-talkie channel! PIN: ${createdSession.pin}`,
          url: inviteUrl
        });
      } catch (err) {
        // User dismissed share
      }
    } else {
      handleCopyLink();
    }
  };

  const handleEnterRadio = () => {
    if (createdSession) {
      onSessionCreated(createdSession.sessionId, createdSession.hostToken);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1b212c] to-[#12161f] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#141822]">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
              type === 'group' ? 'bg-amber-950/80 text-amber-400 border border-amber-700/60' : 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
            }`}>
              {type === 'group' ? <Users className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                {type === 'group' ? 'Create Group Channel' : 'Create 1-to-1 Channel'}
              </h2>
              <span className="text-[11px] text-slate-400">
                {type === 'group' ? 'Supports up to 15 operators' : 'Private point-to-point frequency'}
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
          {!createdSession ? (
            /* Creation Form */
            <form onSubmit={handleCreate} className="space-y-4">
              {type === 'group' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Group Channel Name
                  </label>
                  <input
                    type="text"
                    maxLength={32}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Walkie-Talkie Group"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 shadow-inner"
                  />
                </div>
              )}

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
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 shadow-inner"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isCreating ? 'Acquiring Frequency...' : 'Initialize Channel'}
              </button>
            </form>
          ) : (
            /* Created Channel Screen with 4-Digit PIN and Share */
            <div className="space-y-4">
              {/* LCD-Style PIN Banner */}
              <div className="p-4 rounded-2xl bg-[#090d14] border border-slate-800 text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">
                <span className="text-[11px] font-semibold text-emerald-400 tracking-widest uppercase block mb-1">
                  Temporary 4-Digit Channel PIN
                </span>
                <div className="text-4xl font-digital font-bold tracking-[0.3em] text-emerald-400 py-1 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]">
                  {createdSession.pin}
                </div>
                <span className="text-xs text-slate-400">
                  {type === 'one-to-one' ? 'Share this PIN with 1 peer' : 'Share with up to 15 operators'}
                </span>
              </div>

              {/* Share & Copy Actions */}
              <div className="space-y-2.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPin}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700 shadow-sm"
                  >
                    {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPin ? 'PIN Copied' : 'Copy PIN'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700 shadow-sm"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Link Copied' : 'Copy Link'}
                  </button>
                </div>

                {/* Quick Share Links */}
                <div className="flex gap-2">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join my cqrTalk walkie-talkie channel! PIN: ${createdSession.pin}\n${inviteUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 text-xs text-center transition-colors font-medium"
                  >
                    WhatsApp
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(`Join my cqrTalk walkie-talkie channel! PIN: ${createdSession.pin}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 rounded-xl bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/50 text-sky-300 text-xs text-center transition-colors font-medium"
                  >
                    Telegram
                  </a>
                  <a
                    href={`sms:?body=${encodeURIComponent(`Connect to my cqrTalk walkie-talkie channel! PIN: ${createdSession.pin} ${inviteUrl}`)}`}
                    className="flex-1 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs text-center transition-colors font-medium"
                  >
                    SMS
                  </a>
                </div>
              </div>

              {/* Enter Radio Button */}
              <button
                type="button"
                onClick={handleEnterRadio}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer flex items-center justify-center gap-2 mt-1"
              >
                <span>Enter Radio Frequency</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
