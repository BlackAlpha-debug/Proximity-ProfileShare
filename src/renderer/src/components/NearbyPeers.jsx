// "Nearby on this network" list — the bonus mDNS discovery path. Clicking a peer
// starts a handshake (share-request) with them.
export default function NearbyPeers({ peers, noPeersHint, onSelect, busyDeviceId }) {
  return (
    <section className="nearby">
      <h2 className="nearby__title">Nearby on this network</h2>

      {peers.length > 0 ? (
        <ul className="nearby__list">
          {peers.map((peer) => (
            <li key={peer.deviceId}>
              <button
                type="button"
                className="nearby__item"
                onClick={() => onSelect(peer)}
                disabled={Boolean(busyDeviceId)}
              >
                <span className="nearby__dot" aria-hidden="true" />
                <span className="nearby__name">{peer.name}</span>
                <span className="nearby__addr">
                  {busyDeviceId === peer.deviceId
                    ? 'Connecting…'
                    : peer.ip
                      ? `${peer.ip}:${peer.port}`
                      : `port ${peer.port}`}
                </span>
              </button>
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
