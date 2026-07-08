import { useEffect, useMemo, useState } from 'react'
import { verificationCode } from '../lib/verificationCode.js'

// Full-screen bubble-merge ceremony shared by the QR-scan confirmation and the
// mDNS handshake. Two gradient bubbles rise from the bottom and merge in the
// centre (CSS keyframes only); the merged bubble shows a verification code
// derived from both deviceIds. Accept/Decline appear once the merge completes
// (~800ms); accepting resolves the bubbles into a checkmark.
const MERGE_MS = 850
const SUCCESS_HOLD_MS = 1300

export default function ConnectionCeremony({
  ownDeviceId,
  peerDeviceId,
  peerName = 'this person',
  showActions = false,
  waitingLabel = null,
  succeeded = false,
  onAccept,
  onDecline,
  onCancel,
  onDone
}) {
  const code = useMemo(
    () => verificationCode(ownDeviceId, peerDeviceId),
    [ownDeviceId, peerDeviceId]
  )
  const [merged, setMerged] = useState(false)
  const [localSuccess, setLocalSuccess] = useState(false)
  const isSuccess = succeeded || localSuccess

  // Reveal the action buttons only after the merge animation lands.
  useEffect(() => {
    const id = setTimeout(() => setMerged(true), MERGE_MS)
    return () => clearTimeout(id)
  }, [])

  // Hold the success state briefly, then hand back to the parent to close.
  useEffect(() => {
    if (!isSuccess) return
    const id = setTimeout(() => onDone?.(), SUCCESS_HOLD_MS)
    return () => clearTimeout(id)
  }, [isSuccess, onDone])

  function accept() {
    setLocalSuccess(true)
    onAccept?.()
  }

  const stageClass = isSuccess ? 'cer--success' : merged ? 'cer--ready' : 'cer--merging'

  return (
    <div className="overlay cer">
      <div className={`cer__stage ${stageClass}`}>
        <div className="cer__scene">
          <span className="cer__bubble cer__bubble--a" aria-hidden="true" />
          <span className="cer__bubble cer__bubble--b" aria-hidden="true" />
          <div className="cer__core">
            {isSuccess ? (
              <svg className="cer__check" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="cer__check-circle" cx="26" cy="26" r="24" />
                <path className="cer__check-mark" d="M14 27 l8 8 l16 -18" />
              </svg>
            ) : (
              <div className="cer__code">
                <span className="cer__code-label">Verification</span>
                <span className="cer__code-value">{code}</span>
              </div>
            )}
          </div>
        </div>

        <div className="cer__panel">
          {isSuccess ? (
            <h2 className="cer__title">Profiles shared with {peerName}</h2>
          ) : (
            <>
              <h2 className="cer__title">Connecting with {peerName}</h2>
              <p className="cer__instruction">
                Make sure this code matches {peerName}’s screen before you accept.
              </p>

              {showActions ? (
                <div className={`cer__actions ${merged ? '' : 'cer__actions--hidden'}`}>
                  <button type="button" className="btn btn--ghost" onClick={onDecline}>
                    Decline
                  </button>
                  <button type="button" className="btn btn--primary" onClick={accept}>
                    Accept
                  </button>
                </div>
              ) : (
                <div className="cer__actions">
                  {waitingLabel && <span className="cer__waiting">{waitingLabel}</span>}
                  {onCancel && (
                    <button type="button" className="btn btn--ghost" onClick={onCancel}>
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
