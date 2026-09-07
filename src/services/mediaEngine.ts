/**
 * cqrTalk WebRTC Media Plane Engine
 * Handles low-latency half-duplex voice transmission, peer connections, and audio metering.
 */

export interface MediaEngineCallbacks {
  onSignal: (targetParticipantId: string, signal: any) => void;
  onVoiceActivity?: (participantId: string, isSpeaking: boolean) => void;
  onError?: (err: Error) => void;
}

export class MediaEngine {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
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

  constructor(callbacks: MediaEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setRfFilterEnabled(enabled: boolean) {
    this.rfFilterEnabled = enabled;
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
          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 128;
          this.analyser.smoothingTimeConstant = 0.8;
          source.connect(this.analyser);
          this.meterDataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
      } catch (e) {
        console.warn('AudioAnalyser setup warning:', e);
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

  public setSpeakerMuted(muted: boolean) {
    this.isSpeakerMuted = muted;
    for (const audioEl of this.remoteAudioElements.values()) {
      audioEl.muted = muted;
    }
  }

  public startTransmitting() {
    this.isTransmitting = true;
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

  public async createOrGetPeerConnection(targetParticipantId: string, shouldInitiateOffer = false): Promise<RTCPeerConnection> {
    let pc = this.peerConnections.get(targetParticipantId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    if (pc) {
      pc.close();
    }

    pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all'
    });

    this.peerConnections.set(targetParticipantId, pc);

    // Add local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSignal(targetParticipantId, {
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      let audioEl = this.remoteAudioElements.get(targetParticipantId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.muted = this.isSpeakerMuted;
        this.remoteAudioElements.set(targetParticipantId, audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.play().catch(() => {
        // May fail if user hasn't interacted yet; will play on first click/touch
      });

      // Also connect remote audio to analyser for frequency visualization
      try {
        if (this.audioContext && this.analyser && event.streams[0]) {
          const rxSource = this.audioContext.createMediaStreamSource(event.streams[0]);
          rxSource.connect(this.analyser);
        }
      } catch (e) {
        // Ignore duplicate connections
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'failed') {
        pc.restartIce?.();
      }
    };

    if (shouldInitiateOffer) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await pc.setLocalDescription(offer);
        this.callbacks.onSignal(targetParticipantId, {
          description: pc.localDescription
        });
      } catch (err: any) {
        console.error('Failed to create WebRTC offer:', err);
      }
    }

    return pc;
  }

  public async handleRemoteSignal(fromParticipantId: string, signal: any) {
    let pc = this.peerConnections.get(fromParticipantId);
    if (!pc) {
      pc = await this.createOrGetPeerConnection(fromParticipantId, false);
    }

    if (signal.description) {
      const desc = new RTCSessionDescription(signal.description);
      await pc.setRemoteDescription(desc);

      if (desc.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.callbacks.onSignal(fromParticipantId, {
          description: pc.localDescription
        });
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
      pc.close();
      this.peerConnections.delete(participantId);
    }
    const audioEl = this.remoteAudioElements.get(participantId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      this.remoteAudioElements.delete(participantId);
    }
  }

  public cleanup() {
    this.stopTransmitting();
    for (const [id] of this.peerConnections) {
      this.removePeer(id);
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
