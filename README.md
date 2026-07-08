<p align="center">
  <h1 align="center">Proximity Profile Share</h1>
  <p align="center">
    <strong>Bubble-Handshake Contact Exchange</strong>
  </p>
  <p align="center">
    A cross-platform desktop app that lets two people swap a digital profile — name, phone, email, GitHub, LinkedIn, portfolio — through an animated "bubble" handshake, inspired by iPhone NameDrop and built without any UWB hardware.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-orange?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/pairing-QR%20%7C%20mDNS%20%7C%20BLE-blueviolet?style=flat-square" alt="Pairing methods">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/status-in%20development-yellow?style=flat-square" alt="Status">
</p>

---

## The Problem

Swapping contact info in person is still surprisingly clunky:

- Reading a phone number aloud while someone fumbles to type it in
- Handing over a business card that gets lost in a jacket pocket
- Screenshotting a LinkedIn QR code you have to hunt for in a different app
- Apple's NameDrop *does* solve this beautifully — but it's iPhone-only and needs UWB hardware

**Proximity Profile Share solves this on any laptop.** Two people open the app, and within a couple of seconds — a scan, a tap, or just being in the same room — their profiles are exchanged over an encrypted channel, with a human-readable verification code so neither side is ever guessing who they just connected to.

---

## Core Features

- **QR Pairing (primary path)** — the profile is encoded directly into the QR code itself (no network, no server); the receiving device scans it with the camera and confirms before saving
- **Local-Network Discovery (bonus)** — advertises over mDNS/DNS-SD (`_proximityshare._tcp`) so devices on the same Wi-Fi show up in a live "Nearby" list automatically
- **BLE Proximity (optional upgrade)** — RSSI-banded Bluetooth scanning (*Very close / Nearby / In range*) surfaces people who are physically next to you, not just on the same network; silently no-ops if the native BLE modules aren't available
- **TLS-Encrypted Handshake** — every network exchange runs over a per-device self-signed TLS socket; a deterministic, symmetric two-word verification code (derived from both device IDs) is shown on both screens so users can catch a spoofed or unintended peer before accepting
- **Simultaneous-Tap Tie-Breaking** — if both people tap each other at the same moment, a deviceId comparison picks exactly one initiator, so the handshake resolves cleanly instead of double-firing
- **Contacts Book** — received profiles are deduped by device ID (re-sharing updates in place, never duplicates), searchable, with one-tap actions for call / email / GitHub / LinkedIn
- **Platform-Aware Permission Onboarding** — one-time explainers for camera access, macOS Local Network prompts (proactively triggered), and the Windows Firewall prompt, so the OS dialogs never appear as a surprise

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Electron App                            │
│  ┌───────────────┐                                              │
│  │ Onboarding /  │                                              │
│  │ Profile setup │                                              │
│  └───────┬───────┘                                              │
│          │                                                       │
│  ┌───────▼────────────────────────────────────────────────────┐ │
│  │                  Sharing methods (pick one)                 │ │
│  │  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐│ │
│  │  │ QR pairing     │  │ mDNS discovery │  │ BLE proximity   ││ │
│  │  │ PRIMARY        │  │ bonus: trusted │  │ upgrade: real   ││ │
│  │  │ works anywhere │  │ home/office    │  │ closeness       ││ │
│  │  │ no network     │  │ Wi-Fi only     │  │ ranging         ││ │
│  │  └───────┬───────┘  └────────┬───────┘  └────────┬────────┘│ │
│  └──────────┼───────────────────┼───────────────────┼─────────┘ │
│             │                   │                   │            │
│             └─────────┬─────────┴─────────┬─────────┘            │
│                        ▼                   ▼                     │
│              ┌─────────────────┐  ┌──────────────────┐          │
│              │ Identity check  │  │  Bubble animation  │          │
│              │ (matching code) │  │  + accept/decline  │          │
│              └────────┬────────┘  └─────────┬─────────┘          │
│                        └──────────┬──────────┘                    │
│                              ┌────▼─────┐                         │
│                              │ Encrypted │                         │
│                              │ exchange  │                         │
│                              └────┬─────┘                         │
│                              ┌────▼──────────┐                    │
│                              │ Contacts list  │                    │
│                              └───────────────┘                    │
└───────────────────────────────────────────────────────────────┘
```

Everything OS-facing (Node, native modules, the filesystem, sockets) lives in the **main process**; the **renderer** is sandboxed with context isolation on and talks to it only through the explicit `contextBridge` surface in `src/preload/index.js` — the UI has no direct Node or Electron access.

| Layer | Technology | Why |
|-------|-----------|-----|
| **Desktop shell / UI** | Electron + React | Native window + OS integration with a familiar component model |
| **Build tool** | electron-vite | Fast HMR in dev, bundles main/preload/renderer in one config |
| **Packaging** | electron-builder | NSIS + Microsoft Store (`.appx`) on Windows, `.dmg` on macOS, `.AppImage` on Linux |
| **Auto-update** | electron-updater | Checks GitHub Releases on launch for packaged builds |
| **Local persistence** | electron-store | Profile, device ID, TLS credentials, and contacts as JSON in `userData` |
| **QR pairing** | qrcode + jsQR | Zero-network profile exchange via camera scan/decode |
| **LAN discovery** | bonjour-service | mDNS/DNS-SD advertise + browse for `_proximityshare._tcp` |
| **Encrypted transport** | Node `tls` + selfsigned | Per-device self-signed cert; encrypts the channel (identity comes from the verification code, not the cert) |
| **BLE proximity** | @abandonware/noble / bleno *(optional)* | RSSI-based "is this person actually nearby" signal; defensively loaded, falls back silently |
| **Styling** | Plain CSS | No framework — keyframe-driven bubble animations, `prefers-reduced-motion` aware |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/BlackAlpha-debug/Proximity-ProfileShare.git
cd Proximity-ProfileShare

# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev
```

