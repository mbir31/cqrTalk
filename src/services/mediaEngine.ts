/**
 * cqrTalk® WebRTC Media Plane Engine
 * Handles low-latency half-duplex voice transmission, peer connections,
 * receiver DSP (dynamics compressor, sub-rumble filter, tactical RF bandpass),
 * WebRTC stats telemetry, and loopback diagnostic testing.
 */

export interface MediaEngineCallbacks {
  onSignal: (targetParticipantId: string, signal: any) => void;
  onVoiceActivity?: (participantId: string, isSpeaking: boolean) => void;
  onError?: (err: Error) => void;
}

export interface NetworkTelemetry {
  rttMs: number;
  packetLossPct: number;
  jitterMs: number;
  quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED';
}

interface RxChain {
  source: MediaStreamAudioSourceNode;
  rumbleHighpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  destination: MediaStreamAudioDestinationNode;
  audioEl: HTMLAudioElement;
}

const RF_ENABLED_LOW = 300;   // Hz
const RF_ENABLED_HIGH = 3400; // Hz
const RF_BYPASS_LOW = 20;     // Hz (inaudible)
const RF_BYPASS_HIGH = 20000; // Hz

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

/**
 * Optimizes SDP for WebRTC Opus voice codec:
 * - useinbandfec=1: In-band Forward Error Correction against mobile packet drops
 * - usedtx=1: Discontinuous Transmission saves bandwidth and power during silence
 * - ptime=20 / minptime=10: Low packetization duration for sub-50ms transmission
 * - maxaveragebitrate=32000: Studio clarity without cellular congestion
 * - stereo=0: Mono voice channel
 */
function tuneOpusSdp(sdp: string): string {
  if (!sdp) return sdp;

  return sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
    // If Opus parameters already present or payload type
    if (params.includes('minptime') || params.includes('useinbandfec') || params.includes('opus') || /^\d+/.test(pt)) {
      // Add or replace parameters
      let updated = params;
      const keyValues = [
        ['useinbandfec', '1'],
        ['usedtx', '1'],
        ['minptime', '10'],
        ['ptime', '20'],
        ['maxaveragebitrate', '32000'],
        ['stereo', '0'],
        ['sprop-stereo', '0'],
        ['cbr', '0']
      ];

      for (const [k, v] of keyValues) {
        if (updated.includes(`${k}=`)) {
          updated = updated.replace(new RegExp(`${k}=\\w+`), `${k}=${v}`);
        } else {
          updated = `${updated};${k}=${v}`;
        }
      }
      return `a=fmtp:${pt} ${updated}`;
    }
    return match;
  });
}

