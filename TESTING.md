# Testing — Proximity Profile Share

Two kinds of tests live here:

- **Automated unit tests** (`npm test`, vitest) covering the pure, electron-free
  logic — profile-payload validation, the handshake tie-break comparator, and the
  verification-code derivation. These run in CI and need no devices.
- **Manual test checklist** (below) for the parts that need two real machines,
  live networks, cameras, Bluetooth radios, and OS permission prompts.

---

## Automated unit tests

```bash
npm test          # single run (vitest run)
npm run test:watch
```

Covered today (`test/`):

| Area | File under test | Test file |
| --- | --- | --- |
| Profile-payload validation (wire) | `src/main/profilePayload.js` | `test/profilePayload.test.js` |
| Tie-break comparator | `src/main/tieBreak.js` | `test/tieBreak.test.js` |
| Verification-code derivation | `src/renderer/src/lib/verificationCode.js` | `test/verificationCode.test.js` |

The tie-break logic was extracted from `handshakeEngine.js` into the pure
`src/main/tieBreak.js` module (`isInitiator` / `tieBreakInitiator`) so it can be
asserted in isolation; the engine imports it, so the extraction is behavior-preserving.

---

## Manual test checklist

Legend: ☐ = to run, note **Pass / Fail** and the build (`git rev-parse --short HEAD`)
and OS of each device. Do a fresh `npm run build && npm run preview` (or an installed
package) on **two devices**; distinct profiles on each (e.g. *Device A = "Ada"*,
*Device B = "Grace"*).

### 1. QR pairing across completely different networks (zero shared network)

**Goal:** confirm QR is a true offline path — no discovery, no socket, no shared LAN.