| Command | What it does |
|---------|---------------|
| `npm run dev` | Dev server with hot reload (electron-vite) |
| `npm run build` | Production build into `out/` |
| `npm run preview` | Run the built app without packaging |
| `npm run package` | Build + electron-builder into `release/` (installer for the current OS) |

No account, no server, no API keys — the app works fully offline via QR pairing; mDNS/BLE just add convenience on top when a network or Bluetooth adapter is available.

---

## Preload API (`window.api`)

The renderer never touches Node or Electron directly — everything it can do goes through this explicit bridge, backed by `ipcMain.handle` in the main process:

| Method | Description |
|--------|-------------|
| `getDeviceId()` | Stable per-install UUID, created on first run |
| `getProfile()` / `saveProfile(profile)` | Read/persist the local profile |
| `selectPhoto()` / `readPhoto(path)` | Native photo picker + preview data URL |
| `getContacts()` / `saveContact(c)` / `deleteContact(id)` | Received-contacts CRUD, upserted by device ID |
| `openExternal(url)` | Opens `tel:` / `mailto:` / `http(s):` in the system handler |
| `getPermissionsShown()` / `markPermissionsShown()` | One-time OS-permission explainer flag |
| `openSettings(target)` / `primeLocalNetwork()` | OS settings deep links + macOS local-network priming |
| `startDiscovery()` / `stopDiscovery()` / `getPeers()` / `onPeersUpdated(cb)` | mDNS + BLE peer discovery |
| `requestShare(peer)` / `acceptShare(id)` / `declineShare(id)` / `cancelShare(id)` | Handshake protocol control |
| `onHandshakeEvent(cb)` | Live handshake state stream (`incoming-request`, `completed`, `declined`, `error`, …) |
| `platform` | `process.platform`, for OS-specific UI copy |

---

## Protocol in Action

### Verification code (identity check, not just encryption)

```js
// Both devices compute the *same* code independently — order doesn't matter.
verificationCode(deviceIdA, deviceIdB)
// => "amber-falcon"   (sorts the pair, FNV-1a hashes it, maps to 2 of 64 words)
```

TLS on the handshake socket encrypts the channel; it does **not** prove who's on the other end (self-signed, `rejectUnauthorized: false`). The verification code is what a human actually checks before hitting Accept.

### Simultaneous-tap tie-break

```js
// Both devices tapped each other at the same moment.
// Compare deviceIds as strings — smaller one wins.
if (incomingRequest.from < myOutgoingRequest.to) {
  // we're the larger id: drop our own outgoing request,
  // treat the incoming one as an implicit accept
} else {
  // we're the smaller id: we stay the sole initiator
}
// Result: exactly one `completed` event per side — never a duplicate or stuck flow.
```

### QR payload (zero-network path)

```json
{
  "t": "proximity-share",
  "v": 1,
  "deviceId": "a1b2c3d4e5f6",
  "fullName": "Jordan Rivera",
  "phone": "+1 555 0100",
  "github": "jordanrivera"
}
```

The photo is deliberately **never** included — a 20 KB photo alone yields ~27 KB of JSON, well past a QR code's ~2953-byte ceiling. `fullName` is required for a decode to be accepted; malformed or foreign QR codes decode to `null` rather than throwing.

---

## Building & Distribution

Packaging is configured in [`electron-builder.yml`](electron-builder.yml):

```bash
npm run package -- --win nsis appx   # Windows: NSIS installer + Microsoft Store package
npm run package -- --mac dmg          # macOS: .dmg (must run on macOS)
npm run package -- --linux AppImage   # Linux: .AppImage
```

`.dmg`/`.appx` packaging tools are OS-native, so cross-building macOS or Store targets from another OS isn't reliable — [`.github/workflows/build.yml`](.github/workflows/build.yml) builds all three natively (Windows/macOS/Linux runners) and publishes them to GitHub Releases whenever a `vX.Y.Z` tag is pushed.

