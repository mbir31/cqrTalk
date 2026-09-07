import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface TactileToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const TactileToggle: React.FC<TactileToggleProps> = ({
  id = 'tactile-toggle-sound',
  checked,
  onChange,
  label,
  disabled = false
}) => {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {label && (
        <span className="text-xs font-semibold text-slate-300">
          {label}
        </span>
      )}
      
      {/* Accessible 44px touch target */}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || 'Radio Sound Effects Switch'}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) onChange(!checked);
          }
        }}
        className={`relative inline-flex items-center justify-center p-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-full cursor-pointer ${
          disabled ? 'opacity-40 cursor-not-allowed' : ''
        }`}
      >
        {/* Realistic Toggle Track */}
        <div
          className={`relative w-13 h-7 rounded-full transition-colors duration-200 border flex items-center p-0.5 ${
            checked
              ? 'bg-emerald-950/90 border-emerald-600/70 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
              : 'bg-slate-900 border-slate-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Status text inside track */}
          <span className={`absolute left-2 text-[9px] font-bold text-emerald-400 transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`}>
            ON
          </span>
          <span className={`absolute right-2 text-[9px] font-bold text-slate-500 transition-opacity ${!checked ? 'opacity-100' : 'opacity-0'}`}>
            OFF
          </span>

          {/* Brushed Metal Mechanical Switch Knob */}
          <div
            className={`w-5 h-5 rounded-full transition-transform duration-200 transform flex items-center justify-center shadow-md border ${
              checked
                ? 'translate-x-6 bg-gradient-to-b from-emerald-400 to-emerald-500 border-emerald-300 text-slate-950'
                : 'translate-x-0.5 bg-gradient-to-b from-slate-600 to-slate-700 border-slate-500 text-slate-300'
            }`}
          >
            {checked ? (
              <Volume2 className="w-3 h-3 stroke-[2.5]" />
            ) : (
              <VolumeX className="w-3 h-3 stroke-[2.5]" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
};