export class MediaEngine {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private rxChains = new Map<string, RxChain>();
  private negotiating = new Set<string>();
  private recoveryCooldowns = new Map<string, number>();
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];
  private localParticipantId = '';
  private callbacks: MediaEngineCallbacks;
  private isTransmitting = false;
  private isSpeakerMuted = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private meterDataArray: Uint8Array | null = null;
  private rfFilterEnabled = false;
  private unlockAttached = false;
  private unlockHandler: (() => void) | null = null;

  // Synthetic microphone stream fallback when physical mic is denied/unavailable
  private syntheticOscillator: OscillatorNode | null = null;
  private syntheticGain: GainNode | null = null;
  public isUsingSyntheticMic = false;
  public isMicPermissionDenied = false;

  // Interactive Loopback Diagnostic / Mic Check recording buffer
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private loopbackAudioEl: HTMLAudioElement | null = null;
  public isRecordingLoopback = false;
  public isPlayingLoopback = false;

  constructor(callbacks: MediaEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setRfFilterEnabled(enabled: boolean) {
    this.rfFilterEnabled = enabled;
    for (const chain of this.rxChains.values()) {
      this.applyRfToChain(chain);
    }
  }

  public getRfFilterEnabled(): boolean {
    return this.rfFilterEnabled;
  }

  public setIceServers(servers: RTCIceServer[]) {
    if (servers && servers.length > 0) {
      this.iceServers = servers;
    }
  }

  public setLocalParticipantId(id: string) {
    this.localParticipantId = id;
  }

  // ---------------------------------------------------------------------------
  // Microphone & audio graph
  // ---------------------------------------------------------------------------

  private createSyntheticStream(): MediaStream | null {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return null;

      const destination = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime); // silent by default

      osc.connect(gain);
      gain.connect(destination);

      if (!this.analyser) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
        this.meterDataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }
      try {
        gain.connect(this.analyser);
      } catch (e) {}

      osc.start();

      this.syntheticOscillator = osc;
      this.syntheticGain = gain;
      this.isUsingSyntheticMic = true;

      // Ensure tracks start muted (half-duplex PTT)
      destination.stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      return destination.stream;
    } catch (err) {
      console.warn('Unable to create synthetic audio stream:', err);
      return null;
    }
  }

  public async acquireMicrophone(forcePrompt = false): Promise<MediaStream> {
    if (!forcePrompt && this.localStream && this.localStream.active && !this.isUsingSyntheticMic) {
      return this.localStream;
    }

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone mediaDevices API not available');
      }

      // Studio DSP audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        },
        video: false
      });

      // Keep audio track pre-warmed but disabled until floor is granted (half-duplex)
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      const oldStream = this.localStream;
      const oldTrack = oldStream ? oldStream.getAudioTracks()[0] : null;
      const newTrack = stream.getAudioTracks()[0];

      this.localStream = stream;
      this.isUsingSyntheticMic = false;
      this.isMicPermissionDenied = false;

      // Cleanup synthetic fallback oscillator if running
      if (this.syntheticOscillator) {
        try {
          this.syntheticOscillator.stop();
          this.syntheticOscillator.disconnect();
        } catch (e) {}
        this.syntheticOscillator = null;
      }
      if (this.syntheticGain) {
        try {
          this.syntheticGain.disconnect();
        } catch (e) {}
        this.syntheticGain = null;
      }

      // Update senders on existing peer connections
      if (newTrack) {
        for (const [pid, pc] of this.peerConnections) {
          const senders = pc.getSenders().filter(s => s.track);
          if (senders.length > 0) {
            for (const s of senders) {
              if (s.track === oldTrack || !s.track) {
                s.replaceTrack(newTrack).catch(() => {});
              }
            }
          } else {
            pc.addTrack(newTrack, stream);
            if (pc.remoteDescription) {
              void this.negotiate(pid, pc);
            }
          }
        }
      }

      // Setup Web Audio Analyser & Dynamics Compressor for local metering
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
          }
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
          }
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 256;
          this.analyser.smoothingTimeConstant = 0.8;
          this.meterDataArray = new Uint8Array(this.analyser.frequencyBinCount);
          const micSource = this.audioContext.createMediaStreamSource(stream);
          micSource.connect(this.analyser);
          this.attachGestureUnlock();
        }
      } catch (e) {
        console.warn('AudioAnalyser setup warning:', e);
      }

      return stream;
    } catch (err: any) {
      const isPermissionDenied =
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.name === 'SecurityError' ||
        err.message?.toLowerCase().includes('permission denied') ||
        err.message?.toLowerCase().includes('permission');

      this.isMicPermissionDenied = isPermissionDenied;

      // Provide synthetic fallback stream so WebRTC peer connections still initialize cleanly
      if (!this.localStream || !this.localStream.active) {
        const fallback = this.createSyntheticStream();
        if (fallback) {
          this.localStream = fallback;
          for (const pc of this.peerConnections.values()) {
            this.addLocalTracks(pc);
          }
        }
      }

      console.warn('Microphone not acquired (using radio standby fallback):', err.message || err.name);

      if (!isPermissionDenied && this.callbacks.onError) {
        this.callbacks.onError(err);
      }

      throw err;
    }
  }

  /** Check whether real microphone or synthetic fallback is currently active */
  public hasLocalStream(): boolean {
    return !!(this.localStream && this.localStream.active);
  }

  /** Resume the AudioContext & retry pending playback — call from user gestures. */
  public unlockAudio() {
    this.tryAudioUnlock();
  }

  private attachGestureUnlock() {
    if (this.unlockAttached || typeof window === 'undefined') return;
    this.unlockAttached = true;
    const handler = () => this.tryAudioUnlock();
    this.unlockHandler = handler;
    for (const ev of UNLOCK_EVENTS) {
      window.addEventListener(ev, handler, { capture: true, passive: true });
    }
  }

  private detachGestureUnlock() {
    if (!this.unlockAttached || !this.unlockHandler) return;
    this.unlockAttached = false;
    for (const ev of UNLOCK_EVENTS) {
      window.removeEventListener(ev, this.unlockHandler, { capture: true } as any);
    }
    this.unlockHandler = null;
  }

  private tryAudioUnlock() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    for (const el of this.remoteAudioElements.values()) {
      if (el.paused && el.srcObject) {
        el.play().catch(() => {
          // Will retry on next user gesture
        });
      }
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
      } catch (e) {
        return null;
      }
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  public setSpeakerMuted(muted: boolean) {
    this.isSpeakerMuted = muted;
    for (const audioEl of this.remoteAudioElements.values()) {
      audioEl.muted = muted;
    }
  }

  /** Instant 0ms Key-Up: un-gates the pre-warmed audio track */
  public startTransmitting() {
    this.isTransmitting = true;
    this.tryAudioUnlock();
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
    if (this.isUsingSyntheticMic && this.syntheticGain && this.audioContext) {
      try {
        this.syntheticGain.gain.setValueAtTime(0.18, this.audioContext.currentTime);
      } catch (e) {}
    }
  }

  public stopTransmitting() {
    this.isTransmitting = false;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
    if (this.isUsingSyntheticMic && this.syntheticGain && this.audioContext) {
      try {
        this.syntheticGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      } catch (e) {}
    }
  }

  public getMicVolumeLevel(): number {
    if (!this.analyser || !this.meterDataArray) {
      return 0;
    }
    this.analyser.getByteFrequencyData(this.meterDataArray);
    let sum = 0;
    for (let i = 0; i < this.meterDataArray.length; i++) {
      sum += this.meterDataArray[i];
    }
    const average = sum / this.meterDataArray.length;
    return Math.min(100, Math.round((average / 128) * 100));
  }

  public getFrequencyData(outputArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(outputArray);
    }
  }

  public getTimeDomainData(outputArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(outputArray);
    }
  }

  // ---------------------------------------------------------------------------
  // Peer connections & signaling
  // ---------------------------------------------------------------------------

  private getOrCreateAudioElement(participantId: string): HTMLAudioElement {
    let el = this.remoteAudioElements.get(participantId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.muted = this.isSpeakerMuted;
      el.setAttribute('playsinline', '');
      if (document.body) {
        document.body.appendChild(el);
      }
      this.remoteAudioElements.set(participantId, el);
    }
    return el;
  }

  private addLocalTracks(pc: RTCPeerConnection): boolean {
    if (!this.localStream) return false;
    let added = false;
    const existingTracks = new Set(pc.getSenders().map(s => s.track));
    for (const track of this.localStream.getTracks()) {
      if (!existingTracks.has(track)) {
        pc.addTrack(track, this.localStream);
        added = true;
      }
    }
    return added;
  }

  /** Apply RF bandpass configuration to an RX chain's filter nodes. */
  private applyRfToChain(chain: RxChain) {
    const low = this.rfFilterEnabled ? RF_ENABLED_LOW : RF_BYPASS_LOW;
    const high = this.rfFilterEnabled ? RF_ENABLED_HIGH : RF_BYPASS_HIGH;
    try {
      const now = this.audioContext ? this.audioContext.currentTime : 0;
      chain.highpass.frequency.setTargetAtTime(low, now, 0.01);
      chain.lowpass.frequency.setTargetAtTime(high, now, 0.01);
    } catch (e) {
      // Chain may already be torn down
    }
  }

  /**
   * Build complete DSP route for remote incoming audio:
   * Source -> 80Hz Highpass (Sub-rumble Cut) -> Dynamics Compressor (Auto-Leveling) -> Highpass (300Hz) -> Lowpass (3.4kHz) -> Destination -> Audio Element
   */
  private buildRxChain(participantId: string, stream: MediaStream) {
    const previous = this.rxChains.get(participantId);
    if (previous) {
      try {
        previous.source.disconnect();
        previous.rumbleHighpass.disconnect();
        previous.compressor.disconnect();
        previous.highpass.disconnect();
        previous.lowpass.disconnect();
        previous.destination.disconnect();
      } catch (e) {}
      this.rxChains.delete(participantId);
    }

    const audioEl = this.getOrCreateAudioElement(participantId);

    const ctx = this.ensureAudioContext();
    if (!ctx) {
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
      return;
    }

    try {
      const source = ctx.createMediaStreamSource(stream);

      // 1. Sub-rumble 80Hz highpass filter to eliminate desk thumps & wind rumble
      const rumbleHighpass = ctx.createBiquadFilter();
      rumbleHighpass.type = 'highpass';
      rumbleHighpass.frequency.value = 80;
      rumbleHighpass.Q.value = 0.707;

      // 2. Dynamics compressor for volume leveling across soft & loud speakers
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(12, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.15, ctx.currentTime);

      // 3. Bandpass filters (tactical voice RF simulation)
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      lowpass.type = 'lowpass';
      highpass.Q.value = 0.707;
      lowpass.Q.value = 0.707;

      const destination = ctx.createMediaStreamDestination();

      // Connect DSP chain
      source.connect(rumbleHighpass);
      rumbleHighpass.connect(compressor);
      compressor.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(destination);

      const chain: RxChain = {
        source,
        rumbleHighpass,
        compressor,
        highpass,
        lowpass,
        destination,
        audioEl
      };
      this.applyRfToChain(chain);
      this.rxChains.set(participantId, chain);

      audioEl.srcObject = destination.stream;
      audioEl.play().catch(() => {});

      // Feed into visualizer
      if (this.analyser) {
        compressor.connect(this.analyser);
      }
    } catch (e) {
      console.warn('RX DSP chain unavailable, using direct stream:', e);
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
    }
  }

  public async createOrGetPeerConnection(targetParticipantId: string, shouldInitiateOffer = false): Promise<RTCPeerConnection> {
    let pc = this.peerConnections.get(targetParticipantId);
    if (pc && pc.connectionState === 'connected') {
      return pc;
    }
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed' && pc.connectionState !== 'disconnected') {
      return pc;
    }

    if (pc) {
      try {
        pc.close();
      } catch (e) {}
    }

    pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all'
    });

    this.peerConnections.set(targetParticipantId, pc);

    // Add local audio tracks
    this.addLocalTracks(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSignal(targetParticipantId, {
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      // Zero-latency playout configuration on audio receiver
      if (event.receiver) {
        const rcv = event.receiver as any;
        if ('playoutDelayHint' in rcv) {
          rcv.playoutDelayHint = 0; // 0ms buffer target
        }
        if ('jitterBufferTarget' in rcv) {
          rcv.jitterBufferTarget = 0;
        }
      }

      if (event.streams && event.streams[0]) {
        this.buildRxChain(targetParticipantId, event.streams[0]);
      } else if (event.track) {
        const stream = new MediaStream([event.track]);
        this.buildRxChain(targetParticipantId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'failed') {
        this.schedulePeerRecovery(targetParticipantId);
      }
    };

    pc.onnegotiationneeded = () => {
      if (pc!.remoteDescription) {
        void this.negotiate(targetParticipantId, pc!);
      }
    };

    if (shouldInitiateOffer) {
      await this.negotiate(targetParticipantId, pc);
    }

    return pc;
  }

  private canInitiateOffer(participantId: string): boolean {
    return this.localParticipantId > participantId;
  }

  private async negotiate(targetParticipantId: string, pc: RTCPeerConnection): Promise<void> {
    if (this.negotiating.has(targetParticipantId)) return;
    if (!this.localStream) return;
    if (pc.signalingState !== 'stable') return;

    this.negotiating.add(targetParticipantId);
    try {
      if (pc.getSenders().length === 0) {
        this.addLocalTracks(pc);
      }
      if (pc.getSenders().length === 0) return;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      // Apply Opus optimization to offer SDP
      const tunedSdp = tuneOpusSdp(offer.sdp || '');
      const tunedOffer = new RTCSessionDescription({
        type: offer.type,
        sdp: tunedSdp
      });

      await pc.setLocalDescription(tunedOffer);
      this.callbacks.onSignal(targetParticipantId, {
        description: pc.localDescription
      });
    } catch (err: any) {
      console.warn('Failed to create WebRTC offer:', err);
    } finally {
      this.negotiating.delete(targetParticipantId);
    }
  }

  private schedulePeerRecovery(participantId: string) {
    const now = Date.now();
    const lastAttempt = this.recoveryCooldowns.get(participantId) || 0;
    if (now - lastAttempt < 4000) return;
    this.recoveryCooldowns.set(participantId, now);

    window.setTimeout(() => {
      const pc = this.peerConnections.get(participantId);
      if (!pc || pc.connectionState !== 'failed') return;
      if (!this.localStream) return;
      console.warn(`Peer ${participantId} connection failed — triggering ICE restart`);
      try {
        pc.restartIce();
      } catch (e) {}
      void this.createOrGetPeerConnection(participantId, this.canInitiateOffer(participantId));
    }, 1000);
  }

  public async handleRemoteSignal(fromParticipantId: string, signal: any) {
    let pc = this.peerConnections.get(fromParticipantId);
    if (!pc) {
      pc = await this.createOrGetPeerConnection(fromParticipantId, false);
    }

    if (signal.description) {
      const desc = new RTCSessionDescription(signal.description);

      if (desc.type === 'offer' && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {
          return;
        }
      }

      try {
        await pc.setRemoteDescription(desc);
      } catch (err) {
        console.warn('Error setting remote description:', err);
        return;
      }

      if (desc.type === 'offer') {
        try {
          if (pc.getSenders().length === 0) {
            this.addLocalTracks(pc);
          }
          const answer = await pc.createAnswer();
          const tunedAnswer = new RTCSessionDescription({
            type: answer.type,
            sdp: tuneOpusSdp(answer.sdp || '')
          });

          await pc.setLocalDescription(tunedAnswer);
          this.callbacks.onSignal(fromParticipantId, {
            description: pc.localDescription
          });
        } catch (err) {
          console.warn('Error creating WebRTC answer:', err);
        }
      }
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    }
  }

  /**
   * Restarts ICE on all active peer connections (called when user switches from Wi-Fi to 4G/5G).
   */
  public restartIceAll() {
    for (const [pid, pc] of this.peerConnections) {
      if (pc && pc.connectionState !== 'closed') {
        try {
          pc.restartIce();
          if (this.canInitiateOffer(pid)) {
            void this.negotiate(pid, pc);
          }
        } catch (e) {
          console.warn('ICE restart error on peer:', pid, e);
        }
      }
    }
  }

  /**
   * Polls real WebRTC statistics (RTT, jitter, packet loss) across active connections.
   */
  public async getNetworkTelemetry(): Promise<NetworkTelemetry> {
    let totalRtt = 0;
    let rttCount = 0;
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;
    let maxJitterMs = 0;

    for (const pc of this.peerConnections.values()) {
      if (pc.connectionState === 'connected') {
        try {
          const stats = await pc.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (typeof report.currentRoundTripTime === 'number') {
                totalRtt += report.currentRoundTripTime * 1000;
                rttCount++;
              }
            } else if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              if (typeof report.packetsLost === 'number') {
                totalPacketsLost += report.packetsLost;
              }
              if (typeof report.packetsReceived === 'number') {
                totalPacketsReceived += report.packetsReceived;
              }
              if (typeof report.jitter === 'number') {
                maxJitterMs = Math.max(maxJitterMs, report.jitter * 1000);
              }
            }
          });
        } catch (e) {}
      }
    }

    const rttMs = rttCount > 0 ? Math.round(totalRtt / rttCount) : 24;
    const totalPackets = totalPacketsLost + totalPacketsReceived;
    const packetLossPct = totalPackets > 0 ? Math.round((totalPacketsLost / totalPackets) * 100) : 0;
    const jitterMs = Math.round(maxJitterMs);

    let quality: NetworkTelemetry['quality'] = 'EXCELLENT';
    if (rttMs > 250 || packetLossPct > 10) {
      quality = 'POOR';
    } else if (rttMs > 130 || packetLossPct > 4) {
      quality = 'FAIR';
    } else if (rttMs > 70 || packetLossPct > 1) {
      quality = 'GOOD';
    }

    return {
      rttMs,
      packetLossPct,
      jitterMs,
      quality
    };
  }

  // ---------------------------------------------------------------------------
  // Interactive "Mic Check" Loopback Diagnostic Tool
  // ---------------------------------------------------------------------------

  public async startMicCheck(): Promise<boolean> {
    try {
      const stream = await this.acquireMicrophone(true);
      if (!stream) return false;

      this.recordedChunks = [];
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;

      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      recorder.start(100);
      this.mediaRecorder = recorder;
      this.isRecordingLoopback = true;
      return true;
    } catch (err) {
      console.warn('Failed to start loopback recording:', err);
      return false;
    }
  }

  public stopMicCheckAndPlay(onEnded?: () => void): void {
    if (!this.mediaRecorder) return;

    this.isRecordingLoopback = false;
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;

    recorder.onstop = () => {
      if (this.recordedChunks.length === 0) return;
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(blob);

      if (!this.loopbackAudioEl) {
        this.loopbackAudioEl = new Audio();
        if (document.body) {
          document.body.appendChild(this.loopbackAudioEl);
        }
      }

      this.loopbackAudioEl.src = audioUrl;
      this.isPlayingLoopback = true;

      this.loopbackAudioEl.onended = () => {
        this.isPlayingLoopback = false;
        URL.revokeObjectURL(audioUrl);
        onEnded?.();
      };

      this.loopbackAudioEl.play().catch(() => {
        this.isPlayingLoopback = false;
      });
    };

    recorder.stop();
  }

  public cancelMicCheck(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.mediaRecorder = null;
    this.isRecordingLoopback = false;
    if (this.loopbackAudioEl) {
      this.loopbackAudioEl.pause();
      this.isPlayingLoopback = false;
    }
  }

  public removePeer(participantId: string) {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      this.peerConnections.delete(participantId);
    }
    const chain = this.rxChains.get(participantId);
    if (chain) {
      try {
        chain.source.disconnect();
        chain.rumbleHighpass.disconnect();
        chain.compressor.disconnect();
        chain.highpass.disconnect();
        chain.lowpass.disconnect();
        chain.destination.disconnect();
      } catch (e) {}
      this.rxChains.delete(participantId);
    }
    const audioEl = this.remoteAudioElements.get(participantId);
    if (audioEl) {
      audioEl.srcObject = null;
      try {
        audioEl.remove();
      } catch (e) {}
      this.remoteAudioElements.delete(participantId);
    }
    this.negotiating.delete(participantId);
  }

  public cleanup() {
    this.stopTransmitting();
    this.cancelMicCheck();
    for (const [id] of Array.from(this.peerConnections.entries())) {
      this.removePeer(id);
    }
    if (this.syntheticOscillator) {
      try {
        this.syntheticOscillator.stop();
        this.syntheticOscillator.disconnect();
      } catch (e) {}
      this.syntheticOscillator = null;
    }
    if (this.syntheticGain) {
      try {
        this.syntheticGain.disconnect();
      } catch (e) {}
      this.syntheticGain = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.detachGestureUnlock();
    this.analyser = null;
    this.meterDataArray = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      const ctx = this.audioContext;
      this.audioContext = null;
      ctx.close().catch(() => {});
    }
  }
}
