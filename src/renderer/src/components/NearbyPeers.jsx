// "Nearby" list — merges mDNS (network) and BLE (bluetooth) discovery. Network
// peers are tappable to start a handshake; BLE-only peers have no network route,
// so they're shown as a proximity signal with a hint to use QR.

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8 15.5a5 5 0 0 1 8 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" />
    </svg>
  )
}

function BluetoothIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M7 7l10 10-5 4V3l5 4L7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SourceIcons({ sources }) {
  return (
    <span className="peer__sources">
      {sources.includes('network') && (
        <span className="peer__source" title="Found on network">
          <WifiIcon />
        </span>
      )}
      {sources.includes('bluetooth') && (
        <span className="peer__source peer__source--bt" title="Found via Bluetooth">
          <BluetoothIcon />
        </span>
      )}
    </span>
  )
}

function PeerBody({ peer }) {
  return (
    <>
      <span className="nearby__dot" aria-hidden="true" />
      <span className="peer__main">
        <span className="nearby__name">{peer.name}</span>
        <span className="peer__meta">
          {peer.proximity && (
            <span className={`peer__prox peer__prox--${peer.proximity.band}`}>
              {peer.proximity.label}
            </span>
          )}
          {!peer.connectable && <span className="peer__hint">Bluetooth only — share via QR</span>}
        </span>
      </span>
      <SourceIcons sources={peer.sources} />
    </>
  )
}

export default function NearbyPeers({ peers, noPeersHint, onSelect, busyDeviceId }) {
  return (
    <section className="nearby">
      <h2 className="nearby__title">Nearby</h2>

      {peers.length > 0 ? (
        <ul className="nearby__list">
          {peers.map((peer) => (
            <li key={peer.deviceId}>
              {peer.connectable ? (
                <button
                  type="button"
                  className="nearby__item"
                  onClick={() => onSelect(peer)}
                  disabled={Boolean(busyDeviceId)}
                >
                  <PeerBody peer={peer} />
                  {busyDeviceId === peer.deviceId && <span className="peer__connecting">Connecting…</span>}
                </button>
              ) : (
                <div className="nearby__item nearby__item--static">
                  <PeerBody peer={peer} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : noPeersHint ? (
        <p className="nearby__hint">
          No nearby devices found on this network — try QR sharing instead.
        </p>
      ) : (
        <p className="nearby__searching">
          <span className="nearby__spinner" aria-hidden="true" />
          Searching for nearby devices…
        </p>
      )}
    </section>
  )
}
