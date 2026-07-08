import ConnectionCeremony from './ConnectionCeremony.jsx'

// Drives the handshake UI from the state machine in App:
//   incoming — someone wants to share (ceremony with Accept / Decline)
//   outgoing — we tapped a peer, waiting (ceremony, code visible, Cancel)
//   success  — handshake completed (ceremony resolves to a checkmark)
//   result   — declined / cancelled (simple card)
export default function HandshakeOverlay({
  state,
  ownDeviceId,
  onAccept,
  onDecline,
  onCancel,
  onDismiss
}) {
  if (!state) return null
  const name = state.peer?.name || 'Someone'

  if (state.kind === 'result') {
    return (
      <div className="overlay" role="dialog" aria-modal="true">
        <div className="overlay__card">
          <h2 className="overlay__title">{state.title}</h2>
          {state.body && <p className="overlay__body">{state.body}</p>}
          <div className="form__actions overlay__actions">
            <button type="button" className="btn btn--primary" onClick={onDismiss}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ConnectionCeremony
      key={state.peer.deviceId}
      ownDeviceId={ownDeviceId}
      peerDeviceId={state.peer.deviceId}
      peerName={name}
      showActions={state.kind === 'incoming'}
      waitingLabel={state.kind === 'outgoing' ? `Waiting for ${name} to accept…` : null}
      succeeded={state.kind === 'success'}
      onAccept={onAccept}
      onDecline={onDecline}
      onCancel={onCancel}
      onDone={onDismiss}
    />
  )
}
