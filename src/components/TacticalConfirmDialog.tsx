import React, { useEffect } from 'react';
import { Power, LogOut, UserMinus, AlertTriangle, X } from 'lucide-react';

export interface TacticalConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'neutral';
  icon?: 'power' | 'leave' | 'user-minus' | 'alert';
  onConfirm: () => void;
  onCancel: () => void;
}

export const TacticalConfirmDialog: React.FC<TacticalConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon = 'alert',
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (icon) {
      case 'power':
        return <Power className="w-5 h-5 text-rose-400" />;
      case 'leave':
        return <LogOut className="w-5 h-5 text-amber-400" />;
      case 'user-minus':
        return <UserMinus className="w-5 h-5 text-rose-400" />;
      case 'alert':
      default:
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    }
  };

  const getConfirmButtonClasses = () => {
    switch (variant) {
      case 'danger':
        return 'bg-rose-700 hover:bg-rose-600 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)] border-rose-600';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)] border-amber-500';
      case 'neutral':
      default:
        return 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      {/* Backdrop tap to dismiss */}
      <div className="absolute inset-0" onClick={onCancel} />

      <div
        id="tactical-confirm-modal"
        className="relative w-full max-w-sm bg-gradient-to-b from-[#1c222e] to-[#12161f] border-2 border-slate-700/90 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.1)] z-10 space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
              variant === 'danger'
                ? 'bg-rose-950/80 border-rose-800/80'
                : 'bg-amber-950/80 border-amber-800/80'
            }`}>
              {renderIcon()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase font-sans">
                {title}
              </h3>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                CONFIRMATION REQUIRED
              </span>
            </div>
          </div>

          <button
            id="btn-confirm-modal-close"
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message body */}
        <p className="text-xs text-slate-300 leading-relaxed bg-[#0b0e14] p-3 rounded-xl border border-slate-800">
          {description}
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            id="btn-confirm-modal-cancel"
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            id="btn-confirm-modal-action"
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${getConfirmButtonClasses()}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
