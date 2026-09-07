# cqrTalk® — Instant Zero-Install Push-To-Talk Walkie-Talkie

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20App-cqrt.vercel.app-00dfa2?style=for-the-badge&logo=vercel&logoColor=black)](https://cqrt.vercel.app/)
[![PWA](https://img.shields.io/badge/PWA-Zero--Install-10b981?style=for-the-badge&logo=pwa&logoColor=white)](https://cqrt.vercel.app/)
[![WebRTC](https://img.shields.io/badge/Media-WebRTC%20Opus%2048kHz-3b82f6?style=for-the-badge&logo=webrtc&logoColor=white)](https://cqrt.vercel.app/)
[![Latency](https://img.shields.io/badge/Latency-Ultra--Low%20Adaptive%20Buffer-06b6d4?style=for-the-badge&logo=fastapi&logoColor=white)](https://cqrt.vercel.app/)
[![Security](https://img.shields.io/badge/Security-DTLS--SRTP%20Encrypted-f59e0b?style=for-the-badge&logo=shield&logoColor=white)](https://cqrt.vercel.app/)
[![Privacy](https://img.shields.io/badge/Privacy-No%20Accounts%20%7C%20No%20Audio%20Stored-8b5cf6?style=for-the-badge&logo=privateinternetaccess&logoColor=white)](https://cqrt.vercel.app/)

<br />

**Turn any smartphone, tablet, or computer into a rugged, tactical Push-To-Talk (PTT) transceiver in 3 seconds.**  
*No App Store downloads. No user accounts. No phone numbers. No servers recording your voice.*

👉 **[Launch Live Radio at cqrt.vercel.app](https://cqrt.vercel.app/)** 👈

</div>

---

## 📸 Interface & Hardware Ergonomics

Explore the physical transceiver chassis, tactical LCD display, configuration knobs, and pairing interfaces:

<div align="center">

### Main Transceiver Interface
<img src="./Main%20interface.png" alt="Main interface" width="700" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

<br /><br />

| Configuration & Acoustic Diagnostic | Join a Channel |
| :---: | :---: |
| <img src="./Configuration%20interface.png" alt="Configuration interface" width="380" style="border-radius: 10px;" /> | <img src="./Join%20a%20channel.png" alt="Join a channel" width="380" style="border-radius: 10px;" /> |
| *Hardware Roger beeps, mic loopback test & DSP filters* | *Instant 4-digit PIN authentication* |

<br />

| Create 1-to-1 Channel | Create Group Channel |
| :---: | :---: |
| <img src="./Create%201-to-1%20channel.png" alt="Create 1-to-1 channel" width="380" style="border-radius: 10px;" /> | <img src="./Create%20Group%20Channel.png" alt="Create Group Channel" width="380" style="border-radius: 10px;" /> |
| *Direct peer-to-peer private half-duplex link* | *Multi-operator tactical dispatch broadcast* |

</div>

---

## ⚡ What is cqrTalk®?

Traditional walkie-talkie apps force teams into friction: downloading heavy 100MB apps, creating accounts, handing over phone numbers, and trusting centralized cloud servers with their live voice streams. Physical two-way UHF/VHF radios require expensive hardware ($100–$500/unit), FCC licensing, and battery chargers, yet remain completely unencrypted and susceptible to public eavesdropping.

**cqrTalk® eliminates every barrier.**

Built as a high-performance Progressive Web App (PWA) on modern WebRTC and Web Audio DSP standards, cqrTalk® provides instant, deterministic half-duplex voice communication through your browser. Just share a **4-digit PIN** or tap an invite link, and your team is immediately on the same tactical channel.

```
+-------------------------------------------------------------------------------+
|                              cqrTalk® ARCHITECTURE                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|   [ Operator A ]                                             [ Operator B ]   |
|   (Mobile Safari / Chrome)                                   (Chrome / Edge)  |
|         |                                                           |         |
|         |-------- 1. Ephemeral Floor Lease (WebSocket) ------------>|         |
|         |         "I have the floor (TX), channel is BUSY"          |         |
|         |                                                           |         |
|         |======== 2. Direct E2E Audio Stream (WebRTC Opus) ========>|         |
|         |         (Encrypted via DTLS-SRTP — NEVER stored)          |         |
|         |         (Sub-50ms Zero-Buffer Target + FEC Enabled)       |         |
|         |                                                           |         |
|         |-------- 3. Local + Remote 'Roger' Beep Trigger ---------->|         |
|         |         "Over to you (Floor free / IDLE)"                 |         |
|                                                                               |
+-------------------------------------------------------------------------------+
```

---

## 🚀 Latest Features & Core Additions

### 1. ⚡ Ultra-Low Latency & Fast-Keying Audio Transmission
- **Low-Latency Adaptive Playout**: Direct peer-to-peer WebRTC media tracks utilize optimized playout delay configurations to eliminate perceptible latency while maintaining smooth audio rendering across variable wireless connections.
- **Pre-Warmed Microphone Tracks**: Audio capture streams are initialized on channel entry so PTT keying occurs instantaneously (0ms un-gating latency) without waiting for device hardware wake-up.
- **Opus SDP Packet Optimization**: Custom SDP conditioning dynamically targets the active Opus payload (`opus/48000`) to enforce `useinbandfec=1`, `usedtx=1`, `minptime=10`, `ptime=20`, `maxaveragebitrate=32000`, `cbr=0`, and mono downmixing for voice clarity and low bandwidth consumption.

### 2. 🎙️ Studio-Grade DSP Audio Pipeline & Noise Suppression
- **80 Hz High-Pass Sub-Rumble Cut**: Active Biquad filter cuts handling noise, desk bumps, and wind rumble before transmission.
- **Dynamic Voice Leveling (`DynamicsCompressorNode`)**: Automatic gain compression keeps quiet whisperers intelligible and loud operators from clipping or distorting.
- **Opus In-Band Forward Error Correction (FEC)**: `useinbandfec=1` allows WebRTC to reconstruct dropped voice packets over lossy wireless or mobile network connections.
- **Tactical RF Bandpass Filter**: Switchable 300 Hz – 3.4 kHz speech equalizer simulating military VHF/UHF tactical radio acoustics.

### 3. 🧪 Acoustic Mic Loopback Diagnostic Tool
- **Built-in Self-Test**: Located inside the **Radio Configuration** modal, operators can record a 3-second voice sample with a live VU volume meter.
- **Instant Audio Playback**: Plays back recorded voice through the active radio DSP filter so users can verify mic clarity and volume before going live on channel.

### 4. 📶 Real-Time RF Telemetry & Signal Analysis (RSSI)
- **Live Link Telemetry**: Real-time stats engine tracks WebSocket keepalive round-trip time (RTT in ms), WebRTC audio packet loss percentage (%), and audio jitter (ms).
- **Tactical S-Meter & dBm Readings**: True situational awareness with S-Meter units (`S9+20`, `S9`, `S7`, `S5`, `S2`) and calculated signal strength in dBm.

### 5. 📳 Mobile Tactile Haptics
- **Tactile Feedback**: Distinct vibration impulses for PTT button press, floor lease grant, floor collision denial, and rotary channel dial steps.

---

## 🛡️ Privacy & Ephemeral Security

cqrTalk® separates voice communication into two distinct, privacy-preserving layers:

### 1. Ephemeral Control Plane (Zero-Knowledge Signaling)
- **Zero Audio Storage**: Voice data **never passes through or touches any server disk or database**. The server only brokers lightweight JSON signaling messages (SDP handshakes, ICE candidates, and deterministic floor requests).
- **Authoritative Half-Duplex Floor Arbitration**: Walkie-talkies succeed because only one person transmits at a time. The control plane acts as an authoritative referee: when Operator A presses PTT, the server grants the floor lease, locks out other operators with an instant `BUSY` signal, and enforces an automatic **25-second deadlock failsafe ceiling**.
- **Ephemeral Session Lifecycle**: Channels live entirely in transient memory with an automatic **12-hour TTL** and immediate cleanup upon host disconnection. No chat transcripts, no user registries, and no metadata logs.
- **Cryptographically Secure PINs & Rate Limiting**: Channel access is secured by numeric PINs generated via secure cryptographic entropy and protected by IP-level attempt rate limiting.

### 2. Direct Peer-to-Peer Media Plane (DTLS-SRTP Encrypted)
- **End-to-End Browser Encryption**: Voice is streamed directly peer-to-peer via **WebRTC** using standard **DTLS-SRTP encryption**. Eavesdropping or man-in-the-middle packet sniffing is mathematically impossible.
- **Opus High-Fidelity 48 kHz Codec**: Delivers crystal-clear voice clarity even in high-noise environments while consuming negligible mobile data (~24–32 kbps during active transmission).
- **True Half-Duplex Bandwidth Conservation**: The microphone is strictly captured while the PTT floor is keyed (`TX`). During standby or receive (`RX`), local audio capture is zeroed, preserving battery life and mobile data limits.
- **Hardware Acoustic Cancellation**: Enforces native browser hardware echo cancellation (`echoCancellation: true`), background noise suppression (`noiseSuppression: true`), and auto-gain leveling (`autoGainControl: true`).

---

## 📻 Feature & Function Matrix

### 🎛️ Physical Handset Ergonomics & Tactile Chassis
- **Rugged Handset Shell**: Precision-designed textured tactile chassis, rubberized antenna cap, knurled knobs, metallic brand plate, and side grips.
- **Bi-Color Jewel Status LED**: High-visibility military indicator jewel that lights **Solid Green** when connected/idle, glowing **Vibrant Red** during transmission (`TX`), and **Amber** when incoming audio is received (`RX`).
- **8-Channel Stepped Rotary Dial**: Tactile rotating channel knob with realistic click detents and frequency feedback (e.g. `462.5625 MHz // CH 01`).
- **Dual Transmit Modes**:
  - **Press-and-Hold**: Push down to speak, release to instantly drop the floor and trigger the Roger beep.
  - **Tap-to-Talk Toggle**: Single tap to engage transmission with a visual countdown timer ring; tap again to release.

### 🔊 Roger Beep & Acoustic Synthesizer
Synthesized in real-time client-side via the browser's native **Web Audio API** (zero MP3/WAV assets to download, zero latency):
- **4 Configurable Roger Beep Styles**:
  - **Classic Dual**: 1150 Hz & 1780 Hz staggered dual tones with smooth gain shaping (Digital Mobile Radio style).
  - **NASA Quindar**: 2475 Hz Apollo lunar telemetry end-of-transmission burst tone.
  - **Tactical MDC**: 1850 Hz to 1310 Hz downward frequency chirp (military dispatch).
  - **CB Radio**: 1520 Hz single carrier alert.
- **FM Squelch Tail Noise Burst**: Recreates authentic FM radio receiver cutoff hiss when an operator unkeys the mic.
- **Floor Granted Confirmation Chirp**: Subtle acoustic feedback confirming floor lease acquisition.
- **Interactive Audio Preview**: Live test button in settings to audition tones before transmission.

### 📊 Tactical LCD Digital Readout & Spectrum Analyzer
- **Real-Time 32-Band FFT Audio Visualizer**: Live green phosphor equalizer bars dynamically reacting to incoming and outgoing speech.
- **Time-Domain Oscilloscope**: Audio waveform scope visualizing speech modulation.
- **Digital Transmission Activity Tape ("Last Heard")**: Slide-out log recording past transmissions, callsigns, timestamps, and transmission durations.
- **LCD Status Indicators**: Transmit state (`TX` / `RX` / `BUSY`), active channel ID, room PIN, online operator count, and audio mute flags.

### 📱 Full PWA Standalone Experience
- **One-Tap Home Screen Installation**: Works as a standalone native app on iOS Safari, Android Chrome, macOS, Windows, and Linux.
- **Offline Shell Precaching**: Service Worker precaches the application shell for instant cold-starts even with poor connectivity.
- **Host Moderation Tools**: Channel creators can remove participants or securely terminate the entire channel on demand.

---

## ⚔️ Differentiation: cqrTalk® vs. Alternatives

| Feature / Capability | **cqrTalk®** | **Zello / Voxer** | **Discord / Teams / Zoom** | **UHF/VHF Hardware Radios** |
| :--- | :---: | :---: | :---: | :---: |
| **Installation** | **Zero (Instant URL / PWA)** | Heavy App Store install | Heavy client software | Physical hardware required |
| **Account / Sign-Up** | **None (Zero friction)** | Email / Phone / Password | Compulsory accounts | FCC / GMRS license (often required) |
| **Privacy & Audio Storage** | **Zero logs / No storage** | Audio stored on cloud servers | Transcripts & telemetry logged | Unencrypted public airwaves |
| **Media Encryption** | **DTLS-SRTP P2P End-to-End** | Proprietary cloud relay | Centralized cloud mixer | None (anyone with scanner can hear) |
| **Floor Arbitration** | **Deterministic Half-Duplex** | Software PTT | Full-duplex chaotic crosstalk | Collisions when two key mic simultaneously |
| **Playout Latency** | **Sub-50ms (Zero-Buffer)** | 200–500ms buffered | 100–300ms | Real-time analog |
| **Time to First Word** | **< 3 seconds** | 5 – 10 minutes | 5 – 10 minutes | Requires channel programming |
| **Device Compatibility** | **Any browser / Any OS** | iOS / Android only | Desktop / Mobile apps | Specific radio frequency bands |
| **Per-Unit Cost** | **$0.00 (Free & Open)** | Monthly SaaS / Ad-supported | Free tier / Paid enterprise | $50 – $500+ per physical unit |
| **Acoustic Realism** | **Roger Beeps, Squelch, RF Filter** | Basic beep | None (standard VOIP) | Native analog RF sound |

---

## 🎯 Primary Use Cases

- **🎪 Live Events, Festivals & Stage Crews**: Coordinate sound, lighting, security, and stage hands across large venues instantly without distributing physical radios or asking volunteers to install apps.
- **🏗️ Construction Sites & Logistics Facilities**: Instant floor-controlled voice coordination on existing mobile devices with clear visual channel and speaker indicators.
- **🚗 Family Road Trips & Theme Parks**: Keep group members connected in busy crowds or multi-car convoys with a simple 4-digit PIN.
- **🚨 Emergency Response & Pop-up Teams**: Deploy an encrypted, zero-trace incident communications channel within seconds during urgent outages or drills.
- **🎬 Film & Video Production**: Run quiet, half-duplex, non-interrupted comms between director, camera operators, and grips.

---

## 🚀 Quick Start & Deployment

### Try the Live Cloud Deployment
The app is live and hosted on Vercel:  
👉 **[https://cqrt.vercel.app/](https://cqrt.vercel.app/)**

### Run Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/cqrtalk.git
   cd cqrtalk
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:3000`.

4. **Production Build**:
   ```bash
   npm run build
   npm run start   # serves dist/ + API on http://localhost:3000
   ```

5. **Protocol smoke test** (run against a live server):
   ```bash
   PORT=3199 OFFLINE_NOTIFY_DELAY_MS=800 npx tsx server.ts &
   node scripts/smoke.mjs http://localhost:3199
   ```

### Server Configuration (Environment Variables)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP/WebSocket listen port |
| `TRUST_PROXY` | `false` | Set `true` behind Vercel/Cloud Run/Fly/nginx so rate limits key on real client IPs |
| `TURN_URL` | *(empty)* | Comma-separated `turn:` URLs — **required for reliable calls across symmetric NATs / strict firewalls** |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | *(empty)* | TURN credentials (prefer short-lived) |
| `OFFLINE_NOTIFY_DELAY_MS` | `4000` | Grace period before peers are shown offline after a disconnect |
| `NODE_ENV` | — | `production` selects static serving; the production bundle bakes it in |

### Deploy to a Long-Running Host (Cloud Run / Fly.io / Render / VM)
The repository is optimized for deployment:
- **Client SPA**: Builds to `dist/` with Vite and Tailwind CSS.
- **Full-Stack Bundle**: Compiles `server.ts` into a self-contained `dist/server.cjs` with `esbuild`.
- **WebSocket Requirement**: Floor arbitration and signaling require a *long-running* process. Deploy to a host that supports persistent WebSockets (Cloud Run, Fly.io, Render web services, Railway, or any VM), set `TRUST_PROXY=true`, and configure a TURN server for production-grade NAT traversal.

---

## 📋 Security & Permissions Notice

- **Microphone Access**: WebRTC voice transmission requires standard browser microphone permission (`navigator.mediaDevices.getUserMedia`).
- **No Background Surveillance**: Unlike native apps with continuous background location tracking, cqrTalk® only transmits audio when the browser tab is open and the PTT button is intentionally keyed.

---

## 👨‍💻 Author & Credits

Designed and engineered with passion for tactical hardware aesthetics and high-performance WebRTC architecture.

- **Author**: ©munabbiRMushran
- **Live Deployment**: [https://cqrt.vercel.app/](https://cqrt.vercel.app/)
- **License**: MIT
