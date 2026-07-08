# Proximity Profile Share

A cross-platform (Windows / macOS / Linux) Electron desktop app that lets two
people swap a digital profile (name, phone, email, GitHub, LinkedIn, portfolio)
through an animated "bubble" handshake — inspired by iPhone NameDrop, built
without UWB hardware.

## Tech stack

- **Electron + React** — desktop shell and UI
- **electron-vite** — build tool (fast dev HMR, bundles main/preload/renderer)
- **electron-builder** — packaging, code signing, auto-update
- Plain **CSS** for styling (no Tailwind)

- **electron-store** — local profile / deviceId / contacts persistence (JSON in userData)
- **qrcode** + **jsqr** — QR generation / decoding (primary, zero-network sharing path)
- **bonjour-service** — mDNS/DNS-SD advertise + browse (bonus local-network discovery)

Planned for later phases (not installed yet): `@abandonware/noble` (BLE proximity
via RSSI), Node `tls` (encrypted local socket).

## Project layout

```
src/
  main/      Electron main process (window lifecycle, native/OS integration)
    index.js          window + app lifecycle
    store.js          shared electron-store instance
    profileStore.js   IPC handlers (profile, deviceId, photo, contacts)
    permissions.js    OS-permission IPC (settings deep links, LAN priming, flag)
    discovery.js      mDNS advertise + browse, peer list, peers-updated event
    discoveryPeers.js pure Service→peer parsing helpers (electron-free, testable)
    handshake.js      electron wiring for the TCP handshake (owns the listen socket)
    handshakeEngine.js protocol engine + tie-break (electron-free, testable)
  preload/   contextBridge-only bridges between main and renderer (no Node in UI)
  renderer/  React UI
    index.html          renderer entry HTML (with CSP)
    src/
      main.jsx          React root
      App.jsx           view router: loading → form / permissions / saved / share / scan / confirm
      components/       ProfileForm, SavedProfile, ShareView, ScanView, ContactConfirm,
                        ConnectionCeremony, PermissionsIntro, NearbyPeers, HandshakeOverlay
      lib/validation.js email / URL validators
      lib/qrPayload.js  encode/decode the QR profile payload (incl. deviceId)
      lib/verificationCode.js deterministic two-word code from a deviceId pair
      assets/index.css  global styles
electron.vite.config.js build config (main / preload / renderer)
```

## Preload API (`window.api`)

Exposed via contextBridge in `src/preload/index.js`; backed by `ipcMain.handle`
handlers in `src/main/profileStore.js`:

- `getDeviceId()` → stable per-install UUID (created on first run).
- `getProfile()` → the saved profile object, or `null` if none.
- `saveProfile(profile)` → persists under key `myProfile`; returns the saved object.
- `selectPhoto()` → opens a native picker; returns `{ path, dataUrl }` or `null`.
- `readPhoto(path)` → preview data URL for a stored photo path (or `null`).
- `getContacts()` → array of saved contacts (key `contacts`).
- `saveContact(contact)` → appends a scanned contact (with `id` + `addedAt`).
- `getPermissionsShown()` / `markPermissionsShown()` → the one-time explainer flag.
- `openSettings('camera' | 'localnetwork')` → deep-links to the OS settings page.
- `primeLocalNetwork()` → proactively triggers the macOS local-network prompt.
- `startDiscovery()` / `stopDiscovery()` → begin/end mDNS advertise + browse.
- `getPeers()` → `{ peers, noPeersHint }` snapshot of the current peer list.
- `onPeersUpdated(cb)` → subscribe to live `peers-updated` events; returns unsubscribe.
- `requestShare(peer)` / `acceptShare(id)` / `declineShare(id)` / `cancelShare(id)` → handshake control.
- `onHandshakeEvent(cb)` → subscribe to live `handshake-event`s; returns unsubscribe.
- `platform` → `process.platform` string, for OS-specific UI hints.

Profile photos are stored as a **local file path** (`photoPath`); previews are
returned as `data:` URLs because the renderer CSP blocks `file://`.

### QR pairing (zero-network)

