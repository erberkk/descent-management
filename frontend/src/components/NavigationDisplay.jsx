import { useEffect, useRef } from 'react'

// Canvas dimensions
const W = 560
const H = 540

// Aircraft symbol position (bottom-centre)
const ACX = W / 2
const ACY = H * 0.765

// px per NM
const SCALE = 2.0

// Compass arc radius (centred on aircraft)
const CRAD = 295

const toRad = (d) => (d * Math.PI) / 180

// Convert bearing+distance to canvas coords (track-up orientation)
function toScreen(bearing, dist, track) {
  const rel = toRad(bearing - track)
  return {
    x: ACX + dist * SCALE * Math.sin(rel),
    y: ACY - dist * SCALE * Math.cos(rel),
  }
}

// ── Default state so we can render something before WS connects ──────────
const DEFAULT = {
  gs: 478, tas: 464,
  wind_dir: 234, wind_speed: 22,
  track: 87, heading: 87,
  active_wp_name: 'ABHEDVI', active_wp_bearing: 87,
  active_wp_distance: 5.8, active_wp_eta: '18:31',
  vor1_id: 'BLH', vor1_distance: 17.3, vor1_bearing: 180,
  drift: -13,
  waypoints: [
    { name: 'ABBLH',   bearing: 267, distance: 15,  is_airport: false, is_active: false, is_passed: true },
    { name: 'ABHEDVI', bearing: 87,  distance: 5.8, is_airport: false, is_active: true,  is_passed: false },
    { name: 'ABHOBOL', bearing: 87,  distance: 38,  is_airport: false, is_active: false, is_passed: false },
    { name: 'KPHX',    bearing: 56,  distance: 57,  is_airport: true,  is_active: false, is_passed: false },
    { name: 'KIWA',    bearing: 64,  distance: 73,  is_airport: true,  is_active: false, is_passed: false },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
export function NavigationDisplay({ state }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    render(ctx, state ?? DEFAULT)
  }, [state])

  return <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block' }} />
}

// ═══════════════════════════════════════════════════════════════════════════
function render(ctx, s) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const track = s.track ?? 87

  drawRangeRings(ctx, track)
  drawRoute(ctx, s, track)
  drawCompassArc(ctx, track)
  drawAircraftSymbol(ctx)
  drawWindArrow(ctx, s.wind_dir, s.wind_speed, track)
  drawTextOverlays(ctx, s)
}

// ── Range rings ─────────────────────────────────────────────────────────────
function drawRangeRings(ctx, track) {
  ctx.save()
  ctx.strokeStyle = '#00BB00'
  ctx.setLineDash([8, 6])
  ctx.lineWidth = 1.5

  for (const nm of [80, 120]) {
    const r = nm * SCALE
    ctx.beginPath()
    ctx.arc(ACX, ACY, r, Math.PI, 0, true)   // upper semicircle
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()

  // Labels on each side
  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#00CC00'
  ctx.textAlign = 'right'
  ctx.fillText('80',  ACX - 80  * SCALE - 4, ACY + 4)
  ctx.fillText('120', ACX - 120 * SCALE - 4, ACY + 4)
  ctx.textAlign = 'left'
  ctx.fillText('80',  ACX + 80  * SCALE + 4, ACY + 4)
  ctx.fillText('120', ACX + 120 * SCALE + 4, ACY + 4)
  ctx.textAlign = 'left'
}

// ── Route line + waypoint symbols ───────────────────────────────────────────
function drawRoute(ctx, s, track) {
  const { waypoints } = s
  if (!waypoints?.length) return

  // Collect route waypoints in order (non-airport), including aircraft pos
  const route = waypoints.filter((w) => !w.is_airport).sort((a, b) => {
    // passed ones come first (behind aircraft), then ahead by distance
    if (a.is_passed && !b.is_passed) return -1
    if (!a.is_passed && b.is_passed) return 1
    return a.distance - b.distance
  })

  // Build screen points (insert aircraft at origin)
  const pts = route.map((w) => ({ ...toScreen(w.bearing, w.distance, track), wp: w }))
  // Insert aircraft pos between passed and ahead
  const passedIdx = pts.filter((p) => p.wp.is_passed).length
  pts.splice(passedIdx, 0, { x: ACX, y: ACY, wp: null })

  // Draw route line
  ctx.save()
  ctx.strokeStyle = '#00CC00'
  ctx.lineWidth = 2
  ctx.setLineDash([])
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.restore()

  // Draw waypoint symbols
  for (const w of waypoints) {
    const { x, y } = toScreen(w.bearing, w.distance, track)
    if (w.is_airport) {
      drawAirportSymbol(ctx, x, y, w.name)
    } else {
      drawWaypointDiamond(ctx, x, y, w.name, w.is_active, w.is_passed)
    }
  }
}

function drawAirportSymbol(ctx, x, y, name) {
  ctx.save()
  ctx.fillStyle = '#FF69B4'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✦', x, y)
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(name, x + 8, y - 6)
  ctx.restore()
}

function drawWaypointDiamond(ctx, x, y, name, isActive, isPassed) {
  const color = isPassed ? '#559955' : isActive ? '#00FFFF' : '#00CC00'
  const size = 6
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.lineTo(x + size, y)
  ctx.lineTo(x, y + size)
  ctx.lineTo(x - size, y)
  ctx.closePath()
  ctx.stroke()

  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, x + size + 4, y)
  ctx.restore()
}

