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

Traditional walkie-talkie apps force teams into heavy friction: downloading 100MB native apps, creating proprietary accounts, handing over phone numbers, and trusting centralized cloud servers with their live voice streams. Physical two-way UHF/VHF radios require expensive hardware ($100–$500/unit), FCC licensing, and battery chargers, yet remain completely unencrypted and susceptible to public eavesdropping.

**cqrTalk® eliminates every barrier.**

Built as a high-performance Progressive Web App (PWA) on modern WebRTC and Web Audio DSP standards, cqrTalk® provides instant, deterministic half-duplex voice communication directly through your browser. Just share a **4-digit PIN** or tap an invite link, and your team is immediately connected on the same tactical frequency.

---

## 🏛️ Comprehensive Architecture & Engineering

cqrTalk® is engineered around a strict **dual-plane design** separating the signaling control plane from the media transport plane, ensuring zero audio storage, deterministic floor control, and ultra-low-latency real-time voice delivery:

```
+---------------------------------------------------------------------------------------+
|                                  cqrTalk® ARCHITECTURE                                |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|   [ Operator Alpha ]                                             [ Operator Bravo ]   |
|   (Mobile Safari / Chrome PWA)                                   (Chrome / Firefox)   |
|         |                                                                |            |
|         |-------- 1. Authoritative Floor Lease Request (WS / MQTT) ------>|           |
|         |         "Request Floor (PTT down) -> Status: BUSY"             |            |
|         |         Enforces 25s failsafe ceiling & collision arbitration  |            |
|         |                                                                |            |
|         |======== 2. Direct E2E Audio Media Mesh (WebRTC Opus) ==========>|           |
|         |         - Encrypted via DTLS-SRTP (Peer-to-Peer)               |            |
|         |         - Zero-Playout Buffer Target (0ms playoutDelayHint)    |            |
|         |         - Opus 48kHz: In-band FEC=1, CBR=1, ptime=20ms         |            |
|         |         - Continuous TX (usedtx=0) prevents onset clipping     |            |
|         |                                                                |            |
|         |-------- 3. Local + Remote 'Roger' Beep & Squelch Cutoff ------>|            |
|         |         "PTT unkeyed -> Floor IDLE / Ready for response"       |            |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

### 1. Dual-Plane Signaling Architecture

```
                  +----------------------------------------------------+
                  |               Client Signal Dispatcher             |
                  +----------------------------------------------------+
                                      |
                     +----------------+----------------+
                     | (Primary)                       | (Fallback)
                     v                                 v
          +-----------------------+        +-----------------------+
          |  Native WebSocket     |        | Serverless MQTT Mesh  |
          |  (/ws on Node server) |        | (HiveMQ / EMQX WSS)   |
          +-----------------------+        +-----------------------+
                     |                                 |
                     +----------------+----------------+
                                      v
                  +------------------------------------+
                  |    Authoritative Floor Arbiter     |
                  |    - First-Come Floor Leasing      |
                  |    - 25s Automatic Timeout Guard   |
                  |    - Presence & Host Failover      |
                  +------------------------------------+
```

- **Primary Native WebSocket Transport**: In standard container and node environments (Cloud Run, Fly.io, Docker), connections route over persistent secure WebSockets (`wss://host/ws`) with lightweight JSON packets, socket-level message throttling (300 msgs/sec burst ceiling), and automatic ping/pong keepalives every 15 seconds.
- **Automatic Serverless MQTT Fallback**: When deployed to serverless or static environments (such as Vercel preview environments) where persistent backend WebSockets are not hosted, cqrTalk® automatically falls back to an encrypted public MQTT over WSS mesh (`broker.hivemq.com` / `broker.emqx.io`) using channel-isolated topics (`cqrtalk/v1/session/{sessionId}`).
- **Autonomous Host Election**: In serverless mode, the channel host acts as the local floor arbiter. If the host disconnects, remaining peers automatically elect the next lexicographical operator as host with zero session downtime.
- **Authoritative Half-Duplex Floor Arbitration**: Walkie-talkie communication requires deterministic, single-speaker clarity. The floor arbiter enforces a strict first-come, first-served lease. When an operator keys the mic, other operators receive an instant `BUSY` signal and locked PTT states. An automatic **25-second deadlock failsafe ceiling** ensures the channel is never held hostage if a device suddenly drops connection.

### 2. High-Performance WebRTC Voice Pipeline

