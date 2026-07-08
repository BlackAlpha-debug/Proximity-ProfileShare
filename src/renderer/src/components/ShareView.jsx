import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { encodeProfileForQr } from '../lib/qrPayload.js'

export default function ShareView({ profile, onBack }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const deviceId = await window.api.getDeviceId()
      if (cancelled) return
      const payload = encodeProfileForQr(profile, deviceId)
      // ECC level M keeps the code light while staying robust to camera noise.
      // The photo is never part of the payload.
      try {
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320
        })
        if (!cancelled) setDataUrl(url)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  return (
    <div className="card share">
      <h1 className="view__title">Share my profile</h1>
      <p className="view__subtitle">
        Have the other person scan this code. Works with no network — the code
        carries your details directly.
      </p>

      <div className="share__qr">
        {error ? (
          <p className="field__error">Couldn't generate code: {error}</p>
        ) : dataUrl ? (
          <img src={dataUrl} alt="QR code for your profile" />
        ) : (
          <p className="muted">Generating…</p>
        )}
      </div>

      <p className="share__name">{profile.fullName}</p>
      <p className="share__note">Your photo isn't included in the code.</p>

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
