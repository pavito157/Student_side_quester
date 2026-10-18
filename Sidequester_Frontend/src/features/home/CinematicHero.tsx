import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { navigateTo } from '../../services/navigation'

function CinematicHero() {
  const prefersReducedMotion = useReducedMotion() === true
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (!isLeaving) return
    const timer = window.setTimeout(() => navigateTo('/home'), 600)
    return () => window.clearTimeout(timer)
  }, [isLeaving])

  function beginJourney() {
    if (isLeaving) return
    if (prefersReducedMotion) {
      navigateTo('/home')
      return
    }
    setIsLeaving(true)
  }

  return (
    <section aria-labelledby="welcome-title" className="pixel-welcome-hero">
      <div className="pixel-welcome-copy">
        <p className="pixel-welcome-brand">
          <img src="/art/cozy/sprout.png" alt="" aria-hidden="true" />
          <span>Sidequester</span>
        </p>
        <motion.p
          className="pixel-welcome-eyebrow"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <span aria-hidden="true" className="pixel-welcome-eyebrow-icon">✦</span>
          Your Gainesville adventure starts here
        </motion.p>
        <motion.h1
          id="welcome-title"
          className="pixel-welcome-title"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.42 }}
        >
          A little adventure,
          <span>close to home.</span>
        </motion.h1>
        <p className="pixel-welcome-description">
          Turn an ordinary day into a sidequest. Find a new trail, visit a
          Gainesville favorite, and make a story that is yours.
        </p>
        <motion.button
          type="button"
          onClick={beginJourney}
          disabled={isLeaving}
          aria-busy={isLeaving}
          whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.025 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="pixel-welcome-cta"
        >
          <span className="pixel-welcome-cta-spark" aria-hidden="true">✦</span>
          <span>{isLeaving ? 'Following the trail…' : 'Enter the quest board'}</span>
          <img src="/art/cozy/navigation-arrow.svg" alt="" aria-hidden="true" draggable={false} className="pixel-welcome-cta-arrow cozy-icon size-5" />
        </motion.button>
        <p className="pixel-welcome-caption">
          No long tutorial. Just pick a vibe and head out.
        </p>
      </div>

      <div className="pixel-welcome-foreground" aria-hidden="true">
        <img
          className="pixel-welcome-ground"
          src="/art/pixel-trail-foreground.svg"
          alt=""
          draggable={false}
        />
        <img className="pixel-welcome-traveler" src="/art/pixel-adventurer.svg" alt="" draggable={false} />
        <img className="pixel-welcome-firefly pixel-welcome-firefly-one" src="/art/pixel-firefly.svg" alt="" aria-hidden="true" />
        <img className="pixel-welcome-firefly pixel-welcome-firefly-two" src="/art/pixel-firefly.svg" alt="" aria-hidden="true" />
        <img className="pixel-welcome-firefly pixel-welcome-firefly-three" src="/art/pixel-firefly.svg" alt="" aria-hidden="true" />
      </div>
      {isLeaving && (
        <div
          className="pixel-welcome-exit"
          aria-hidden="true"
        >
          <div className="pixel-welcome-exit-card">
            <img src="/art/pixel-adventurer.svg" alt="" />
            <span>Next stop: the quest board</span>
            <span className="pixel-welcome-exit-spark" aria-hidden="true">✦</span>
          </div>
        </div>
      )}
    </section>
  )
}

export default CinematicHero
