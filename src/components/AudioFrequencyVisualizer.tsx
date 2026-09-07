import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Activity, BarChart2, Radio, Waves } from 'lucide-react';
import { TxRxState } from '../types';

interface AudioFrequencyVisualizerProps {
  txRxState: TxRxState;
  getAudioFrequencyData?: (outputArray: Uint8Array) => void;
  getAudioTimeDomainData?: (outputArray: Uint8Array) => void;
  height?: number;
}

type VisualizerMode = 'spectrum' | 'waveform' | 'dual';

export const AudioFrequencyVisualizer: React.FC<AudioFrequencyVisualizerProps> = ({
  txRxState,
  getAudioFrequencyData,
  getAudioTimeDomainData,
  height = 80
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const [mode, setMode] = useState<VisualizerMode>('spectrum');
  const [peakFreqLabel, setPeakFreqLabel] = useState<string>('0.8 kHz');

  const isTransmitting = txRxState === 'TRANSMITTING';
  const isReceiving = txRxState === 'RECEIVING';
  const isActive = isTransmitting || isReceiving;

  // Peak bars memory for smooth decay
  const peaksRef = useRef<number[]>(new Array(24).fill(0));
  const timeRef = useRef<number>(0);

  const cycleMode = useCallback(() => {
    setMode(prev => {
      if (prev === 'spectrum') return 'waveform';
      if (prev === 'waveform') return 'dual';
      return 'spectrum';
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Buffers sized to the media engine analyser (fftSize 256)
    const freqBins = 128; // = analyser.frequencyBinCount
    const timeSamples = 256; // = analyser.fftSize
    const freqData = new Uint8Array(freqBins);
    const timeData = new Uint8Array(timeSamples);

    // Track resize
    const handleResize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Animation Loop
    const render = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const h = height;

      timeRef.current += 0.05;
      const t = timeRef.current;

      // 1. Clear & draw dark phosphor screen background
      ctx.clearRect(0, 0, width, h);
      ctx.fillStyle = '#060a10';
      ctx.fillRect(0, 0, width, h);

      // Subtle phosphor grid lines
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Horizontal grid lines
      ctx.moveTo(0, h * 0.25);
      ctx.lineTo(width, h * 0.25);
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(width, h * 0.5);
      ctx.moveTo(0, h * 0.75);
      ctx.lineTo(width, h * 0.75);
      // Vertical grid lines
      for (let x = width / 4; x < width; x += width / 4) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();

      // Retrieve actual audio data
      if (getAudioFrequencyData) {
        getAudioFrequencyData(freqData);
      }
      if (getAudioTimeDomainData) {
        getAudioTimeDomainData(timeData);
      }

      // Check if real audio energy is coming through
      let realAudioSum = 0;
      for (let i = 0; i < freqData.length; i++) {
        realAudioSum += freqData[i];
      }
      const hasRealAudio = realAudioSum > 10;

      // Color scheme based on active radio state
      const primaryColor = isTransmitting
        ? '#f43f5e' // Rose/Red for TX
        : isReceiving
        ? '#34d399' // Emerald for RX
        : '#10b981'; // Green for Idle

      const accentColor = isTransmitting ? '#fb7185' : '#6ee7b7';

      // 2. Render Spectrum Mode or Dual Mode
      if (mode === 'spectrum' || mode === 'dual') {
        const barCount = 24;
        const barSpacing = 3;
        const totalSpacing = barSpacing * (barCount - 1);
        const barWidth = Math.max(2, (width - 16 - totalSpacing) / barCount);
        const startX = (width - (barCount * barWidth + totalSpacing)) / 2;

        let maxVal = 0;
        let maxIndex = 0;

        for (let i = 0; i < barCount; i++) {
          let value = 0;

          if (isActive && hasRealAudio) {
            // Map FFT bins to human audible speech frequencies (approx 100Hz - 4000Hz)
            // bin width ≈ 187 Hz at 48kHz/fftSize256, so ~24 bins cover the voice band
            const binIdx = Math.min(Math.floor((i / barCount) * 24), freqData.length - 1);
            value = (freqData[binIdx] || 0) / 255;
          } else if (isActive) {
            // Simulated voice wave if mic access is simulated or silence during talk
            value = Math.sin(t * 3 + i * 0.6) * 0.35 + Math.cos(t * 5 + i * 0.3) * 0.25 + 0.3;
          } else {
            // Idle ambient RF background carrier wave (low subtle floor)
            const wave1 = Math.sin(t * 1.5 + i * 0.4) * 0.08;
            const wave2 = Math.cos(t * 2.2 + i * 0.2) * 0.05;
            value = Math.max(0.04, wave1 + wave2 + 0.06);
          }

          value = Math.min(1, Math.max(0, value));

          if (value > maxVal) {
            maxVal = value;
            maxIndex = i;
          }

          // Smooth peak hold decay
          if (value >= peaksRef.current[i]) {
            peaksRef.current[i] = value;
          } else {
            peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 0.015);
          }

          const barHeight = Math.max(3, value * (h - 16));
          const x = startX + i * (barWidth + barSpacing);
          const y = h - 6 - barHeight;

          // Gradient for spectrum bars
          const grad = ctx.createLinearGradient(0, y + barHeight, 0, y);
          if (isTransmitting) {
            grad.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
            grad.addColorStop(0.6, '#f43f5e');
            grad.addColorStop(1, '#fbbf24');
          } else if (isReceiving) {
            grad.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
            grad.addColorStop(0.7, '#34d399');
            grad.addColorStop(1, '#60a5fa');
          } else {
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
            grad.addColorStop(1, 'rgba(52, 211, 153, 0.5)');
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();

          // Peak dot
          const peakY = h - 6 - (peaksRef.current[i] * (h - 16)) - 2;
          ctx.fillStyle = accentColor;
          ctx.fillRect(x, Math.max(4, peakY), barWidth, 1.5);
        }

        // Update peak frequency label once per second
        if (Math.floor(t * 10) % 20 === 0 && maxVal > 0.1) {
          const freqEst = Math.round((100 + (maxIndex / barCount) * 3400) / 100) / 10;
          setPeakFreqLabel(`${freqEst} kHz`);
        }
      }

      // 3. Render Waveform / Oscilloscope Mode or Dual Mode
      if (mode === 'waveform' || mode === 'dual') {
        ctx.beginPath();
        const sliceWidth = width / (timeSamples - 1);
        let currentX = 0;

        ctx.lineWidth = mode === 'dual' ? 1.5 : 2;
        ctx.strokeStyle = mode === 'dual' ? 'rgba(96, 165, 250, 0.85)' : primaryColor;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = mode === 'dual' ? 4 : 8;

        for (let i = 0; i < timeSamples; i++) {
          let v = 0.5;

          if (isActive && hasRealAudio && timeData[i] !== undefined) {
            v = timeData[i] / 255;
          } else if (isActive) {
            v = 0.5 + (Math.sin(t * 8 + i * 0.12) * 0.25) + (Math.cos(t * 14 + i * 0.28) * 0.15);
          } else {
            // Idle gentle carrier signal line
            v = 0.5 + (Math.sin(t * 2 + i * 0.06) * 0.04);
          }

          const y = v * (h - 12) + 6;

          if (i === 0) {
            ctx.moveTo(currentX, y);
          } else {
            ctx.lineTo(currentX, y);
          }
          currentX += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow blur
      }

      // Bottom baseline ruler
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, h - 3, width, 1);

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [mode, txRxState, isTransmitting, isReceiving, isActive, getAudioFrequencyData, getAudioTimeDomainData, height]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl bg-[#060a10] border border-slate-800/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] overflow-hidden relative select-none"
    >
      {/* Top Visualizer Telemetry Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 text-[10px] bg-slate-900/50">
        <div className="flex items-center gap-1.5">
          <Activity className={`w-3.5 h-3.5 ${
            isTransmitting ? 'text-rose-400 animate-pulse' : isReceiving ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
          }`} />
          <span className="font-semibold text-slate-300 uppercase tracking-wider">
            Audio Spectrum
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
            isTransmitting
              ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
              : isReceiving
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
              : 'bg-slate-800 text-slate-400'
          }`}>
            {isTransmitting ? 'TX ON' : isReceiving ? 'RX LIVE' : 'CARRIER'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Peak Frequency Readout */}
          <span className="font-digital text-emerald-400 font-bold text-[10px]">
            {peakFreqLabel}
          </span>

          {/* Interactive Mode Toggle Button */}
          <button
            type="button"
            onClick={cycleMode}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[9px] font-bold uppercase transition-colors cursor-pointer"
            title="Toggle Visualizer Mode: Spectrum / Waveform / Dual"
          >
            {mode === 'spectrum' ? (
              <>
                <BarChart2 className="w-2.5 h-2.5 text-emerald-400" />
                <span>Bars</span>
              </>
            ) : mode === 'waveform' ? (
              <>
                <Waves className="w-2.5 h-2.5 text-sky-400" />
                <span>Wave</span>
              </>
            ) : (
              <>
                <Radio className="w-2.5 h-2.5 text-amber-400" />
                <span>Dual</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* HTML5 Canvas for real-time 60fps rendering */}
      <canvas
        ref={canvasRef}
        className="w-full block cursor-pointer"
        style={{ height: `${height}px` }}
        onClick={cycleMode}
        title="Tap to switch between Spectrum Bars, Oscilloscope Wave, and Dual modes"
      />

      {/* Bottom Frequency Scale Markers */}
      <div className="flex justify-between px-3 py-1 text-[8px] font-digital text-slate-500 border-t border-slate-800/40 bg-slate-900/30">
        <span>100 Hz</span>
        <span>500 Hz</span>
        <span>1.5 kHz</span>
        <span>3.2 kHz</span>
        <span>4.8 kHz</span>
      </div>
    </div>
  );
};