- **W3C Perfect Negotiation State Machine**: Implements strict polite vs. impolite peer roles (`localParticipantId < remoteParticipantId`) with local description rollback support, completely preventing offer collision "glare" when multiple operators join or reconnect simultaneously.
- **Opus Codec SDP Conditioning**:
  - `useinbandfec=1`: Enables Opus in-band Forward Error Correction. Dropped packets across lossy mobile or Wi-Fi networks are reconstructed mathematically from adjacent frames with zero latency penalty.
  - `usedtx=0`: Disables discontinuous transmission gating during active key-up. Guarantees that the very first syllable and consonant of every transmission are transmitted immediately without voice-activity detection (VAD) warm-up clipping.
  - `cbr=1` (Constant Bit Rate): Maintains uniform packet intervals at 32 kbps mono, stabilizing receiver jitter buffers and eliminating buffer spikes.
  - `ptime=20` & `minptime=10`: Enforces 20ms audio frames, the gold standard for real-time tactical two-way radio communications.
  - `maxaveragebitrate=32000`: Crisp 48 kHz wideband studio speech reproduction while remaining lightweight on cellular data caps (~4 KB/s active transmit).
- **Zero-Latency Playout Delay Target**: Configures `playoutDelayHint = 0` and `jitterBufferTarget = 0` directly on the WebRTC `RTCRtpReceiver` to eliminate browser playout buffering delays.
- **Multi-Provider Redundant STUN / TURN Architecture**:
  - Geographically distributed STUN providers (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`, `stun:stun2.l.google.com:19302`, `stun:stun.cloudflare.com:3478`, `stun:stun.freeswitch.org:3478`).
  - Production-ready TURN relay support via `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` environment variables for guaranteed connectivity across symmetric enterprise NATs and mobile carrier firewalls.
- **Cellular / Wi-Fi Network Handoff Recovery**:
  - Monitors `oniceconnectionstatechange` and `onconnectionstatechange` to automatically trigger non-disruptive ICE restarts when a mobile device switches between Wi-Fi and 4G/5G.
  - Automatic peer re-discovery and handshake resumption when operators regain signal.

### 3. Studio-Grade Web Audio DSP Chain

```
[ Microphone Capture ]
  │  (Hardware Echo Cancellation, Noise Suppression, Auto-Gain, 48kHz, Latency: Ideal 0)
  ▼
[ 80 Hz High-Pass Sub-Rumble Filter ]
  │  (Cuts wind noise, handling rumble, and desk vibrations)
  ▼
[ Dynamic Voice Leveling / Compressor ]
  │  (Keeps quiet whisperers intelligible and prevents loud clipping)
  ▼
[ Switchable Tactical RF Bandpass Filter (300Hz - 3.4kHz) ]
  │  (Optional military VHF/UHF Land Mobile Radio equalization)
  ▼
[ 32-Band FFT Spectrum Analyser & VU Meter ]
  │  (Powers live green phosphor LCD equalizer and modulation scope)
  ▼
[ WebRTC RTP Streamer (TX) ] / [ Speaker Audio Output (RX) ]
```

- **Minimal Hardware Capture Buffer**: Directs `getUserMedia` with `{ latency: { ideal: 0 } }` to request the smallest hardware capture buffer from OS audio engines (CoreAudio, WASAPI, ALSA).
- **Pre-Warmed Microphone Tracks**: Capture tracks are initialized on channel entry and pre-warmed in a muted state (`track.enabled = false`). Pressing PTT instantly enables transmission with 0ms hardware initialization delay.
- **Client-Side Real-Time Synthesizer**: Roger beeps, squelch cutoff bursts, and floor grant confirmations are synthesized procedurally via Web Audio API oscillators and gain envelopes with zero external audio assets to load.

---

## 📻 Features & Functions

### 🎛️ Physical Handset Ergonomics & Tactical Chassis
- **Rugged Tactile Chassis**: Textured polymer and metallic case styling, knurled knobs, antenna cap, branding badge, and side grips.
- **Bi-Color Jewel Status LED**: High-visibility military indicator jewel:
  - 🟢 **Solid Green**: Connected & Standby (Channel IDLE)
  - 🔴 **Vibrant Red**: Actively Transmitting (`TX`)
  - 🟡 **Amber**: Incoming Audio Received (`RX`)
  - ⚪ **Dim Gray**: Disconnected or Offline
- **8-Channel Stepped Rotary Dial**: Tactile rotating channel knob with realistic click detents and frequency feedback (e.g., `462.5625 MHz // CH 01`).
- **Tactical Transmit Modes**:
  - **Press-and-Hold PTT**: Push down (or hold `Spacebar`) to speak, release to instantly unkey and transmit the Roger beep.
  - **PTT Lock (Hands-Free Continuous Talk)**: Dedicated tactile switch and keyboard shortcut (`L` key) to lock transmission active continuously without needing to hold down the button. Includes a glowing red locked beacon, padlock status icon, and 1-tap unlock safety.
- **Hardware Volume Knurled Knob**: Real-time master gain control, instant mute toggle, and speaker mute/unmute.

### 🔊 Roger Beep & Acoustic Synthesizer
- **4 Configurable Roger Beep Presets**:
  - **Classic Dual**: 1150 Hz & 1780 Hz staggered dual tones with smooth gain shaping (Digital Mobile Radio / DMR style).
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
- **Real-Time RF Telemetry & Signal Analysis (RSSI)**: Live link metrics tracking round-trip time (RTT in ms), packet loss (%), jitter (ms), and S-meter units (`S9+20`, `S9`, `S7`, `S5`, `S2`).

### 🧪 Acoustic Mic Loopback Diagnostic Tool
- **Built-in Self-Test**: Located inside the **Radio Configuration** modal, operators can record a 3-second voice sample with a live VU volume meter.
- **Instant Audio Playback**: Plays back recorded voice through the active radio DSP filter so users can verify mic clarity, volume, and RF equalization before going live on channel.
- **Synthetic Microphone Fallback**: If physical microphone permissions are denied or unavailable, cqrTalk® generates a synthetic modulated carrier tone so operators can still verify floor arbitration, signaling, and channel connectivity.

### 🛡️ Privacy & Ephemeral Security
- **Zero Audio Storage**: Voice data **never passes through or touches any server disk or database**. The server only brokers lightweight JSON signaling messages.
- **DTLS-SRTP End-to-End Encryption**: Peer-to-peer WebRTC media streams are encrypted natively at the transport layer.
- **Ephemeral Session Lifecycle**: Channels live entirely in transient memory with an automatic **12-hour TTL** and immediate cleanup upon host disconnection. No chat transcripts, no user registries, and no metadata logs.
- **Cryptographically Secure PINs & Rate Limiting**: Channel access is secured by numeric PINs generated via secure cryptographic entropy and protected by IP-level attempt rate limiting.

### 📱 Full PWA Standalone Experience
- **One-Tap Home Screen Installation**: Works as a standalone native app on iOS Safari, Android Chrome, macOS, Windows, and Linux.
- **Offline Shell Precaching**: Service Worker precaches the application shell for instant cold-starts even with poor connectivity.
- **Host Moderation Tools**: Channel creators can remove participants or securely terminate the entire channel on demand.

---

## 📖 Step-by-Step Use Instructions

### 1. Creating a Channel

1. Open **cqrTalk®** at `https://cqrt.vercel.app/` (or your local/hosted deployment).
2. Click **Create Channel**.
3. Choose channel type:
   - **1-to-1 Private**: A direct peer-to-peer link for two operators.
   - **Tactical Group**: A multi-operator channel for dispatch and team communication.
4. Enter your **Callsign / Operator Name** (e.g., `Leader-1`, `Dispatch`, `Echo-7`).
5. Tap **Initialize Frequency**. You will receive an instant **4-digit PIN** (e.g., `8421`) and a direct link.
6. Tap the **Copy Link** button or share the 4-digit PIN with your team.

### 2. Joining an Existing Channel

1. On the home screen, click **Join Channel**.
2. Enter the **4-digit PIN** provided by the host (or open the shared invite link).
3. Enter your **Callsign / Operator Name**.
4. Tap **Connect Frequency**. Your radio will immediately synchronize with the channel.

### 3. Transmitting & Receiving (Push-To-Talk)

- **Standard PTT (Hold-to-Talk)**:
  - **Touch / Mouse**: Press and hold the large center **PTT button**. The LED illuminates solid red (`TX`). Speak clearly into your microphone. Release the button when finished speaking. A Roger beep will sound locally and across all receiving radios.
  - **Keyboard**: Press and hold the **Spacebar**. Release to stop transmitting.
- **Hands-Free PTT Lock**:
  - Press the **Lock switch** next to the PTT button (or press the **`L`** key).
  - The radio enters continuous transmission mode (`TX LOCKED`), indicated by a pulsing red ring and padlock icon.
  - Tap the button again (or press `L` or `Spacebar`) to unlock and release the floor.
- **Receiving Audio (`RX`)**:
  - When another operator transmits, your LED turns **Amber**, the LCD indicates `RX // [Callsign]`, and the live spectrum visualizer animates incoming speech.
  - The PTT button indicates `CHANNEL BUSY` and prevents simultaneous key-ups until the speaker releases the floor.

### 4. Audio Diagnostics & Radio Configuration

1. Tap the **Config (Gear) icon** on the radio faceplate.
2. **Roger Beep**: Select your preferred tone style (`Classic Dual`, `NASA Quindar`, `Tactical MDC`, `CB Radio`) and click **Test Beep** to preview.
3. **FM Squelch Tail**: Toggle the authentic analog hiss cutoff on or off.
4. **Tactical RF Filter**: Toggle the 300 Hz – 3.4 kHz military bandpass speech filter for tactical realism.
5. **Mic Check (Loopback Test)**:
   - Click **Record 3s Test**.
   - Speak into your microphone while observing the live VU meter.
   - Click **Play Recording** to hear your transmission exactly as other operators will hear it.

### 5. Managing Participants (Host Only)

- Tap the **Operators badge** on the top status bar to slide open the **Participant Sheet**.
- View online/offline status, join timestamps, and active talker indicators.
- Hosts can remove individual operators or click **End Session** to securely terminate the channel frequency for all peers.

### 6. Keyboard Shortcuts Reference

| Key | Action | Function |
| :---: | :--- | :--- |
| **`Space`** *(Hold)* | **Push-To-Talk (PTT)** | Key up microphone; release to unkey and send Roger beep |
| **`L`** | **Toggle PTT Lock** | Toggle hands-free continuous transmission mode |
| **`M`** | **Toggle Mute** | Mute or unmute speaker audio output |
| **`R`** | **Rotate Roger Beep** | Cycle through the 4 Roger beep sound presets |
| **`1` – `8`** | **Channel Selection** | Instantly switch rotary knob to channel 1 through 8 |
| **`Esc`** | **Close Modals** | Dismiss any open modal or slide-out sheet |

---

## 🎯 Primary Use Cases & Operational Scenarios

- **🎪 Live Events, Festivals & Stage Crews**: Coordinate sound, lighting, security, and stage hands across large venues instantly without distributing physical radios or asking volunteers to install apps.
- **🏗️ Construction Sites & Logistics Facilities**: Instant floor-controlled voice coordination on existing mobile devices with clear visual channel and speaker indicators.
- **🚗 Family Road Trips & Theme Parks**: Keep group members connected in busy crowds or multi-car convoys with a simple 4-digit PIN.
- **🚨 Emergency Response & Pop-up Teams**: Deploy an encrypted, zero-trace incident communications channel within seconds during urgent outages or drills.
- **🎬 Film & Video Production**: Run quiet, half-duplex, non-interrupted comms between director, camera operators, and grips.
- **🏕️ Outdoor Caravans & Multi-Vehicle Expeditions**: Zero-fuss convoy voice communication across smartphones with hands-free PTT lock support.
- **💻 Remote Operations & Engineering Standups**: Instant tactical "huddle" walkie-talkie for incident response teams resolving live production outages.

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

5. **Protocol Smoke Test** (runs comprehensive signaling and floor arbitration validation):
   ```bash
   PORT=3199 OFFLINE_NOTIFY_DELAY_MS=800 npx tsx server.ts &
   node scripts/smoke.mjs http://localhost:3199
   ```

### Server Configuration (Environment Variables)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP/WebSocket listen port |
| `TRUST_PROXY` | `false` | Set `true` behind Vercel, Cloud Run, Fly.io, or nginx so rate limits key on real client IPs |
| `TURN_URL` | *(empty)* | Comma-separated `turn:` URLs — **recommended for symmetric cellular NATs & enterprise firewalls** |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | *(empty)* | TURN authentication credentials |
| `OFFLINE_NOTIFY_DELAY_MS` | `4000` | Grace period before peers are marked offline after transient disconnect |
| `NODE_ENV` | `development` | Set to `production` for static asset serving and optimized caching |

### Deploy to Long-Running Hosts (Cloud Run / Fly.io / Render / Docker)

The repository is built for standalone production containers:
- **Client SPA**: Builds static assets to `dist/` with Vite and Tailwind CSS.
- **Full-Stack Bundle**: Compiles `server.ts` into a self-contained `dist/server.cjs` with `esbuild`.
- **WebSocket Ingress**: Deploy to any container platform supporting persistent WebSockets (Cloud Run, Fly.io, Render, Railway, or VPS), set `TRUST_PROXY=true`, and specify `PORT=3000`.

---

## 📋 Security & Permissions Notice

- **Microphone Access**: WebRTC voice transmission requires standard browser microphone permission (`navigator.mediaDevices.getUserMedia`).
- **No Background Surveillance**: Unlike native apps with continuous background tracking, cqrTalk® only captures and transmits audio when the browser tab is active and the PTT button is intentionally keyed.
- **Ephemeral State**: All channel rooms, PINs, and participant records are stored strictly in volatile server RAM and automatically expire.

---

## 👨‍💻 Author & Credits

Designed and engineered with passion for tactical hardware aesthetics and high-performance WebRTC architecture.

- **Author**: ©munabbiRMushran
- **Live Deployment**: [https://cqrt.vercel.app/](https://cqrt.vercel.app/)
- **License**: MIT

