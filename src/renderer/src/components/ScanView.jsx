import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { decodeProfileFromQr } from '../lib/qrPayload.js'

// status: 'requesting' | 'scanning' | 'denied' | 'notfound' | 'error'
export default function ScanView({ platform, onScan, onBack }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('requesting')
  const [foreignSeen, setForeignSeen] = useState(false)

  useEffect(() => {
    let stream = null
    let rafId = null
    let stopped = false

    function stopCamera() {
      stopped = true
      if (rafId) cancelAnimationFrame(rafId)
      if (stream) stream.getTracks().forEach((track) => track.stop())
    }

    function tick() {
      if (stopped) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth
        const h = video.videoHeight
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, w, h)
        const image = ctx.getImageData(0, 0, w, h)
        const found = jsQR(image.data, w, h, { inversionAttempts: 'dontInvert' })
        if (found) {
          const contact = decodeProfileFromQr(found.data)
          if (contact) {
            stopCamera()
            onScan(contact)
            return
          }
          // A QR code that isn't one of ours — keep scanning, but hint at it.
          setForeignSeen(true)
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStatus('scanning')
        rafId = requestAnimationFrame(tick)
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setStatus('denied')
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setStatus('notfound')
        } else {
          setStatus('error')
        }
      }
    }

    start()
    return stopCamera
  }, [onScan])

  return (
    <div className="card scan">
      <h1 className="view__title">Scan a code</h1>

      {status === 'requesting' && <p className="muted">Requesting camera access…</p>}

      {status === 'scanning' && (
        <>
          <p className="view__subtitle">Point your camera at the other person's QR code.</p>
          {foreignSeen && (
            <p className="scan__hint">That code isn't a Proximity Share profile — keep looking.</p>
          )}
        </>
      )}

      {status === 'denied' && <CameraDenied platform={platform} />}

      {status === 'notfound' && (
        <p className="scan__error">No camera was found on this device.</p>
      )}

      {status === 'error' && (
        <p className="scan__error">Something went wrong opening the camera. Please try again.</p>
      )}

      <div className={`scan__viewport ${status === 'scanning' ? '' : 'scan__viewport--hidden'}`}>
        <video ref={videoRef} playsInline muted />
        <div className="scan__reticle" />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

function CameraDenied({ platform }) {
  const steps = {
    win32:
      'Open Windows Settings → Privacy & security → Camera, make sure "Camera access" and "Let desktop apps access your camera" are on, then reopen this app.',
    darwin:
      'Open System Settings → Privacy & Security → Camera and enable access for Proximity Profile Share, then reopen the app.',
    linux:
      'Check your system camera/privacy settings and make sure no other app is currently using the camera.'
  }
  // A deep link to OS settings only exists on Windows and macOS.
  const canOpenSettings = platform === 'win32' || platform === 'darwin'

  return (
    <div className="scan__denied">
      <p className="scan__error">Camera access was denied.</p>
      <p className="view__subtitle">{steps[platform] || steps.linux}</p>
      {canOpenSettings && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => window.api.openSettings('camera')}
        >
          Open camera settings
        </button>
      )}
    </div>
  )
}
