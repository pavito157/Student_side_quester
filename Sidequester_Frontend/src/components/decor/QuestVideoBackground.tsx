import { useEffect, useState } from 'react'

/** Luis's decorative video. It never intercepts input or owns quest state. */
export default function QuestVideoBackground() {
  const [motionAllowed, setMotionAllowed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionAllowed(!preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  return <div className="quest-video-layer" aria-hidden="true">
    {motionAllowed && !failed && <video
      className="quest-background-video"
      autoPlay loop muted playsInline preload="metadata"
      onError={() => setFailed(true)}
    >
      <source src="/art/gemini_generated_video_342ca554.mp4" type="video/mp4" onError={() => setFailed(true)} />
    </video>}
    <div className="quest-video-overlay" />
  </div>
}
