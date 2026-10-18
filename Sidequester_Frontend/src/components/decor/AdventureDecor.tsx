import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** Decorative artwork only: never intercepts input or adds application state. */
export function SparkleIcon({ className = '' }: { className?: string }) {
  return <img src="/art/cozy/sparkle.png" alt="" aria-hidden="true" draggable={false} className={`cozy-icon ${className}`} />
}

export function PixelLeafIcon({ className = '' }: { className?: string }) {
  return <img src="/art/cozy/leaf.png" alt="" aria-hidden="true" draggable={false} className={`cozy-icon ${className}`} />
}

export function PixelTrailSignIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className={className} shapeRendering="crispEdges">
    <path d="M14 19h5v13h-5z" fill="#38291c" />
    <path d="M15 20h3v12h-3z" fill="#95643a" />
    <path d="M3 4h26v16H3z" fill="#3b2a1d" />
    <path d="M5 6h22v12H5z" fill="#b77a42" />
    <path d="M7 8h18v8H7z" fill="#e3bd76" />
    <path d="M8 9h7v2H8zm11 0h5v2h-5zm-7 4h10v2H12z" fill="#547344" />
    <path d="M3 4h4v2H5v3H3zm22 0h4v5h-2V6h-2zM3 15h2v3h4v2H3zm22 3h2v-3h2v5h-4z" fill="#70462b" />
  </svg>
}

export function PixelLanternIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 32" className={className} shapeRendering="crispEdges">
    <path d="M9 1h6v2h3v4h-2V5H8v2H6V3h3z" fill="#45311f" />
    <path d="M10 3h4v2h-4z" fill="#d9bc78" />
    <path d="M5 7h14v2h2v15h-2v3H5v-3H3V9h2z" fill="#3c2c20" />
    <path d="M6 10h12v12H6z" fill="#c08a43" />
    <path d="M8 11h8v10H8z" fill="#f3d878" />
    <path d="M11 13h2v2h2v4h-2v2h-2v-2H9v-4h2z" fill="#fff2b2" />
    <path d="M5 24h14v2H5z" fill="#8a5b32" />
    <path d="M2 12h2v6H2zm18 0h2v6h-2z" fill="#d6b56d" />
  </svg>
}

export function PixelMushroomIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className={className} shapeRendering="crispEdges">
    <path d="M14 17h5v4h3v7h-3v2h-7v-2h-3v-7h3v-4z" fill="#f0d7a0" />
    <path d="M14 20h5v3h3v5h-3v2h-7v-2h-3v-5h3v-3z" fill="#d7b77b" />
    <path d="M6 12V9h3V6h4V3h7v3h4v3h3v3h2v6H3v-6h3z" fill="#593b2a" />
    <path d="M7 12V9h4V6h4V4h5v3h4v3h3v3h2v3H4v-3h3z" fill="#b95f3b" />
    <path d="M11 8h3v3h-3zm9 2h3v3h-3zM7 13h3v2H7z" fill="#f2cf79" />
    <path d="M13 19h2v2h-2zm0 6h2v3h-2z" fill="#fff0c5" />
  </svg>
}

export function PixelHangingVineIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 32 64" className={className} shapeRendering="crispEdges">
    <path d="M5 0h4v8h3v5h5v4h6v4h4v6h-4v-3h-7v-4h-6v-5H7v-7H5z" fill="#284d32" />
    <path d="M8 1h2v7h3v5h5v4h6v4h3v3h-2v-2h-7v-4h-6v-5h-4V8H8z" fill="#63934b" />
    <path d="M8 6h3v3h-3zm4 5h3v3h-3zm5 4h3v3h-3zm5 4h3v3h-3z" fill="#9fbd60" />
    <path d="M3 13h5v2h3v4h-3v3H5v-3H2v-4h1z" fill="#35643b" />
    <path d="M4 15h3v2h2v1H7v2H5v-2H3v-2h1z" fill="#81ac50" />
    <path d="M18 25h5v2h3v4h-3v3h-4v-3h-3v-4h2z" fill="#35643b" />
    <path d="M19 27h3v2h2v1h-2v2h-2v-2h-2v-2h1z" fill="#a8c45e" />
    <path d="M7 31h5v2h3v4h-3v3H8v-3H5v-4h2z" fill="#35643b" />
    <path d="M8 33h3v2h2v1h-2v2H9v-2H7v-2h1z" fill="#81ac50" />
    <path d="M23 40h5v2h3v4h-3v3h-4v-3h-3v-4h2z" fill="#35643b" />
    <path d="M24 42h3v2h2v1h-2v2h-2v-2h-2v-2h1z" fill="#a8c45e" />
    <path d="M13 48h5v2h3v4h-3v3h-4v-3h-3v-4h2z" fill="#35643b" />
    <path d="M14 50h3v2h2v1h-2v2h-2v-2h-2v-2h1z" fill="#81ac50" />
  </svg>
}

