import styles from './LeaderboardForest.module.css'

/** Original decorative scenery. No state, timers, events, or external assets. */
function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M44 76h16v108H44z" fill="var(--forest-bark)" />
    <path d="M48 90h4v86h-4zM34 116h10v8H34zM60 102h10v8H60z" fill="var(--forest-bark-light)" />
    <g className={styles.crown}>
      <path d="M36 0h32v8h16v16h12v24h8v24h-8v20H80v12H24V92H8V76H0V48h8V28h12V12h16z" fill="var(--forest-deep)" />
      <path d="M36 8h28v8h16v16h12v24h-8v16H64v12H24V72H8V48h12V28h16z" fill="var(--forest-leaf)" />
      <path d="M36 16h24v8H36zM20 36h24v8H20zM60 40h20v8H60zM28 60h24v8H28z" fill="var(--forest-sun)" />
      <path d="M12 80h20v8H12zM60 76h28v8H60zM40 92h24v8H40z" fill="var(--forest-shadow)" />
    </g>
    <path d="M24 176h16v-8h8v8h16v-8h8v8h12v8H24z" fill="var(--forest-deep)" />
  </g>
}

function Undergrowth() {
  return <g className={styles.undergrowth}>
    <path d="M0 100V64h12V52h20V40h24v8h20v16h16v-8h20V40h28V28h24v12h20v16h16v44z" fill="var(--forest-shadow)" />
    <path d="M0 100V80h16V64h24v-8h24v16h28v12h16V64h24V48h24v8h20v24h24v20z" fill="var(--forest-leaf)" />
    <path d="M24 72h16v8H24zM136 56h16v8h-16zM112 80h12v8h-12z" fill="var(--forest-sun)" />
    <g className={styles.grass} fill="var(--forest-deep)">
      <path d="M4 100V80h4v8h4V68h4v24h4V80h4v20zM76 100V80h4v8h4V72h4v20h4v-8h4v16zM168 100V76h4v12h4V64h4v28h4V80h4v20z" />
      <path d="M44 100V80H32v-8h12v8h4V64h4v36zM124 100V88h-12v-8h12v8h4V72h4v28z" />
    </g>
    <path d="M48 60h8v8h-8zM44 64h16v4H44zM128 68h8v8h-8z" fill="var(--forest-flower)" />
  </g>
}

export default function LeaderboardForest() {
  return <div className={styles.forest} aria-hidden="true" data-leaderboard-forest="true">
    <svg className={styles.distant} viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" focusable="false" shapeRendering="crispEdges">
      <path d="M0 300V160h40v-40h40v40h40v60h40v-80h40V80h40v60h40v80h40v-60h40v-40h40v40h40v80h40v-40h40v-80h40v-40h40v40h40v100h40v-40h40v-60h40v-40h40v40h40v100h40v-60h40v-60h40V60h40v60h40v100h40v-60h40v-40h40v40h40v80h40v-60h40v-80h40V60h40v40h40v80h40v-20h40v-40h40v40h40v140z" fill="var(--forest-mist)" />
    </svg>
    <div className={`${styles.edge} ${styles.leftEdge}`}>
    <svg className={styles.leftTrees} viewBox="0 0 240 700" focusable="false" shapeRendering="crispEdges">
      <Tree x={-32} y={0} scale={1.8} /><Tree x={102} y={110} scale={1.15} />
      <Tree x={-60} y={300} scale={2.2} /><Tree x={90} y={470} scale={1.3} />
    </svg>
    </div>
    <div className={`${styles.edge} ${styles.rightEdge}`}>
    <svg className={styles.rightTrees} viewBox="0 0 240 700" focusable="false" shapeRendering="crispEdges">
      <Tree x={110} y={-20} scale={1.7} /><Tree x={-10} y={160} scale={1.2} />
      <Tree x={92} y={310} scale={2} /><Tree x={-8} y={510} scale={1.1} />
    </svg>
    </div>
    <svg className={styles.leftPlants} viewBox="0 0 200 100" focusable="false" shapeRendering="crispEdges"><Undergrowth /></svg>
    <svg className={styles.rightPlants} viewBox="0 0 200 100" focusable="false" shapeRendering="crispEdges"><Undergrowth /></svg>
    <div className={styles.floor} />
    <span className={styles.leaf} /><span className={styles.leaf} /><span className={styles.leaf} />
  </div>
}
