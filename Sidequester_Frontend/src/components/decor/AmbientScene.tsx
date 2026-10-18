import type { CSSProperties } from 'react'

const clouds = [
  { top: '8%', duration: '94s', delay: '-24s', width: '6%' },
  { top: '17%', duration: '123s', delay: '-77s', width: '5%' },
  { top: '39%', duration: '111s', delay: '-10s', width: '7%' },
  { top: '10%', duration: '139s', delay: '-111s', width: '6.5%' },
]

/** Decorative only. Independent CSS cycles avoid a shared video-loop seam. */
export default function AmbientScene() {
  return <div className="ambient-scene" aria-hidden="true">
    <div className="ambient-stage">
      <img className="ambient-plate" src="/art/ambient/scene-plate.webp" alt="" draggable={false} />
      {clouds.map((cloud, index) => <div key={index} className="ambient-cloud-lane" style={{
        top: cloud.top, animationDuration: cloud.duration, animationDelay: cloud.delay,
        '--cloud-width': cloud.width, '--cloud-rest': `${20 + index * 19}%`,
      } as CSSProperties}>
        <img src="/art/ambient/cloud.webp" alt="" draggable={false} />
      </div>)}
      <div className="ambient-dragon">
        <img src="/art/ambient/dragon.webp" alt="" draggable={false} />
        <span className="ambient-dragon-smoke"><i /><i /><i /></span>
      </div>
      <div className="ambient-fire ambient-fire-left">
        <img src="/art/ambient/flame.webp" alt="" draggable={false} />
        <span className="ambient-embers"><i /><i /><i /></span>
      </div>
      <span className="ambient-firefly ambient-firefly-one" />
      <span className="ambient-firefly ambient-firefly-two" />
      <span className="ambient-firefly ambient-firefly-three" />
    </div>
    <div className="ambient-soften" />
  </div>
}
