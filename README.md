# cqrTalk — Real-Time Push-To-Talk Walkie-Talkie PWA

cqrTalk is a production-quality Progressive Web App (PWA) walkie-talkie application designed with the tactile look, feel, and acoustics of a rugged modern touchscreen radio. It features real-time, low-latency half-duplex voice communication with server-authoritative floor control, PIN pairing, participant presence, and mobile offline shell capabilities.

---

## 1. Architectural Overview

The application is architected with a strict separation between the **Control Plane** and the **Media Plane**:

### Control Plane
- **Signaling & Session Coordination**: Powered by Node.js, Express, and WebSocket (`/ws`).
- **Session Lifecycle & TTL**: Sessions are temporary, supporting One-to-One and Group channels (up to 15 concurrent participants) with automatic 12-hour TTL and inactivity garbage collection.
- **PIN/Invite System**: Generates short 4-digit temporary pairing PINs indexed server-side with IP-based rate-limiting to prevent brute-force pairing attempts.
- **Authoritative Floor Control (PTT)**: The server acts as the single source of truth for channel floor leases. When multiple operators attempt transmission concurrently, the server deterministically grants the floor to one participant and immediately broadcasts a `BUSY` status to all other participants. Floors feature an automatic 25-second lease timeout to prevent channel deadlocks, with automatic cleanup upon disconnection.
- **Presence & Host Management**: Manages online/reconnecting states, host transfer if the host disconnects, and host moderation actions (removing participants, ending session).

### Media Plane
- **Voice Transmission**: Real-time voice communication over WebRTC (`RTCPeerConnection`) with automatic SDP offer/answer negotiation and ICE candidate exchange through the signaling server.
- **Half-Duplex Media Optimization**: In radio walkie-talkie operation, microphone tracks are enabled strictly when the floor is granted (`TX`). When idle or receiving (`RX`), local tracks are silenced, preventing background acoustic feedback and drastically minimizing mobile bandwidth.
- **Audio Pre-Processing**: Browser audio constraints enforce hardware echo cancellation (`echoCancellation: true`), acoustic noise suppression (`noiseSuppression: true`), and automatic gain control (`autoGainControl: true`).
- **Independent Speaker Mute**: Allows operators to mute incoming channel audio locally without dropping presence or releasing their floor transmission capabilities.

---

## 2. Radio Acoustic Synthesizer (Web Audio API)

cqrTalk includes custom-synthesized radio sound effects generated entirely client-side via the browser's native `AudioContext`, eliminating network latency or missing asset failures:
- **PTT Start Chirp**: High-frequency tactical squelch chirp when initiating transmission.
- **Roger Beep**: Classic dual-tone walkie-talkie pulse (1150Hz + 1780Hz) upon releasing the floor.
- **Channel Busy Alert**: Rapid double low-frequency alert (420Hz) when the channel is occupied.
- **Frequency Lock Chimes**: Ascending and descending chimes for channel connection and disconnection.
- **Tactile Toggle Switch**: Accessible Uiverse-inspired hardware toggle for sound effect preferences.

---

## 3. PWA Capabilities

- **Web App Manifest**: Configured with standalone display, theme color (`#12161f`), and maskable/standard icons (`192x192`, `512x512`, `apple-touch-icon`).
- **Service Worker**: Precaches the offline application shell (`/`, `/index.html`, `/manifest.json`, icons) with stale-while-revalidate strategy.
- **Offline Shell**: UI and stored preferences remain accessible offline; displays clear status that live radio transmission requires Internet connectivity.

---

## 4. Environment & Deployment

- **Port**: Bound to port `3000` on `0.0.0.0`.
- **Development**: Run `npm run dev` (`tsx server.ts`).
- **Production Build**: Run `npm run build` (Vite client build + esbuild bundling `server.ts` into `dist/server.cjs`).
- **Production Start**: Run `npm run start` (`node dist/server.cjs`).

---

## 5. Browser & Device Considerations

- **Microphone Permissions**: WebRTC requires microphone permission. If denied, cqrTalk provides clear diagnostic guidance.
- **Background Audio**: Browsers restrict background microphone capture when mobile tabs are backgrounded or devices locked; cqrTalk detects interruptions and automatically re-syncs state upon foreground return.

---

**cqrTalk** — made with ♥ by ©munabbiRMushran
