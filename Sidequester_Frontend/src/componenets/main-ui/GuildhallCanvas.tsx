import type { MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'

type GuildhallCanvasProps = {
  progress: MotionValue<number>
  pointerX: MotionValue<number>
  pointerY: MotionValue<number>
  reducedMotion: boolean
}

type Mote = {
  x: number
  y: number
  speed: number
  size: number
  warmth: boolean
}

function drawGrove(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.save()
  context.translate(x, y)
  context.strokeStyle = 'rgba(48, 75, 51, 0.4)'
  context.fillStyle = '#9cc679'
  context.lineWidth = Math.max(1, size * 0.055)
  for (const [offsetX, offsetY, canopySize] of [
    [-size * 0.42, size * 0.06, size * 0.28],
    [0, -size * 0.1, size * 0.34],
    [size * 0.4, size * 0.12, size * 0.25],
  ]) {
    context.beginPath()
    context.moveTo(offsetX, offsetY + canopySize * 1.7)
    context.lineTo(offsetX, offsetY + canopySize * 0.45)
    context.stroke()
    context.beginPath()
    context.arc(offsetX, offsetY, canopySize, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawMap(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  reveal: number,
  pointerX: number,
  pointerY: number,
) {
  const mapWidth = width - 16
  const mapHeight = height - 16
  const scale = 0.98 + reveal * 0.02
  const x = width * 0.5 + pointerX * 2
  const y = height * 0.5 + pointerY * 1.5

  context.save()
  context.translate(x, y)
  context.rotate(pointerX * -0.002)
  context.scale(scale, scale)

  context.shadowColor = 'rgba(29, 45, 36, 0.20)'
  context.shadowBlur = 0
  context.shadowOffsetX = 3
  context.shadowOffsetY = 4
  context.beginPath()
  context.roundRect(-mapWidth / 2 - 7, -mapHeight / 2 - 7, mapWidth + 14, mapHeight + 14, 15)
  context.fillStyle = '#ffffff'
  context.fill()
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0

  const parchment = context.createLinearGradient(
    -mapWidth / 2,
    -mapHeight / 2,
    mapWidth / 2,
    mapHeight / 2,
  )
  parchment.addColorStop(0, '#fcfcf5')
  parchment.addColorStop(0.52, '#f4f8ed')
  parchment.addColorStop(1, '#f7faf1')
  context.beginPath()
  context.roundRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight, 11)
  context.fillStyle = parchment
  context.fill()
  context.strokeStyle = 'rgba(39, 51, 45, 0.52)'
  context.lineWidth = 1.25
  context.stroke()

  context.save()
  context.beginPath()
  context.roundRect(-mapWidth / 2 + 3, -mapHeight / 2 + 3, mapWidth - 6, mapHeight - 6, 9)
  context.clip()

  const paperWash = context.createRadialGradient(
    -mapWidth * 0.28,
    -mapHeight * 0.34,
    0,
    0,
    0,
    mapWidth * 0.8,
  )
  paperWash.addColorStop(0, 'rgba(238, 225, 178, 0.16)')
  paperWash.addColorStop(1, 'rgba(58, 76, 53, 0.02)')
  context.fillStyle = paperWash
  context.fillRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight)

  for (let ridge = 0; ridge < 4; ridge += 1) {
    context.beginPath()
    for (let step = 0; step <= 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2
      const radius = mapWidth * (0.055 + ridge * 0.026)
      const px = -mapWidth * 0.13 + Math.cos(angle) * radius * 1.45
      const py = mapHeight * 0.02 + Math.sin(angle) * radius * 0.58
      if (step === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.strokeStyle = `rgba(48, 75, 51, ${0.16 - ridge * 0.018})`
    context.lineWidth = 1
    context.stroke()
  }

  const pondX = -mapWidth * 0.23
  const pondY = -mapHeight * 0.27
  context.beginPath()
  context.ellipse(pondX, pondY, mapWidth * 0.07, mapHeight * 0.07, -0.18, 0, Math.PI * 2)
  context.fillStyle = '#b9e3f8'
  context.strokeStyle = '#79b7d8'
  context.lineWidth = Math.max(1, mapWidth * 0.003)
  context.fill()
  context.stroke()
  context.beginPath()
  context.ellipse(
    pondX,
    pondY,
    mapWidth * 0.048,
    mapHeight * 0.045,
    -0.18,
    -0.45,
    Math.PI * 1.25,
  )
  context.strokeStyle = '#ffffff'
  context.lineWidth = Math.max(0.8, mapWidth * 0.0018)
  context.stroke()

  drawGrove(context, -mapWidth * 0.36, -mapHeight * 0.04, mapWidth * 0.055)
  drawGrove(context, mapWidth * 0.35, mapHeight * 0.12, mapWidth * 0.05)

  context.beginPath()
  context.moveTo(-mapWidth * 0.42, mapHeight * 0.31)
  context.bezierCurveTo(
    -mapWidth * 0.24,
    mapHeight * 0.18,
    -mapWidth * 0.18,
    -mapHeight * 0.24,
    mapWidth * 0.02,
    -mapHeight * 0.02,
  )
  context.bezierCurveTo(
    mapWidth * 0.2,
    mapHeight * 0.17,
    mapWidth * 0.24,
    -mapHeight * 0.33,
    mapWidth * 0.43,
    -mapHeight * 0.29,
  )
  context.strokeStyle = '#247347'
  context.lineWidth = Math.max(2, mapWidth * 0.006)
  context.lineCap = 'round'
  context.stroke()

  context.setLineDash([mapWidth * 0.012, mapWidth * 0.014])
  context.strokeStyle = '#fcfcf5'
  context.lineWidth = Math.max(0.8, mapWidth * 0.0016)
  context.stroke()
  context.setLineDash([])

  for (const [pinX, pinY, fill] of [
    [-0.42, 0.31, '#247347'], [0.02, -0.02, '#e7bb35'], [0.43, -0.29, '#e57d56'],
  ] as const) {
    const px = mapWidth * pinX
    const py = mapHeight * pinY
    context.beginPath()
    context.arc(px, py - 10, 8, Math.PI * 0.15, Math.PI * 0.85, true)
    context.lineTo(px, py + 4)
    context.closePath()
    context.fillStyle = fill
    context.fill()
    context.strokeStyle = '#31533a'
    context.lineWidth = 1.3
    context.stroke()
    context.beginPath()
    context.arc(px, py - 10, 2.5, 0, Math.PI * 2)
    context.fillStyle = '#fff'
    context.fill()
  }

  const compassX = mapWidth * 0.39
  const compassY = -mapHeight * 0.29
  const compassSize = Math.max(6, mapWidth * 0.013)
  context.beginPath()
  context.moveTo(compassX, compassY - compassSize)
  context.lineTo(compassX + compassSize * 0.42, compassY)
  context.lineTo(compassX, compassY + compassSize)
  context.lineTo(compassX - compassSize * 0.42, compassY)
  context.closePath()
  context.fillStyle = 'rgba(48, 75, 51, 0.48)'
  context.fill()
  context.font = `${Math.max(7, mapWidth * 0.014)}px Georgia, serif`
  context.textAlign = 'center'
  context.fillText('N', compassX, compassY - compassSize * 1.7)

  context.restore()
  context.restore()
}

function paint(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reveal: number,
  pointerX: number,
  pointerY: number,
  motes: Mote[],
) {
  context.clearRect(0, 0, width, height)
  motes.forEach((mote, index) => {
    const drift = time * mote.speed
    const x = ((mote.x * width + drift * width * 0.045) % width + width) % width
    const y = ((mote.y * height - drift * height * 0.08) % height + height) % height
    const alpha = 0.12 + (Math.sin(time * 0.0007 + index) + 1) * 0.08
    context.beginPath()
    context.arc(x, y, mote.size, 0, Math.PI * 2)
    context.fillStyle = mote.warmth
      ? `rgba(244, 174, 91, ${alpha * 0.82})`
      : `rgba(211, 220, 187, ${alpha})`
    context.fill()
  })

  drawMap(context, width, height, reveal, pointerX, pointerY)


}

function GuildhallCanvas({
  progress,
  pointerX,
  pointerY,
  reducedMotion,
}: GuildhallCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!context) return
    const sceneCanvas = canvas
    const sceneContext = context

    let width = 0
    let height = 0
    let frameId = 0
    let visible = false
    let reveal = progress.get()
    const motes = Array.from({ length: 28 }, (_, index) => ({
      x: (index * 0.61803398875) % 1,
      y: (index * 0.75487766625) % 1,
      speed: 0.3 + (index % 4) * 0.13,
      size: index % 7 === 0 ? 1.4 : 0.75,
      warmth: index % 6 === 0,
    }))

    function draw(time: number) {
      frameId = 0
      if (!visible) return
      const target = Math.max(0, Math.min(1, progress.get()))
      reveal += (target - reveal) * (reducedMotion ? 1 : 0.045)
      if (Math.abs(target - reveal) < 0.001) reveal = target
      paint(
        sceneContext,
        width,
        height,
        reducedMotion ? 0 : time,
        reveal,
        pointerX.get(),
        pointerY.get(),
        motes,
      )
      if (!reducedMotion) frameId = window.requestAnimationFrame(draw)
    }

    function scheduleDraw() {
      if (visible && frameId === 0) frameId = window.requestAnimationFrame(draw)
    }

    function resizeCanvas() {
      const bounds = sceneCanvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      width = bounds.width
      height = bounds.height
      sceneCanvas.width = Math.round(width * pixelRatio)
      sceneCanvas.height = Math.round(height * pixelRatio)
      sceneContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      scheduleDraw()
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) scheduleDraw()
      else {
        window.cancelAnimationFrame(frameId)
        frameId = 0
      }
    })
    const resizeObserver = new ResizeObserver(resizeCanvas)
    observer.observe(sceneCanvas)
    resizeObserver.observe(sceneCanvas)
    const stopProgress = progress.on('change', scheduleDraw)
    const stopPointerX = pointerX.on('change', scheduleDraw)
    const stopPointerY = pointerY.on('change', scheduleDraw)
    resizeCanvas()

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
      resizeObserver.disconnect()
      stopProgress()
      stopPointerX()
      stopPointerY()
    }
  }, [pointerX, pointerY, progress, reducedMotion])

  return <canvas ref={canvasRef} aria-hidden="true" className="size-full" />
}

export default GuildhallCanvas