export function PixelBranchIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 64 32" className={className} shapeRendering="crispEdges">
    <path d="M2 23h7v-4h8v-4h9v-3h8V8h9V5h9V2h7v4h-7v3h-9v4h-9v4h-8v3h-9v4h-8v4H2z" fill="#284a31" />
    <path d="M4 23h5v-4h8v-4h9v-3h8V8h9V5h9V3h5v2h-7v3h-9v4h-9v4h-8v3h-9v4h-8v4H4z" fill="#78974a" />
    <path d="M10 18h6v-4h5v-3h5v4h-4v4h-7v3h-5z" fill="#38643b" />
    <path d="M13 13h3v-4h4V6h6v4h-4v3h-4v3h-5z" fill="#9ab857" />
    <path d="M26 11h5V7h4V4h6v4h-4v4h-6v3h-5z" fill="#4b7940" />
    <path d="M29 7h4V4h5V1h6v4h-4v3h-5v3h-6z" fill="#b7cb65" />
    <path d="M43 5h5V2h4V0h7v4h-5v3h-5v3h-6z" fill="#5c8b43" />
    <path d="M47 2h5V0h5v3h-4v3h-6z" fill="#bdd36c" />
    <path d="M49 13h5v-3h4v-3h5v5h-4v3h-5v3h-5z" fill="#47733b" />
    <path d="M53 10h4V8h4v3h-3v3h-5z" fill="#a6c65d" />
  </svg>
}

export function PixelCompassIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className={className} shapeRendering="crispEdges">
    <path d="M12 1h8v2h5v3h3v5h2v8h-2v5h-3v5h-5v2h-8v-2H7v-3H4v-5H2v-8h2V8h3V3h5z" fill="#443222" />
    <path d="M12 4h8v2h4v4h2v8h-2v4h-4v4h-8v-2H8v-4H6v-8h2v-4h4z" fill="#d6b66c" />
    <path d="M12 7h8v2h3v4h2v6h-2v4h-3v2h-8v-2H9v-4H7v-6h2v-4h3z" fill="#f2e3ba" />
    <path d="M16 8h2v7h5v2h-5v7h-2v-7h-5v-2h5z" fill="#607a43" />
    <path d="M16 10h2v6h-2zm-2 6h2v2h-2z" fill="#bd5c39" />
    <path d="M15 1h2v3h-2zm0 27h2v3h-2zM2 15h3v2H2zm25 0h3v2h-3z" fill="#fff0bd" />
  </svg>
}

export function AccentStrokes() {
  return <img src="/art/cozy/sparkle.png" alt="" aria-hidden="true" className="accent-strokes cozy-icon" />
}

/** Anchored to the sticky header, so the same pair stays put while scrolling. */
export function NavFoliage() {
  const foliage = useRef<HTMLDivElement>(null)
  const [releasedLeaves, setReleasedLeaves] = useState<{ id: number; x: number; y: number }[]>([])

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const corners = foliage.current?.querySelectorAll<HTMLImageElement>('.corner-foliage')
    let leafId = 0
    const returns = new Map<HTMLImageElement, Animation>()
    const release = (corner: HTMLImageElement, dropLeaf: boolean) => {
      if (!corner.dataset.near) return
      const angle = Number.parseFloat(getComputedStyle(corner).rotate) || 0
      delete corner.dataset.near
      returns.get(corner)?.cancel()
      if (!motion.matches) {
        const direction = Math.sign(angle) || (corner.classList.contains('foliage-left') ? 1 : -1)
        const bounce = Math.max(.45, Math.min(.9, Math.abs(angle) * .4))
        const animation = corner.animate([
          { rotate: `${angle}deg`, offset: 0 },
          { rotate: `${-direction * bounce}deg`, offset: 1 },
        ], { duration: 572, easing: 'ease-in-out' })
        returns.set(corner, animation)
        // Release at the first bounce, then let the branch settle.
        // Re-entry, blur, reduced motion, and unmount cancel pending motion.
        animation.onfinish = () => {
          if (returns.get(corner) !== animation) return
          if (motion.matches || corner.dataset.near) return
          const settling = corner.animate([
            { rotate: `${-direction * bounce}deg` },
            { rotate: `${direction * bounce * .4}deg`, offset: .5 },
            { rotate: '0deg' },
          ], { duration: 528, easing: 'ease-in-out' })
          returns.set(corner, settling)
          settling.onfinish = () => {
            if (returns.get(corner) === settling) returns.delete(corner)
          }
          if (!dropLeaf) return
          const bounds = corner.getBoundingClientRect()
          // The full visible width of either corner is eligible, mirrored.
          const left = Math.max(0, bounds.left)
          const right = Math.min(document.documentElement.clientWidth, bounds.right)
          const distance = 16 + Math.random() * Math.max(0, right - left - 32)
          const centerX = corner.classList.contains('foliage-left')
            ? left + distance : right - distance
          const id = ++leafId
          const y = bounds.top + bounds.height * (.35 + Math.random() * .2)
          setReleasedLeaves((leaves) => [...leaves.slice(-5), { id, x: centerX - 16, y }])
        }
      }
    }
    const reset = () => {
      returns.forEach((animation) => animation.cancel())
      returns.clear()
      corners?.forEach((corner) => release(corner, false))
      if (motion.matches) setReleasedLeaves([])
    }
    const leaveWindow = () => corners?.forEach((corner) => release(corner, true))
    const reactToPointer = (event: PointerEvent) => {
      if (motion.matches || event.pointerType !== 'mouse') return reset()
      corners?.forEach((corner) => {
        const bounds = corner.getBoundingClientRect()
        const nearby = event.clientX >= bounds.left - 36 && event.clientX <= bounds.right + 36
          && event.clientY >= bounds.top - 24 && event.clientY <= bounds.bottom + 36
        if (nearby && !corner.dataset.near) {
          returns.get(corner)?.cancel()
          corner.dataset.near = 'true'
        } else if (!nearby) release(corner, true)
      })
    }
    // Observe proximity without making decorative artwork intercept any clicks.
    window.addEventListener('pointermove', reactToPointer, { passive: true })
    window.addEventListener('blur', reset)
    document.documentElement.addEventListener('pointerleave', leaveWindow)
    motion.addEventListener('change', reset)
    return () => {
      window.removeEventListener('pointermove', reactToPointer)
      window.removeEventListener('blur', reset)
      document.documentElement.removeEventListener('pointerleave', leaveWindow)
      motion.removeEventListener('change', reset)
      returns.forEach((animation) => animation.cancel())
    }
  }, [])

  return <><div ref={foliage} className="nav-foliage" aria-hidden="true">
    <img className="corner-foliage foliage-left" src="/art/cozy/canopy.png" alt="" draggable={false} width={1536} height={1024} />
    <img className="corner-foliage foliage-right" src="/art/cozy/canopy.png" alt="" draggable={false} width={1536} height={1024} />
  </div>
    {createPortal(<div className="released-leaves" aria-hidden="true">
      {releasedLeaves.map((leaf) => <span key={leaf.id} className="released-leaf"
        style={{ left: leaf.x, top: leaf.y }}
        onAnimationEnd={() => setReleasedLeaves((leaves) => leaves.filter((item) => item.id !== leaf.id))}>
        <PixelLeafIcon className="size-full" />
      </span>)}
    </div>, document.body)}
  </>
}