The profile is encoded **directly into the QR code** — no socket or discovery.
`lib/qrPayload.js` produces `{"t":"proximity-share","v":1,"deviceId":…, ...fields}`
(~250 bytes, well within the QR budget). The **photo is never included**: even a
20 KB photo yields ~27 KB of JSON, far past QR's ~2953-byte ceiling (verified — it
fails to encode at all). `fullName, phone, email, github, linkedin, portfolio` plus
`deviceId` (so the scanner can derive the verification code) are carried; `fullName`
is required for a decode to be accepted, and foreign/malformed codes decode to `null`.

Scanning uses `getUserMedia` + `jsQR` in the renderer. Camera permission is granted
at the Electron layer via `setPermissionRequestHandler` (media only) in the main
process; the OS still governs actual access, and denial (`NotAllowedError`) shows
platform-specific enable-in-settings instructions plus an **Open camera settings**
button (`openSettings('camera')`). A scan is **never auto-saved** — it routes to a
`ContactConfirm` screen (built on `BubbleAnimation`) first.

### OS permission handling (`permissions.js` + `PermissionsIntro`)

Three OS prompts are explained up front, gated by the persisted
`onboardingPermissionsShown` flag so each is shown only once:

1. **Camera** (macOS/Windows) — prompted on first scan; denial is handled in
   `ScanView` with instructions + a deep link to the OS camera settings.
2. **Local network** (macOS 10.15+) — right after onboarding, a `PermissionsIntro`
   step explains it, then `primeLocalNetwork()` sends a single mDNS-multicast packet
   (`dgram` → `224.0.0.251:5353`) to **proactively provoke** the system prompt. No-op
   off macOS.
3. **Windows Firewall** — a `PermissionsIntro` step warns that the first TCP listen
   will raise an "Allow app through firewall" prompt, shown before discovery starts.

`PermissionsIntro` builds a platform-specific step sequence (macOS → local network;
Windows → firewall; Linux → nothing) shown after the first profile save. The flag is
set via `markPermissionsShown()` when the flow finishes.

### Local-network discovery (`discovery.js`) — bonus path

Started from the renderer when it reaches the home view (profile set + permissions
done); the main process is idempotent so re-entry won't restart it. On start it:

- reserves a real OS-assigned port via a `net.Server` on port 0 (this listen is also
  what raises the Windows Firewall prompt; it's the placeholder for the future
  encrypted exchange),
- advertises `_proximityshare._tcp` on that port with a TXT record of
  `{ displayName, deviceId }`,
- browses for the same service type, filtering out its own `deviceId`, keeping an
  in-memory `Map` of peers `{ deviceId, name, ip, port }`, and pushing the list to the
  renderer via the `peers-updated` event.

If no peers appear within 5s, `noPeersHint` flips true and the UI shows the subtle
"No nearby devices found on this network — try QR sharing instead" message
(`NearbyPeers`). Parsing lives in `discoveryPeers.js` (electron-free, unit-tested);
TXT keys are read case-insensitively. The bonjour advertisement is torn down on
`will-quit`; the underlying TCP socket is the handshake server (below).

### Handshake protocol (`handshakeEngine.js` + `handshake.js`)

Tapping a nearby peer opens a TCP connection to its advertised ip:port and sends
newline-delimited JSON: `share-request → share-accept | share-decline | share-cancel`.
The listening socket is shared with discovery (its port is what gets advertised).

- **Receiver** (non-simultaneous): gets `incoming-request`; the UI shows
  "*Name* wants to share profiles with you — Accept / Decline" (`HandshakeOverlay`).
  Accept → `share-accept`; Decline or **20s** no-answer → `share-decline` + the
  initiator is notified.
- **Initiator**: `outgoing-pending` → `completed` (accepted) / `declined` /
  `cancelled` (25s safety timeout or unreachable).
- **Tie-break** (both tapped each other simultaneously): on receiving a request from
  a peer we already have an *outgoing* request to, compare deviceIds as strings — the
  **lexicographically smaller** id is the sole initiator; the larger-id side drops its
  own outgoing and treats the incoming request as an implicit accept. Result: exactly
  one `completed` per side, no duplicate/conflicting flows.

The protocol lives in the electron-free `handshakeEngine` (dependency-injects
`ownId`/`ownName`/`emit`) so it can be tested with two engines over real sockets;
`handshake.js` wires it to electron. Note: the exchange is **plaintext TCP** for now —
the encrypted (TLS) profile payload exchange is a later phase; this phase only
negotiates consent.

