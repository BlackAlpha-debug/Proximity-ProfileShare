import ConnectionCeremony from './ConnectionCeremony.jsx'

// QR-scan confirmation: the scanned card is shown via the shared bubble ceremony
// and is NOT saved until the user accepts. onAccept persists the contact; the
// success state is then held before onDone returns home.
export default function ContactConfirm({ contact, ownDeviceId, onAccept, onDecline, onDone }) {
  return (
    <ConnectionCeremony
      ownDeviceId={ownDeviceId}
      peerDeviceId={contact.deviceId}
      peerName={contact.fullName}
      showActions
      onAccept={onAccept}
      onDecline={onDecline}
      onDone={onDone}
    />
  )
}