// ── Compass arc ─────────────────────────────────────────────────────────────
function drawCompassArc(ctx, track) {
  // Draw the arc line
  ctx.save()
  ctx.strokeStyle = '#DDDDDD'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(ACX, ACY, CRAD, Math.PI, 0, true)
  ctx.stroke()

  // Tick marks and labels for all bearings visible (track ± 95°)
  for (let bear = 0; bear < 360; bear++) {
    let rel = bear - track
    // Normalise to -180…+180
    while (rel > 180) rel -= 360
    while (rel < -180) rel += 360

    if (Math.abs(rel) > 92) continue  // outside visible arc

    const angle = toRad(rel) - Math.PI / 2   // canvas angle (0 = right)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    let tickLen = 5
    if (bear % 10 === 0) tickLen = 14
    else if (bear % 5 === 0) tickLen = 9

    const ox = ACX + CRAD * cos
    const oy = ACY + CRAD * sin
    const ix = ACX + (CRAD - tickLen) * cos
    const iy = ACY + (CRAD - tickLen) * sin

    ctx.strokeStyle = '#CCCCCC'
    ctx.lineWidth = bear % 10 === 0 ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ix, iy)
    ctx.stroke()

    if (bear % 10 === 0) {
      const label = String(bear / 10).padStart(2, '0')
      const lx = ACX + (CRAD - 26) * cos
      const ly = ACY + (CRAD - 26) * sin
      ctx.save()
      ctx.translate(lx, ly)
      ctx.rotate(angle + Math.PI / 2)
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = '#CCCCCC'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }

  // Heading bug – yellow line at top of arc (current track)
  const bugAngle = -Math.PI / 2  // straight up = current track
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(ACX + CRAD * Math.cos(bugAngle), ACY + CRAD * Math.sin(bugAngle))
  ctx.lineTo(ACX + (CRAD - 22) * Math.cos(bugAngle), ACY + (CRAD - 22) * Math.sin(bugAngle))
  ctx.stroke()

  // Small triangle marker at the top
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(ACX, ACY - CRAD + 2)
  ctx.lineTo(ACX - 6, ACY - CRAD + 16)
  ctx.lineTo(ACX + 6, ACY - CRAD + 16)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ── Aircraft symbol (yellow cross + circle) ─────────────────────────────────
function drawAircraftSymbol(ctx) {
  ctx.save()
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2.5

  // Wings
  ctx.beginPath()
  ctx.moveTo(ACX - 18, ACY)
  ctx.lineTo(ACX + 18, ACY)
  ctx.stroke()

  // Body (nose up)
  ctx.beginPath()
  ctx.moveTo(ACX, ACY + 8)
  ctx.lineTo(ACX, ACY - 18)
  ctx.stroke()

  // Tail
  ctx.beginPath()
  ctx.moveTo(ACX - 10, ACY + 8)
  ctx.lineTo(ACX + 10, ACY + 8)
  ctx.stroke()

  // Centre dot
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.arc(ACX, ACY, 3, 0, Math.PI * 2)
  ctx.fill()

  // Small circle
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(ACX, ACY, 7, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

// ── Wind arrow (top-left corner) ────────────────────────────────────────────
function drawWindArrow(ctx, windDir, windSpd, track) {
  const ax = 36, ay = 38
  const len = 28
  // Direction the wind blows TO (i.e., where it pushes the aircraft)
  const windTo = windDir + 180
  const rel = toRad(windTo - track)
  const dx = Math.sin(rel) * len
  const dy = -Math.cos(rel) * len

  ctx.save()
  ctx.strokeStyle = '#00CC00'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax + dx, ay + dy)
  ctx.stroke()

  // Arrowhead
  const angle = Math.atan2(dy, dx)
  ctx.fillStyle = '#00CC00'
  ctx.beginPath()
  ctx.moveTo(ax + dx, ay + dy)
  ctx.lineTo(ax + dx - 8 * Math.cos(angle - 0.4), ay + dy - 8 * Math.sin(angle - 0.4))
  ctx.lineTo(ax + dx - 8 * Math.cos(angle + 0.4), ay + dy - 8 * Math.sin(angle + 0.4))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Text overlays ────────────────────────────────────────────────────────────
function drawTextOverlays(ctx, s) {
  const {
    gs, tas, wind_dir, wind_speed,
    active_wp_name, active_wp_bearing, active_wp_distance, active_wp_eta,
    vor1_id, vor1_distance, vor1_bearing, drift,
    track
  } = s

  ctx.save()

  // ── Top-left: GS / TAS ──
  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  ctx.fillText('GS', 8, 16)
  ctx.fillStyle = '#00FF00'
  ctx.fillText(` ${gs ?? '--'} `, 28, 16)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText('TAS', 82, 16)
  ctx.fillStyle = '#00FF00'
  ctx.fillText(` ${tas ?? '--'}`, 106, 16)

  // Wind vector text (below GS/TAS)
  ctx.fillStyle = '#00FF00'
  ctx.font = '12px monospace'
  ctx.fillText(`${String(wind_dir ?? '--').padStart(3, '0')}/${wind_speed ?? '--'}`, 8, 32)

  // ── Top-right: active waypoint ──
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#00FF00'
  ctx.fillText(`${active_wp_name ?? '----'}`, W - 6, 16)
  ctx.font = '12px monospace'
  ctx.fillStyle = '#00FF00'
  ctx.fillText(`${String(active_wp_bearing ?? '---').padStart(3, '0')}°`, W - 6, 30)
  ctx.fillStyle = '#00FF00'
  ctx.fillText(`${active_wp_distance ?? '--.-'} NM`, W - 6, 44)
  ctx.fillStyle = '#00FF00'
  ctx.fillText(`${active_wp_eta ?? '--:--'}`, W - 6, 58)

  // ── Drift indicator near aircraft ──
  const driftVal = drift ?? 0
  ctx.textAlign = 'center'
  ctx.font = 'bold 12px monospace'
  ctx.fillStyle = '#00FF00'
  if (driftVal !== 0) {
    const sign = driftVal > 0 ? '+' : ''
    ctx.fillText(`${sign}${Math.round(driftVal)}`, ACX, ACY + 28)
  }

  // Track angle error label
  ctx.fillStyle = '#00FF00'
  ctx.font = '11px monospace'
  ctx.fillText('+09', ACX - 22, ACY + 16)
  ctx.fillText('-13', ACX + 22, ACY + 16)

  // ── Bottom-left: VOR 1 ──
  ctx.textAlign = 'left'
  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText('▲ VOR1', 8, H - 36)
  ctx.fillStyle = '#00FF00'
  ctx.fillText(vor1_id ?? '---', 8, H - 22)
  ctx.fillText(`${vor1_distance ?? '--.-'} NM`, 8, H - 8)

  // ── Mode indicator (bottom right) ──
  ctx.textAlign = 'right'
  ctx.font = '12px monospace'
  ctx.fillStyle = '#00AA00'
  ctx.fillText('ARC', W - 8, H - 8)

  ctx.restore()
}
