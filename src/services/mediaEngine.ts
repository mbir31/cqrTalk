/**
 * cqrTalk® WebRTC Media Plane Engine
 * Handles low-latency half-duplex voice transmission, peer connections,
 * receiver DSP (tactical RF bandpass), and audio metering.
 */

export interface MediaEngineCallbacks {
  onSignal: (targetParticipantId: string, signal: any) => void;
  onVoiceActivity?: (participantId: string, isSpeaking: boolean) => void;
  onError?: (err: Error) => void;
}

interface RxChain {
  source: MediaStreamAudioSourceNode;
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

export class MediaEngine {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private rxChains = new Map<string, RxChain>();
  private negotiating = new Set<string>();
  private recoveryCooldowns = new Map<string, number>();
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
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

  public async acquireMicrophone(): Promise<MediaStream> {
    if (this.localStream && this.localStream.active) {
      return this.localStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });

      // Keep audio track disabled by default until floor is granted (half-duplex)
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      this.localStream = stream;

      // Setup analyser for voice VU meter & frequency visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioCtx();
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

      // Safety: make sure every existing peer is wired to the stream
      for (const [pid, pc] of this.peerConnections) {
        if (pc.getSenders().length === 0 && pc.connectionState !== 'connected') {
          const added = this.addLocalTracks(pc);
          if (added && pc.remoteDescription) {
            // We owe this peer our audio track — negotiate the addition
            void this.negotiate(pid, pc);
          }
        }
      }

      return stream;
    } catch (err: any) {
      console.error('Microphone acquisition failed:', err);
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
      throw err;
    }
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
          // Will retry on the next user gesture
        });
      }
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.audioContext = new AudioCtx();
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

  public startTransmitting() {
    this.isTransmitting = true;
    this.tryAudioUnlock();
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
  }

  public stopTransmitting() {
    this.isTransmitting = false;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
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
      // iOS requires the element to live in the DOM for reliable playback
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

  /** Apply the RF bandpass configuration to an RX chain's filter nodes. */
  private applyRfToChain(chain: RxChain) {
    const low = this.rfFilterEnabled ? RF_ENABLED_LOW : RF_BYPASS_LOW;
    const high = this.rfFilterEnabled ? RF_ENABLED_HIGH : RF_BYPASS_HIGH;
    try {
      chain.highpass.frequency.setTargetAtTime(low, this.audioContext ? this.audioContext.currentTime : 0, 0.01);
      chain.lowpass.frequency.setTargetAtTime(high, this.audioContext ? this.audioContext.currentTime : 0, 0.01);
    } catch (e) {
      // Chain may already be torn down
    }
  }

  /** Build the DSP route for a remote peer's audio. */
  private buildRxChain(participantId: string, stream: MediaStream) {
    const previous = this.rxChains.get(participantId);
    if (previous) {
      try {
        previous.source.disconnect();
        previous.highpass.disconnect();
        previous.lowpass.disconnect();
        previous.destination.disconnect();
      } catch (e) {
        // Ignore
      }
      this.rxChains.delete(participantId);
    }

    const audioEl = this.getOrCreateAudioElement(participantId);

    const ctx = this.ensureAudioContext();
    if (!ctx) {
      // No Web Audio support — play the raw stream directly
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
      return;
    }

    try {
      const source = ctx.createMediaStreamSource(stream);
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      lowpass.type = 'lowpass';
      highpass.Q.value = 0.707;
      lowpass.Q.value = 0.707;

      const destination = ctx.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(destination);

      const chain: RxChain = { source, highpass, lowpass, destination, audioEl };
      this.applyRfToChain(chain);
      this.rxChains.set(participantId, chain);

      audioEl.srcObject = destination.stream;
      audioEl.play().catch(() => {
        // Autoplay blocked — unlock on the next user gesture (tryAudioUnlock)
      });

      // Also feed the raw remote signal into the analyser for the visualizer
      if (this.analyser) {
        source.connect(this.analyser);
      }
    } catch (e) {
      console.warn('RX DSP chain unavailable, using raw stream:', e);
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
      return pc; // still connecting — reuse it
    }

    if (pc) {
      try {
        pc.close();
      } catch (e) {
        // Ignore
      }
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
      if (event.streams && event.streams[0]) {
        this.buildRxChain(targetParticipantId, event.streams[0]);
      } else if (event.track) {
        // Tracks without streams are rare; wrap them so playback still works
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
      // Only auto-negotiate for established calls (initial offers are driven
      // deterministically by the lexically greater participant).
      if (pc!.remoteDescription) {
        void this.negotiate(targetParticipantId, pc!);
      }
    };

    if (shouldInitiateOffer) {
      await this.negotiate(targetParticipantId, pc);
    }

    return pc;
  }

  /** Deterministic single initiator per peer pair (lexically greater ID). */
  private canInitiateOffer(participantId: string): boolean {
    return this.localParticipantId > participantId;
  }

  /** Perfect-negotiation-lite offer flow with glare protection. */
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
      await pc.setLocalDescription(offer);
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
    if (now - lastAttempt < 5000) return; // cooldown
    this.recoveryCooldowns.set(participantId, now);

    window.setTimeout(() => {
      const pc = this.peerConnections.get(participantId);
      if (!pc || pc.connectionState !== 'failed') return;
      if (!this.localStream) return;
      console.warn(`Peer ${participantId} failed — rebuilding connection`);
      // Rebuild the connection; the lexically greater side re-offers.
      void this.createOrGetPeerConnection(participantId, this.canInitiateOffer(participantId));
    }, 1200);
  }

  public async handleRemoteSignal(fromParticipantId: string, signal: any) {
    let pc = this.peerConnections.get(fromParticipantId);
    if (!pc) {
      pc = await this.createOrGetPeerConnection(fromParticipantId, false);
    }

    if (signal.description) {
      const desc = new RTCSessionDescription(signal.description);

      if (desc.type === 'offer' && pc.signalingState === 'have-local-offer') {
        // Glare: we offered at the same time — roll back and answer politely
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {
          // Rollback not supported — drop the incoming offer
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
          await pc.setLocalDescription(answer);
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

  public removePeer(participantId: string) {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {
        // Ignore
      }
      this.peerConnections.delete(participantId);
    }
    const chain = this.rxChains.get(participantId);
    if (chain) {
      try {
        chain.source.disconnect();
        chain.highpass.disconnect();
        chain.lowpass.disconnect();
        chain.destination.disconnect();
      } catch (e) {
        // Ignore
      }
      this.rxChains.delete(participantId);
    }
    const audioEl = this.remoteAudioElements.get(participantId);
    if (audioEl) {
      audioEl.srcObject = null;
      try {
        audioEl.remove();
      } catch (e) {
        // Ignore
      }
      this.remoteAudioElements.delete(participantId);
    }
    this.negotiating.delete(participantId);
  }

  public cleanup() {
    this.stopTransmitting();
    for (const [id] of Array.from(this.peerConnections.entries())) {
      this.removePeer(id);
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