### Code signing — required before public distribution

Unsigned builds are fine for local testing, but:

- **Windows** — SmartScreen shows "Unknown Publisher" and may block the installer outright until the certificate builds reputation. Get an Authenticode certificate from [DigiCert](https://www.digicert.com/signing/code-signing-certificates), [SSL.com](https://www.ssl.com/certificates/code-signing/), [Sectigo](https://www.sectigo.com/ssl-certificates-tls/code-signing), or [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/overview).
- **macOS** — Gatekeeper refuses to open the app at all ("app is damaged and can't be opened") — a hard block, not a warning. Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership, a Developer ID Application certificate, and notarization.

Both are wired up as commented placeholders in `electron-builder.yml` (`win.certificateFile`/`certificatePassword`, `mac.identity` + notarization env vars) — fill them in, or set `CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` as environment variables (or GitHub Actions secrets) so nothing sensitive gets committed.

### Installing a signed release

- **Windows** — run the `.exe`; the NSIS installer lets you pick the install directory and creates Desktop/Start Menu shortcuts. Or install via the Microsoft Store listing once published.
- **macOS** — open the `.dmg` and drag **Proximity Profile Share** into `/Applications`.
- **Linux** — `chmod +x Proximity*.AppImage` and run it directly, no install step.

Packaged builds check GitHub Releases for updates on launch via `electron-updater` (`app.isPackaged` gated, so dev runs never trigger it).

---

## Testing

There's currently no automated test suite — the electron-free modules (`handshakeEngine.js`, `discoveryPeers.js`, `bleData.js`, `peerRegistry.js`, `contactsData.js`, `profilePayload.js`) were specifically split out from their Electron-wired counterparts to make that straightforward to add. Verification today is manual: `npm run dev` plus exercising QR scan, mDNS discovery, and the handshake flow between two running instances. A unit test suite is tracked in the roadmap below.

---

## Project Structure

```
src/
  main/      Electron main process (window lifecycle, native/OS integration)
    index.js          window + app lifecycle, electron-updater wiring
    store.js           shared electron-store instance
    profileStore.js    IPC handlers (profile, deviceId, photo, contacts)
    contactsData.js     pure upsert/remove helpers for receivedContacts (testable)
    permissions.js      OS-permission IPC (settings deep links, LAN priming, openExternal)
    discovery.js        mDNS advertise + browse; feeds the shared peer registry
    discoveryPeers.js   pure Service→peer parsing helpers (electron-free, testable)
    peerRegistry.js      merges network (mDNS) + bluetooth (BLE) peers; peers-updated
    ble.js               optional BLE scan/advertise (defensive load, RSSI filter)
    bleData.js           pure BLE payload encode/decode + RSSI banding (testable)
    handshake.js          electron wiring for the TLS handshake (owns the listen socket)
    handshakeEngine.js    protocol engine + tie-break + profile exchange (electron-free, testable)
    certs.js              per-device self-signed TLS credentials (stored in electron-store)
    profilePayload.js     pure validator for received profile payloads (electron-free)
  preload/   contextBridge-only bridges between main and renderer (no Node in UI)
  renderer/  React UI
    src/
      App.jsx            view router: loading → form / permissions / saved / contacts / share / scan / confirm
      components/         ProfileForm, SavedProfile, ShareView, ScanView, ContactConfirm,
                          ConnectionCeremony, PermissionsIntro, NearbyPeers, HandshakeOverlay,
                          AppNav, ContactsView
      lib/                validation.js, qrPayload.js, verificationCode.js

electron-builder.yml       packaging + code-signing + publish config
electron.vite.config.js    build config (main / preload / renderer)
.github/workflows/build.yml  tag-triggered multi-OS build + release
```

---

## Roadmap

- [x] App shell, onboarding, and profile persistence
- [x] QR pairing (zero-network)
- [x] Platform-aware OS permission onboarding
- [x] mDNS local-network discovery
- [x] TLS handshake protocol with simultaneous-tap tie-breaking
- [x] Bubble-merge connection ceremony with a shared verification code
- [x] Encrypted profile exchange over the handshake socket
- [x] Contacts book (dedup, search, quick actions)
- [x] Optional BLE proximity (RSSI-banded, silent fallback)
- [x] electron-builder packaging (NSIS, Microsoft Store, `.dmg`, `.AppImage`) + electron-updater scaffolding
- [ ] Real Authenticode / Apple Developer ID certificates and a first signed public release
- [ ] Automated unit test suite for the electron-free modules
- [ ] Linux `.deb`/`.rpm` targets alongside `.AppImage`
- [ ] Localization / i18n

---

## License

MIT

---

<p align="center">
  Built with Electron, React, and a two-word verification code that never lies about who's on the other end.
</p>
