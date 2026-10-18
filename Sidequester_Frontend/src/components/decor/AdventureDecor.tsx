import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** Decorative artwork only: never intercepts input or adds application state. */
export function SparkleIcon({ className = '' }: { className?: string }) {
  return <img src="/art/cozy/sparkle.png" alt="" aria-hidden="true" draggable={false} className={`cozy-icon ${className}`} />
}

export function PixelLeafIcon({ className = '' }: { className?: string }) {
  return <img src="/art/cozy/leaf.png" alt="" aria-hidden="true" draggable={false} className={`cozy-icon ${className}`} />
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