### Connection ceremony (`ConnectionCeremony` + `lib/verificationCode.js`)

A single full-screen component, shared by the QR-scan confirmation (`ContactConfirm`)
and the handshake (`HandshakeOverlay`). Two gradient bubbles rise from the bottom and
merge in the centre (CSS keyframes only, ~850ms), revealing a **verification code**
inside the merged bubble. The code is a deterministic, **symmetric** two-word phrase
derived from both deviceIds (`verificationCode(a,b)` sorts the pair, FNV-1a hashes it,
maps to two of 64 words) so both devices show the *same* code — users confirm they
match before accepting, catching a spoofed/unintended peer on a shared network.
Accept/Decline appear once the merge lands; accepting resolves the bubbles into a
checkmark with "Profiles shared with *name*". Total motion stays under ~1.5s; honors
`prefers-reduced-motion`. This replaced the old `BubbleAnimation` placeholder.

## Commands

- `npm run dev` — dev with hot reload
- `npm run build` — production build into `out/`
- `npm run preview` — run the built app
- `npm run package` — build + electron-builder into `release/`

## Conventions & security model

- **Context isolation is on and the renderer sandbox is enabled.** The renderer
  has no direct Node or Electron access. Anything the UI needs must be exposed
  explicitly through `contextBridge` in `src/preload/index.js`.
- Because `sandbox: true`, the **preload must be CommonJS**. With `"type": "module"`
  in package.json, the preload is built to `out/preload/index.cjs` (see the
  `format: 'cjs'` / `entryFileNames` override in `electron.vite.config.js`), and
  the main process loads that `.cjs` path.
- The main process is ESM (`import.meta.url`, `import`); it derives `__dirname`
  from `import.meta.url`.
- External links are opened in the system browser via `setWindowOpenHandler`,
  never inside an app window.
- The renderer `index.html` ships a locked-down CSP (`default-src 'self'`).

## Build roadmap

The app is being built in phases. Current status:

- **Phase 1 — App shell (DONE):** working Electron window rendering a blank React
  app with the placeholder heading "Proximity Profile Share". No networking,
  discovery, or camera code yet.
- **Phase 2 — Onboarding / profile setup (DONE):** first-launch form (name required;
  phone/email/GitHub/LinkedIn/portfolio/photo optional) with email + URL validation,
  saved via the preload API to electron-store, plus a "Profile saved" screen with an
  "Edit profile" button that reopens the pre-filled form. deviceId generated on first run.
- **Phase 3 — QR pairing (DONE):** "Share my profile" renders a QR of the profile
  (photo omitted, zero network); "Scan a code" opens the camera and decodes with jsQR,
  handling permission denial with OS-specific guidance; a successful scan shows a
  confirmation screen (with the bubble animation) before the contact is saved.
- **Phase 3.5 — OS permission handling (DONE):** one-time, platform-specific
  explainers after onboarding (macOS local network — proactively triggered; Windows
  Firewall), gated by `onboardingPermissionsShown`; camera denial shows an
  Open-settings deep link. See "OS permission handling" above.
- **Phase 4 — Local-network discovery (DONE):** advertises `_proximityshare._tcp`
  with a `{ displayName, deviceId }` TXT record on a reserved port and browses for
  peers, showing a "Nearby on this network" list (with a 5s no-peers hint). Bonus
  path alongside QR. See "Local-network discovery" above.
- **Phase 5 — Handshake protocol (DONE):** tap a nearby peer to send a `share-request`
  over TCP; receiver gets an Accept/Decline prompt (20s window); simultaneous taps are
  resolved by a deviceId tie-break so exactly one initiator proceeds. See "Handshake
  protocol" above.
- **Phase 5.5 — Connection ceremony (DONE):** shared full-screen bubble-merge
  animation with a deterministic two-word verification code shown on both devices,
  used by both the QR-confirm and handshake flows; Accept/Decline after the merge,
  resolving to a checkmark on success. See "Connection ceremony" above.
- Later phases (planned):
  BLE proximity ranging (upgrade); encrypted (TLS) profile-payload exchange;
  contacts list; code signing + auto-update.

When adding a sharing method or native capability, keep all Node/OS access in the
main process and expose the minimum surface to the renderer through the preload.
