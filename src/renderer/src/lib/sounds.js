// Small, dependency-free sound cues. The audio files live in assets/sounds and
// are bundled by Vite, so these imports resolve to same-origin URLs — which the
// renderer's strict CSP (default-src 'self') allows. Playback failures (e.g. a
// blocked autoplay or a missing device) are swallowed so a cue never breaks a flow.
import launchUrl from '../assets/sounds/app-launch.mp3'
import shareSuccessUrl from '../assets/sounds/share-success.mp3'

function play(url, volume = 0.6) {
  try {
    const audio = new Audio(url)
    audio.volume = volume
    audio.play().catch(() => {})
  } catch {
    /* audio unavailable — ignore */
  }
}

export const playLaunch = () => play(launchUrl)
export const playShareSuccess = () => play(shareSuccessUrl)