// Different fixed seeds keep the motion varied without render-time randomness,
// timers, listeners, or changes to the app's state and data flow.
const leafTrails = [
  { x: 4, size: 25, seconds: 28, delay: -9, drift: 45, spin: 145, alpha: .17 },
  { x: 18, size: 18, seconds: 34, delay: -24, drift: -28, spin: -110, alpha: .14 },
  { x: 31, size: 29, seconds: 32, delay: -4, drift: 62, spin: 220, alpha: .12 },
  { x: 45, size: 19, seconds: 26, delay: -17, drift: -42, spin: -165, alpha: .15 },
  { x: 59, size: 24, seconds: 36, delay: -28, drift: 38, spin: 170, alpha: .13 },
  { x: 73, size: 18, seconds: 30, delay: -12, drift: -55, spin: -200, alpha: .16 },
  { x: 87, size: 28, seconds: 33, delay: -21, drift: 30, spin: 130, alpha: .17 },
  { x: 96, size: 20, seconds: 27, delay: -2, drift: -32, spin: -140, alpha: .14 },
]

export function FallingLeaves() {
  // A body portal avoids transformed route/hero ancestors turning a fixed
  // background into a scroll-attached decoration. Cards stay above this layer.
  return createPortal(
    <div className="falling-leaves" aria-hidden="true">
      {leafTrails.map((leaf) => <span key={leaf.x} className="falling-leaf" style={{
        left: `${leaf.x}%`, width: leaf.size, height: leaf.size,
        animationDuration: `${leaf.seconds}s`, animationDelay: `${leaf.delay}s`,
        '--leaf-drift': `${leaf.drift}px`, '--leaf-spin': `${leaf.spin}deg`, '--leaf-alpha': leaf.alpha,
      } as CSSProperties}>
        <PixelLeafIcon className="size-full" />
      </span>)}
    </div>, document.body,
  )
}

/** One short celebration per successful generation; never blocks the result. */
export function QuestConfetti() {
  const [finished, setFinished] = useState(false)
  if (finished) return null
  return createPortal(<div className="quest-confetti" aria-hidden="true"
    onAnimationEnd={(event) => { if (event.target === event.currentTarget) setFinished(true) }}>
    {Array.from({ length: 36 }, (_, index) => <i key={index} style={{
      left: `${8 + (index * 17 % 85)}%`,
      backgroundColor: ['#f2c94c', '#3583ef', '#76a866', '#b69bdd', '#f2a378'][index % 5],
      '--confetti-drift': `${(index % 2 ? 1 : -1) * (30 + index * 7 % 110)}px`,
      '--confetti-spin': `${(index % 2 ? 1 : -1) * (180 + index * 23)}deg`,
      animationDelay: `${index % 6 * .055}s`,
      borderRadius: index % 3 === 0 ? '50%' : '1px',
    } as CSSProperties} />)}
  </div>, document.body)
}
