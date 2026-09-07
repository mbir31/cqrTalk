import React, { useRef } from 'react';

interface RotaryChannelSelectorProps {
  currentChannel: number;
  onChannelChange: (channel: number) => void;
  disabled?: boolean;
}

export const RotaryChannelSelector: React.FC<RotaryChannelSelectorProps> = ({
  currentChannel,
  onChannelChange,
  disabled = false
}) => {
  const knobRef = useRef<HTMLDivElement | null>(null);

  // Rotate between 1 and 16 channels
  const handleStep = (direction: 'next' | 'prev') => {
    if (disabled) return;
    let next = direction === 'next' ? currentChannel + 1 : currentChannel - 1;
    if (next > 16) next = 1;
    if (next < 1) next = 16;
    onChannelChange(next);
  };

  // Wheel listener to quickly dial channel with mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      handleStep('prev');
    } else {
      handleStep('next');
    }
  };

  // Calculate rotation angle (16 steps around 360 deg, 22.5 deg per step)
  const rotationDeg = (currentChannel - 1) * 22.5;

  return (
    <div
      ref={knobRef}
      onWheel={handleWheel}
      className="flex flex-col items-center select-none cursor-pointer group"
      onClick={() => handleStep('next')}
      title={`Channel Selector Knob: CH-${currentChannel.toString().padStart(2, '0')} (Click or scroll to rotate 1-16)`}
    >
      {/* Rotary Knurled Metal Knob Body */}
      <div className="w-8 h-6 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 rounded-t-md border-t border-x border-slate-500 shadow-md relative flex items-center justify-center overflow-hidden transition-transform duration-100 group-hover:brightness-110">
        {/* Grip serration ridges */}
        <div className="absolute inset-0 flex justify-around opacity-40 pointer-events-none">
          <div className="w-[1px] h-full bg-slate-950" />
          <div className="w-[1px] h-full bg-slate-950" />
          <div className="w-[1px] h-full bg-slate-950" />
          <div className="w-[1px] h-full bg-slate-950" />
        </div>

        {/* Notched White Position Marker */}
        <div
          className="w-1 h-3.5 bg-white rounded-full shadow-[0_0_4px_rgba(255,255,255,0.9)] transition-transform duration-150"
          style={{ transform: `rotate(${rotationDeg}deg)` }}
        />
      </div>

      {/* Stepped Base Collar */}
      <div className="w-10 h-2 bg-slate-900 rounded-t-xs border-x border-t border-slate-700 flex items-center justify-center">
        <span className="text-[7px] font-bold font-mono text-emerald-400/90 tracking-tighter">
          CH-{currentChannel.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
};
