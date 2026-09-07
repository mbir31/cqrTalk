/**
 * cqrTalk® Web Audio Sound Synthesizer
 * Generates tactile radio squelch chirps, roger beeps, busy tones, and connection cues.
 * Pure Web Audio API synthesis - zero external asset dependencies, zero network delay.
 */

import { RogerBeepStyle } from '../types';

let audioCtx: AudioContext | null = null;
let unlockAttached = false;

/**
 * Browsers gate AudioContext on user activation. Attach one-time gesture
 * listeners so tones start as soon as the operator first interacts — and any
 * later suspended context is resumed on the next interaction.
 */
function attachUnlockListener(): void {
  if (unlockAttached || typeof window === 'undefined') return;
  unlockAttached = true;
  const unlock = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };
  const events = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
  for (const ev of events) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  attachUnlockListener();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playPttChirp(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(2200, now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

export function playRogerBeep(enabled = true, style: RogerBeepStyle = 'classic') {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (style) {
    case 'nasa': {
      // Apollo / NASA Quindar unkey tone (2475 Hz pure sinusoidal pulse)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2475, now);
      
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
      gain.gain.setValueAtTime(0.18, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }

    case 'tactical': {
      // Tactical Public Safety / Motorola chirp (1850 Hz chirp dropping to 1310 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1850, now);
      gain1.gain.setValueAtTime(0.16, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.045);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1310, now + 0.05);
      gain2.gain.setValueAtTime(0.16, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.12);
      break;
    }

    case 'cb': {
      // Classic CB radio 1520 Hz alert tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1520, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.setValueAtTime(0.18, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case 'classic':
    default: {
      // Classic Dual-Tone (1150 Hz -> 1780 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1150, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.06);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1780, now + 0.065);
      gain2.gain.setValueAtTime(0.15, now + 0.065);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.065);
      osc2.stop(now + 0.14);
      break;
    }
  }
}

export function previewRogerBeep(style: RogerBeepStyle = 'classic') {
  playRogerBeep(true, style);
}

export function playBusyTone(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Beep 1
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(420, now);
  gain1.gain.setValueAtTime(0.18, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.08);

  // Beep 2
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(420, now + 0.11);
  gain2.gain.setValueAtTime(0.18, now + 0.11);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.11);
  osc2.stop(now + 0.19);
}

export function playIncomingCue(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1175, now + 0.07);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

export function playConnectChime(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [587.33, 880]; // D5, A5
  tones.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + idx * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.12);
  });
}

export function playDisconnectChime(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [880, 587.33]; // A5 -> D5
  tones.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + idx * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.12);
  });
}

/**
 * Authentic RF Squelch Tail Noise Burst ("ksshh-tk")
 * Plays when incoming or outgoing transmission abruptly cuts out.
 */
export function playSquelchTail(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.075; // 75 milliseconds

  // Synthesize white noise buffer
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  // Bandpass filter to simulate FM radio demodulator hiss
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2200, now);
  filter.Q.setValueAtTime(1.8, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

  noiseSource.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noiseSource.start(now);
  noiseSource.stop(now + duration);

  // Subtle low-frequency squelch gate pop
  const popOsc = ctx.createOscillator();
  const popGain = ctx.createGain();
  popOsc.type = 'sine';
  popOsc.frequency.setValueAtTime(160, now + duration - 0.015);
  popGain.gain.setValueAtTime(0.09, now + duration - 0.015);
  popGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.01);

  popOsc.connect(popGain);
  popGain.connect(ctx.destination);
  popOsc.start(now + duration - 0.015);
  popOsc.stop(now + duration + 0.01);
}

/**
 * Mechanical Rotary Channel Knob Switch Click
 */
export function playRotaryClick(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(2800, now);
  osc.frequency.exponentialRampToValueAtTime(950, now + 0.014);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.016);
}

