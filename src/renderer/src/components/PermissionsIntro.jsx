import { useEffect, useMemo, useState } from 'react'

// Builds the platform-appropriate sequence of one-time permission explainers,
// shown right after onboarding completes. Each step is displayed just BEFORE the
// corresponding OS prompt is triggered, so the user knows what they're agreeing to.
function stepsForPlatform(platform) {
  const steps = []

  if (platform === 'darwin') {
    steps.push({
      key: 'localnetwork',
      icon: '📡',
      title: 'Local network access',
      body:
        "We'll ask for local network permission next — this lets nearby devices " +
        'on trusted networks find each other. Click Allow when macOS asks.',
      primaryLabel: 'Continue',
      // Proactively provoke the macOS local-network prompt as we advance.
      onAdvance: () => window.api.primeLocalNetwork()
    })
  }

  if (platform === 'win32') {
    steps.push({
      key: 'firewall',
      icon: '🛡️',
      title: 'Windows Firewall',
      body:
        'When device discovery starts, Windows may show an “Allow app through ' +
        'firewall” prompt so nearby devices can find you. Choose Allow — checking ' +
        '“Private networks” is enough for home and office.',
      primaryLabel: 'Got it'
    })
  }

  return steps
}

export default function PermissionsIntro({ platform, onDone }) {
  const steps = useMemo(() => stepsForPlatform(platform), [platform])
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  // Nothing to explain on this platform (e.g. Linux) — finish immediately.
  // Done in an effect so we don't trigger a parent state update during render.
  const nothingToShow = steps.length === 0
  useEffect(() => {
    if (nothingToShow) onDone()
  }, [nothingToShow, onDone])

  if (nothingToShow) return null

  const step = steps[index]
  const isLast = index === steps.length - 1

  async function advance() {
    setBusy(true)
    try {
      if (step.onAdvance) await step.onAdvance()
    } finally {
      setBusy(false)
    }
    if (isLast) onDone()
    else setIndex((i) => i + 1)
  }

  return (
    <div className="card perm">
      <div className="perm__icon" aria-hidden="true">
        {step.icon}
      </div>
      <h1 className="view__title">{step.title}</h1>
      <p className="perm__body">{step.body}</p>

      {steps.length > 1 && (
        <div className="perm__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.key} className={i === index ? 'perm__dot perm__dot--on' : 'perm__dot'} />
          ))}
        </div>
      )}

      <div className="form__actions">
        <button type="button" className="btn btn--primary" onClick={advance} disabled={busy}>
          {busy ? 'Please wait…' : isLast ? 'Finish' : step.primaryLabel}
        </button>
      </div>
    </div>
  )
}
