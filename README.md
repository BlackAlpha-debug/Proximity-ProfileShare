# Proximity Profile Share

A cross-platform (Windows / macOS / Linux) desktop app that lets two people
swap a digital profile — name, phone, email, GitHub, LinkedIn, portfolio —
through an animated "bubble" handshake, inspired by iPhone NameDrop but
built without UWB hardware.

Two ways to share, both encrypted, neither requiring an account or a
server:

- **QR code** — the profile is encoded directly into a QR code and scanned
  with the camera. Works with zero network connectivity.
- **Local network / Bluetooth** — the app advertises itself on the LAN
  (mDNS) and, optionally, over Bluetooth LE proximity (RSSI), so two
  people in the same room can see each other in a "Nearby" list, tap to
  request a share, confirm a verification code, and exchange profiles over
  a TLS-encrypted socket.

No profile data ever touches a server the app authors control — everything
is peer-to-peer, either via the QR image itself or a direct local
connection between the two devices.

## Building locally

```bash
npm install
npm run dev       # hot-reload dev build
npm run build      # production build into out/
npm run package     # build installers into release/ for the current OS
```

`npm run package` runs [electron-builder](https://www.electron.build/) using
the config in [`electron-builder.yml`](electron-builder.yml). By default it
builds only the target(s) for the OS you're running it on. To build a
specific target:

```bash
npm run package -- --win nsis appx   # Windows: NSIS installer + Store package
npm run package -- --mac dmg          # macOS: .dmg (must run on macOS)
npm run package -- --linux AppImage   # Linux: .AppImage
```

Windows NSIS and AppImage can cross-build from other platforms in some
setups, but `.dmg`/`.appx` packaging tools are OS-native — macOS targets
need to be built on macOS, and `.appx` needs Windows (or the Windows
Store submission pipeline itself).

Unsigned builds work fine for local testing — see below for what changes
once you're ready to distribute publicly.

## Code signing

**A code-signing certificate is required before distributing this app
publicly.** Without one:

- **Windows**: SmartScreen shows an "Unknown Publisher" warning, and may
  block the installer outright on first downloads until the certificate
  builds reputation.
- **macOS**: Gatekeeper refuses to open the app at all — "app is damaged
  and can't be opened" — this is a hard block, not just a warning.

Unsigned builds are fine for local testing/sideloading among people who
know to bypass these warnings; they are not fine for a general download
link.

### Windows (Authenticode)

Buy an OV or EV code-signing certificate from a CA, e.g.:

- [DigiCert](https://www.digicert.com/signing/code-signing-certificates)
- [SSL.com](https://www.ssl.com/certificates/code-signing/)
- [Sectigo](https://www.sectigo.com/ssl-certificates-tls/code-signing)
- [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/overview) (cloud-based, no physical HSM/USB token needed)

Then set the `CSC_LINK` (path or base64 of the `.pfx`) and
`CSC_KEY_PASSWORD` environment variables at build time — electron-builder
picks these up automatically. See the comments in
[`electron-builder.yml`](electron-builder.yml) under `win:` for details.
Do not commit the `.pfx` file to the repo.

### Microsoft Store (`.appx`)

Reserve the app in the
[Microsoft Partner Center](https://partner.microsoft.com/dashboard) and
replace the placeholder `identityName` / `publisher` /
`publisherDisplayName` values under `appx:` in
[`electron-builder.yml`](electron-builder.yml) with the ones it assigns
you. The Store itself re-signs the package on submission, so a separate
Authenticode certificate isn't required for this path.

### macOS (Developer ID + notarization)

Enroll in the
[Apple Developer Program](https://developer.apple.com/programs/) and
create a **Developer ID Application** certificate (Xcode → Settings →
Accounts, or developer.apple.com → Certificates). Then:

1. Set `CSC_LINK` (base64 of the `.p12`) and `CSC_KEY_PASSWORD` env vars,
   same mechanism as Windows.
2. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (generate one at
   [appleid.apple.com](https://appleid.apple.com/)), and `APPLE_TEAM_ID`
   env vars — electron-builder notarizes the app automatically via
   `notarytool` once these are present.

See the comments under `mac:` in
[`electron-builder.yml`](electron-builder.yml).

## Auto-updates

Packaged builds check GitHub Releases for updates on launch
(`electron-updater`, wired in `src/main/index.js`), reading the `publish`
block in [`electron-builder.yml`](electron-builder.yml). Pushing a tag like
`v0.2.0` triggers [`.github/workflows/build.yml`](.github/workflows/build.yml),
which builds all three targets and publishes them to a GitHub Release —
`--publish always` bakes the matching `app-update.yml`/`latest*.yml` feed
files into each installer automatically. This only matters once builds are
signed; unsigned updates will hit the same SmartScreen/Gatekeeper blocks
described above.

## Installing a signed release

Once a release has been signed (see above):

- **Windows**: download the `.exe` from the release page and run it — the
  NSIS installer lets you choose the install directory and creates
  Desktop/Start Menu shortcuts. Or install the `.appx`/`.msix` via the
  Microsoft Store listing once published there.
- **macOS**: download the `.dmg`, open it, and drag
  **Proximity Profile Share** into `/Applications`.
- **Linux**: download the `.AppImage`, make it executable
  (`chmod +x Proximity*.AppImage`), and run it directly — no installation
  step required.

## Project structure, protocol details, and architecture

See [`CLAUDE.md`](CLAUDE.md) for the full breakdown of the codebase layout,
the preload IPC surface, the QR/mDNS/BLE discovery paths, the TLS
handshake protocol, and the build roadmap.