Setup: Device A on home/office **Wi-Fi**; Device B on a **cellular hotspot** (its own,
*not* joined to A's Wi-Fi). Airplane-mode-then-cellular-only on B is a good way to
guarantee no shared network. Ideal: put A on Wi-Fi with **no internet** at all to prove
nothing is phoning home.

- ☐ On A: **Share my profile** → a QR renders.
- ☐ On B: **Scan a code** → point camera at A's screen.
- ☐ B decodes and shows the **ContactConfirm** ceremony (bubble merge + verification code).
- ☐ Verification code shown on B matches what A shows for the same pair (see §5).
- ☐ Accept on B → Ada is saved into B's **Contacts**.
- ☐ Reverse roles (B shares, A scans) → Grace saved on A.
- ☐ Confirm the **photo is absent** on the received card (QR omits the photo by design).
- ☐ Confirm it worked with **zero shared network** — neither device joined the other's LAN,
  and (if A had no internet) no connectivity was required at all.

Expected: pairing completes purely from the QR bytes; contacts saved on both sides.

### 2. mDNS discovery on a trusted home/office network (both appear ≤10 s)

Setup: both devices on the **same trusted Wi-Fi/LAN** (client isolation OFF).

- ☐ Launch both, complete onboarding + permission steps so each reaches the home view.
- ☐ Within **10 seconds**, A appears in B's **Nearby on this network** list and B appears
  in A's — each showing the other's display name with a Wi-Fi icon.
- ☐ Neither device lists **itself** (own deviceId is filtered out).
- ☐ Tap a peer → handshake **Accept/Decline** prompt appears on the other side (see §4/§5).
- ☐ Complete one handshake → profile exchanged and saved on both sides.
- ☐ First run only: note the **Windows Firewall** "Allow app" prompt appears on the first
  TCP listen (see §6) — allow it, then discovery proceeds.

Expected: mutual discovery well under 10 s; the "no nearby devices" hint never appears.

### 3. mDNS with client isolation ON — graceful degrade, no hang

**Goal:** on a network that blocks peer-to-peer traffic, the app must fall back to the
hint, not spin forever.

Simulate isolation with any one of:
- a **guest Wi-Fi** SSID that has "client/AP isolation" enabled, or
- the router setting **"AP isolation" / "client isolation" = ON**, or
- put the two devices on **different SSIDs of the same router** that don't route between them.

- ☐ Both devices reach the home view on the isolated network.
- ☐ mDNS advertise/browse starts without throwing (check no error toast, app stays responsive).
- ☐ After **~5 seconds** with no peer found, each device shows the subtle hint:
  **"No nearby devices found on this network — try QR sharing instead."**
- ☐ The UI does **not hang, freeze, or spinner-forever**; the rest of the app (Share/Scan/
  Contacts) stays fully usable.
- ☐ QR sharing (§1) still works on the same isolated network as the offered fallback.

Expected: clean degrade to the hint + working QR fallback; no hang, no crash.

### 4. Simultaneous share-request from both sides (tie-break)

**Goal:** both people tap each other at nearly the same instant → exactly **one** clean
handshake, not two conflicting flows.

Setup: same LAN as §2, both peers visible to each other. Coordinate a "3…2…1…tap".

- ☐ On the count, tap the other peer on **both** devices as simultaneously as possible.
  (Retry a few times — the race window is short; you want both outgoing requests in flight.)
- ☐ Result: **one** device ends as *initiator*, the other as *accepter* (implicit accept
  via tie-break) — never two Accept prompts left dangling, never two separate ceremonies.
- ☐ Exactly **one** `completed` outcome per side; both end up with the other's contact saved
  **once** (no duplicate contact entries).
- ☐ The winner is stable/deterministic: the device with the **lexicographically smaller
  deviceId** is the sole initiator (matches the unit test in `test/tieBreak.test.js`).
- ☐ No stuck "waiting…" overlay on either side after it resolves.

Expected: one initiator, one accepter, one exchange, one saved contact each.

### 5. Verification-code mismatch → declining prevents exchange

**Goal:** a user who notices the two codes **don't match** and declines must **not** have
their profile exchanged.

The real codes always match (they're derived symmetrically from both deviceIds), so force
a visible mismatch to rehearse the human check. Pick one:
- **Preferred (no code change):** start a handshake between A and B, but read A's code while
  comparing it against the code shown for a *different* pairing (e.g. a third device C, or a
  screenshot from an earlier A↔C session). The two strings visibly differ.
- **Or temporarily** tweak `verificationCode()` on one build to append a marker (e.g.
  `+ ' X'`) so the two screens differ — revert after the test.

- ☐ During the ceremony, confirm both codes are shown clearly on each device before Accept.
- ☐ Simulate a mismatch as above; the tester **Declines** on the mismatched side.
- ☐ On decline: **no `profile-payload` is exchanged** — the declining user's card does **not**
  appear in the other device's Contacts, and vice-versa.
- ☐ The initiator sees a **declined** outcome (not "completed"), no toast claiming success.
- ☐ Re-run with **matching** codes and Accept → exchange completes normally (control case).
- ☐ Revert any temporary code change; `npm test` still green.

Expected: mismatch + Decline = zero profile data crosses; only a matching-code Accept exchanges.

### 6. Permission-denial paths show clear guidance (no silent failure)

Run each on the OS(es) you support. The point is **actionable guidance**, never a dead UI.

**6a. Camera denied**
- ☐ Deny camera at the OS prompt on first **Scan** (or pre-deny in OS privacy settings).
- ☐ ScanView shows a **`NotAllowedError`** state with platform-specific enable-in-settings
  text **and** an **"Open camera settings"** button.
- ☐ The button deep-links to the OS camera settings page (`openSettings('camera')`).
- ☐ Grant camera in settings, return, retry Scan → camera now works.

**6b. Local network denied (macOS 10.15+)**
- ☐ After onboarding, the **PermissionsIntro** local-network step appears and
  `primeLocalNetwork()` provokes the macOS **"allow local network"** prompt.
- ☐ Deny it → discovery finds no peers; the app shows the "no nearby devices" hint (§3)
  rather than hanging, and QR (§1) still works.
- ☐ Guidance points the user to re-enable Local Network in System Settings → Privacy.

**6c. Windows Firewall**
- ☐ On first discovery start (first TCP listen), Windows shows **"Allow app through firewall"**.
- ☐ The PermissionsIntro firewall step warned about this beforehand.
- ☐ **Block** it once → confirm the app still runs, QR works, and discovery degrades to the
  hint instead of crashing. Then allow it and confirm discovery works.

**6d. Linux** — no camera/LAN prompts expected; confirm PermissionsIntro shows nothing extra
and the app proceeds straight to the home view.

Expected: every denial yields visible, specific guidance (and a deep link where applicable);
nothing fails silently or hangs.

### 7. Delete a contact — gone after app restart

**Goal:** deletion is persisted to `receivedContacts`, not just an in-memory removal.

- ☐ Ensure at least one saved contact (from §1 or §2).
- ☐ Contacts tab → delete a card → inline **Yes/No** confirm → **Yes**.
- ☐ Card disappears immediately and the nav **count badge** decrements.
- ☐ **Fully quit** the app (not just close the window) and relaunch.
- ☐ After restart, the deleted contact is **still gone**; other contacts remain intact.
- ☐ (Optional) Inspect the userData `config.json` / electron-store file and confirm the
  deleted entry is absent under `receivedContacts`.

Expected: deletion survives restart; storage reflects the removal.

### 8. BLE proximity — RSSI filtering excludes another room

Only if BLE built successfully (the optional `@abandonware/noble`/`bleno` modules). If BLE
is unavailable, confirm the app **silently falls back** to mDNS + QR with no error — that is
itself a pass for this environment.

- ☐ Both devices have Bluetooth **on** and BLE loaded (a peer shows a **Bluetooth icon** /
  proximity band in the Nearby list).
- ☐ **Same room, close together (<1–2 m):** peer shows a strong band — **"Very close"** or
  **"Nearby"**.
- ☐ **Move one device to another room** (a wall between them, ~8–10 m):
  - the peer's band drops (e.g. **"In range"**) or the peer **disappears** entirely once RSSI
    falls below the `-70 dBm` threshold.
  - it should **not** persistently report **"Very close"** from another room.
- ☐ Bring it back → the peer reappears / band recovers within a few seconds.
- ☐ Leave a device out of range for **>8 s** → it is **pruned** from the list (stale BLE peer).
- ☐ Confirm no exact distance is ever shown — only the **Very close / Nearby / In range** bands.
- ☐ A **BLE-only** peer (no network route) shows the **"Bluetooth only — share via QR"** hint
  and is not tappable for a handshake.

Expected: RSSI banding reasonably reflects physical proximity; an adjacent-room device is
excluded or clearly weaker, never labeled "Very close."

---

## Recording results

For each run, capture: date, app build (`git rev-parse --short HEAD`), each device's OS +
version, network setup, and Pass/Fail per checkbox with a note on any deviation. File
failures as issues referencing the section number above.
