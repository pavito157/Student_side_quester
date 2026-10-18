import {
  lazy,
  Suspense,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'

import { AccentStrokes, SparkleIcon } from './AdventureDecor'

const GuildhallCanvas = lazy(() => import('./GuildhallCanvas'))

function CinematicHero() {
  const stageRef = useRef<HTMLElement>(null)
  const hasStartedJourney = useRef(false)
  const prefersReducedMotion = useReducedMotion() === true
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start start', 'end start'],
  })
  const sceneProgress = useSpring(0, {
    stiffness: 38,
    damping: 19,
    mass: 1.05,
  })
  const pointerX = useSpring(0, { stiffness: 120, damping: 22 })
  const pointerY = useSpring(0, { stiffness: 120, damping: 22 })
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.2])
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -36])

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    if (hasStartedJourney.current) return
    if (prefersReducedMotion) sceneProgress.jump(value)
    else sceneProgress.set(value)
  })

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (prefersReducedMotion || event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)))
    pointerY.set(Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)))
  }

  function resetPointer() {
    pointerX.set(0)
    pointerY.set(0)
  }

  function beginJourney() {
    hasStartedJourney.current = true
    if (prefersReducedMotion) sceneProgress.jump(1)
    else sceneProgress.set(1)
    document.getElementById('quest-terminal')?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
    window.setTimeout(() => {
      hasStartedJourney.current = false
    }, 1600)
  }

  return (
    <section
      ref={stageRef}
      aria-label="Welcome to the Sidequester guild"
      className="cinematic-hero relative isolate"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <motion.div
        className="guild-hero-content relative z-10 mx-auto flex min-h-[min(54rem,calc(100svh-4rem))] w-full max-w-7xl flex-col items-center px-5 pb-8 pt-16 text-center sm:px-8 sm:pt-20"
        style={{
          opacity: prefersReducedMotion ? 1 : contentOpacity,
          y: prefersReducedMotion ? 0 : contentY,
        }}
      >
        <motion.div
          className="hero-copy flex w-full flex-col items-center"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <h1 className="hero-title">
            A little adventure,<AccentStrokes />
            <span className="mt-2 block text-secondary">close to home.</span>
          </h1>
          <p className="hero-description mt-5 max-w-2xl text-sm leading-relaxed sm:text-lg">
            A little more Gainesville, a little less routine. Choose a place and tell us what kind
            of day you’re after.
          </p>
          <motion.button
            type="button"
            onClick={beginJourney}
            whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.02 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="realm-cta mt-7 inline-flex min-h-14 items-center gap-3 rounded-lg px-7 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <SparkleIcon className="size-6" />
            <span>Begin journey</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
              <path
                d="M10 3.5v13m0 0-5-5m5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
          <p className="hero-caption mt-4 text-sm">
            Your next favorite place might be closer than you think.
          </p>
        </motion.div>

        <div className="guildhall-scene adventure-map" aria-hidden="true">
          <Suspense fallback={<div className="guildhall-scene-fallback" />}>
            <GuildhallCanvas
              progress={sceneProgress}
              pointerX={pointerX}
              pointerY={pointerY}
              reducedMotion={prefersReducedMotion}
            />
          </Suspense>
        </div>
        <motion.p
          className="guild-map-caption mt-4"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
        >
          <span aria-hidden="true">✦</span>
          A city to explore
          <span aria-hidden="true">✦</span>
        </motion.p>
      </motion.div>
    </section>
  )
}

export default CinematicHero
