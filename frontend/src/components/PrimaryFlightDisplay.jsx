import { useEffect, useRef } from 'react'

const W = 560
const H = 540

const toRad = (d) => (d * Math.PI) / 180

// Attitude Indicator geometry
const AI_CX = 248          // centre x
const AI_CY = 288          // centre y
const AI_W  = 340          // width
const AI_H  = 290          // height
const AI_X  = AI_CX - AI_W / 2
const AI_Y  = AI_CY - AI_H / 2
const PITCH_PX = 28        // px per degree of pitch

// Left box geometry (mirrors altitude tape)
const LB_W   = 62
const LB_H   = 290   // = AI_H
const LB_X   = 78 - LB_W - 12   // AI_X - LB_W - 12 (mirrors right gap)

// Altitude tape geometry
const ALT_X  = 430
const ALT_Y  = AI_Y
const ALT_W  = 62
const ALT_H  = AI_H
const ALT_RANGE = 2000     // ft visible above and below centre
const ALT_PX = (290 / 2) / ALT_RANGE  // px per ft  (= 0.0725)

// Speed (Mach) tape geometry – horizontal at bottom
const SPD_X  = AI_X
const SPD_Y  = AI_Y + AI_H + 10
const SPD_W  = AI_W
const SPD_H  = 42
const SPD_PX_MACH = 280   // total tape width for Mach 0…1.2

// Default state for initial render
const DEFAULT = {
  pitch: 2.5, roll: 0,
  altitude: 27000, sel_alt: 27000, vs: 0,
  mach: 0.788, tas: 300, gs: 300,
  spd_mode: 'MACH', alt_mode: 'ALTCRZ', lat_mode: 'NAV',
  ap_num: 2, fd1: true, fd2: true, athr: true,
  baro_std: true, baro_value: 1013.25,
}

// ═══════════════════════════════════════════════════════════════════════════
export function PrimaryFlightDisplay({ state, selAlt, selVs }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    render(ctx, state ?? DEFAULT, selAlt, selVs)
  }, [state, selAlt, selVs])

  return <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block' }} />
}

// ═══════════════════════════════════════════════════════════════════════════
function render(ctx, s, selAlt, selVs) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  drawModeAnnunciators(ctx, s)
  drawAPStatus(ctx, s)
  drawLeftBox(ctx, s.actual_spd ?? s.tas ?? 300)
  drawAttitudeIndicator(ctx, s.pitch ?? 2.5, s.roll ?? 0)
  drawAltitudeTape(ctx, s.altitude ?? 27000, selAlt ?? s.sel_alt ?? 36000, selVs ?? s.vs ?? 0)
  drawHeadingTape(ctx, s.heading ?? 87)
  drawBaroIndicator(ctx, s.baro_std, s.baro_value)
}

// Armed modes end with '*' → render in blue; active modes → green
function modeColor(modeStr) {
  if (!modeStr) return '#00FF00'
  return modeStr.endsWith('*') ? '#00BFFF' : '#00FF00'
}
function modeLabel(modeStr) {
  return (modeStr ?? '').replace('*', '')
}

// ── Mode annunciators (top bar) ─────────────────────────────────────────────
function drawModeAnnunciators(ctx, s) {
  const y = 18
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'

  // Speed mode
  const spd = s.spd_mode ?? 'MACH'
  ctx.fillStyle = modeColor(spd)
  ctx.fillText(modeLabel(spd), AI_X + 60, y)

  // Separators
  ctx.fillStyle = '#555'
  ctx.fillText('|', AI_X + 120, y)
  ctx.fillText('|', AI_X + 240, y)

  // Altitude mode
  const alt = s.alt_mode ?? 'ALTCRZ'
  ctx.fillStyle = modeColor(alt)
  ctx.fillText(modeLabel(alt), AI_X + 180, y)

  // Lateral mode
  const lat = s.lat_mode ?? 'NAV'
  ctx.fillStyle = modeColor(lat)
  ctx.fillText(modeLabel(lat), AI_X + 300, y)

  // Underline bar
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(AI_X, y + 6)
  ctx.lineTo(AI_X + AI_W, y + 6)
  ctx.stroke()
}

// ── AP / FD / A-THR status (top right) ─────────────────────────────────────
function drawAPStatus(ctx, s) {
  const x = ALT_X + ALT_W - 4
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px monospace'

  ctx.fillStyle = '#00FFFF'
  ctx.fillText(`AP${s.ap_num ?? 2}`, x, 18)

  ctx.fillStyle = '#00FFFF'
  ctx.fillText(`${s.fd1 ? '1' : '-'} FD ${s.fd2 ? '2' : '-'}`, x, 34)

  ctx.fillStyle = '#00FFFF'
  ctx.fillText('A/THR', x, 50)
}

// ── Attitude Indicator ──────────────────────────────────────────────────────
function drawAttitudeIndicator(ctx, pitch, roll) {
  ctx.save()

  // Clip to rounded rectangle
  ctx.beginPath()
  roundRect(ctx, AI_X, AI_Y, AI_W, AI_H, 12)
  ctx.clip()

  // Move origin to AI centre
  ctx.translate(AI_CX, AI_CY)

  // Apply roll rotation (positive roll = right bank = clockwise in canvas)
  ctx.rotate(toRad(roll))

  // Apply pitch offset (pitch > 0 → horizon moves DOWN → more sky)
  const pitchOffset = pitch * PITCH_PX
  ctx.translate(0, pitchOffset)

  // ── Sky ──
  ctx.fillStyle = '#3A78C2'
  ctx.fillRect(-W, -H * 2, W * 2, H * 2)

  // ── Earth ──
  ctx.fillStyle = '#6B2530'
  ctx.fillRect(-W, 0, W * 2, H * 2)

  // ── Horizon line ──
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-W, 0)
  ctx.lineTo(W, 0)
  ctx.stroke()

  // ── Pitch ladder ──
  for (let deg = -30; deg <= 30; deg += 5) {
    if (deg === 0) continue
    const y = -deg * PITCH_PX
    const isMain = deg % 10 === 0
    const halfLen = isMain ? 80 : 45
    const absD = Math.abs(deg)

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = isMain ? 2 : 1.5
    ctx.beginPath()
    ctx.moveTo(-halfLen, y)
    ctx.lineTo(halfLen, y)
    ctx.stroke()

    // End ticks (point toward horizon)
    const tickDir = deg > 0 ? 8 : -8
    ctx.beginPath()
    ctx.moveTo(-halfLen, y)
    ctx.lineTo(-halfLen, y + tickDir)
    ctx.moveTo(halfLen, y)
    ctx.lineTo(halfLen, y + tickDir)
    ctx.stroke()

    if (isMain) {
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(absD), -halfLen - 22, y)
      ctx.fillText(String(absD), halfLen + 22, y)
    }
  }

  ctx.restore()  // removes clip + transforms

  // ── Aircraft reference symbol (fixed, not rotated) ──
  drawAircraftRef(ctx)

  // ── Roll indicator arc (fixed at top of AI) ──
  drawRollIndicator(ctx, roll)
}

function drawAircraftRef(ctx) {
  ctx.save()
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 3

  // Left wing
  ctx.beginPath()
  ctx.moveTo(AI_CX - 55, AI_CY)
  ctx.lineTo(AI_CX - 15, AI_CY)
  ctx.stroke()

  // Right wing
  ctx.beginPath()
  ctx.moveTo(AI_CX + 15, AI_CY)
  ctx.lineTo(AI_CX + 55, AI_CY)
  ctx.stroke()

  // Centre dot
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.arc(AI_CX, AI_CY, 5, 0, Math.PI * 2)
  ctx.fill()

  // Body stub
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(AI_CX, AI_CY - 6)
  ctx.lineTo(AI_CX, AI_CY + 6)
  ctx.stroke()

  // Horizon reference brackets
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#FFD700'
  // Left bracket ─┐
  ctx.beginPath()
  ctx.moveTo(AI_CX - 55, AI_CY)
  ctx.lineTo(AI_CX - 55, AI_CY - 8)
  ctx.stroke()
  // Right bracket └─
  ctx.beginPath()
  ctx.moveTo(AI_CX + 55, AI_CY)
  ctx.lineTo(AI_CX + 55, AI_CY - 8)
  ctx.stroke()

  ctx.restore()
}

function drawRollIndicator(ctx, roll) {
  const cx = AI_CX
  const cy = AI_Y + 6
  const r  = 26

  ctx.save()
  ctx.translate(cx, cy + r)

  // Scale arc (fixed)
  ctx.strokeStyle = '#CCCCCC'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, 0, r, toRad(210), toRad(330))
  ctx.stroke()

  const angles = [0, 10, 20, 30, 45, 60]
  for (const a of angles) {
    for (const sign of a === 0 ? [0] : [-1, 1]) {
      const angleDeg = 270 + sign * a
      const rad = toRad(angleDeg)
      const len = a % 30 === 0 ? 8 : 5
      ctx.beginPath()
      ctx.moveTo(r * Math.cos(rad), r * Math.sin(rad))
      ctx.lineTo((r - len) * Math.cos(rad), (r - len) * Math.sin(rad))
      ctx.stroke()
    }
  }

  // Roll pointer triangle (rotates with roll)
  ctx.rotate(toRad(roll))
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(0, -r + 2)
  ctx.lineTo(-5, -r + 12)
  ctx.lineTo(5, -r + 12)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ── Altitude tape (right side) ──────────────────────────────────────────────
function drawAltitudeTape(ctx, altitude, selAlt, vs) {
  const cx = ALT_X
  const cy = ALT_Y
  const centreY = cy + ALT_H / 2

  // Background
  ctx.fillStyle = '#111'
  ctx.fillRect(cx, cy, ALT_W, ALT_H)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(cx, cy, ALT_W, ALT_H)

  // Clip to tape area
  ctx.save()
  ctx.beginPath()
  ctx.rect(cx, cy, ALT_W, ALT_H)
  ctx.clip()

  // Snap grid to nearest 100ft and iterate ±2000ft
  const firstAlt = Math.ceil((altitude - ALT_RANGE) / 100) * 100
  const lastAlt  = Math.floor((altitude + ALT_RANGE) / 100) * 100

  for (let a = firstAlt; a <= lastAlt; a += 100) {
    const yPos = centreY - (a - altitude) * ALT_PX
    const is500 = a % 500 === 0

    // Tick mark
    ctx.strokeStyle = '#888'
    ctx.lineWidth = is500 ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(cx, yPos)
    ctx.lineTo(cx + (is500 ? 12 : 7), yPos)
    ctx.stroke()

    // Label every 500 ft
    if (is500) {
      ctx.font = '11px monospace'
      ctx.fillStyle = '#CCCCCC'
      ctx.textAlign = 'left'
      ctx.fillText(String(Math.round(a)), cx + 14, yPos + 4)
    }
  }

  // Selected altitude bug (blue chevron on left edge)
  const selY = centreY - (selAlt - altitude) * ALT_PX
  if (selY >= cy && selY <= cy + ALT_H) {
    ctx.strokeStyle = '#00BFFF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, selY)
    ctx.lineTo(cx + 14, selY - 7)
    ctx.lineTo(cx + 14, selY + 7)
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()

  // ── Current altitude pointer box (centre) ──
  const pY = centreY
  ctx.fillStyle = '#222'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, cx - 2, pY - 14, ALT_W + 4, 28, 3)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 14px monospace'
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.round(altitude / 20) * 20).padStart(5, ' '), cx + ALT_W / 2, pY + 5)

  // ── Vertical speed indicator (outer right of altitude tape) ──
  drawVSI(ctx, vs, cx + ALT_W + 4, cy)
}

// ── Left speed tape (TAS) ────────────────────────────────────────────────────
function drawLeftBox(ctx, tas) {
  const x = LB_X
  const y = AI_Y
  const w = LB_W
  const h = LB_H
  const visibleRange = 80        // kt visible (40 above + 40 below)
  const pxPerKt = h / visibleRange
  const centreY = y + h / 2

  // Background
  ctx.fillStyle = '#111'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)

  // Clip to tape area
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  // Draw speed ticks and labels every 10 kt
  const firstSpd = Math.ceil((tas - visibleRange / 2) / 10) * 10
  for (let spd = firstSpd; spd <= tas + visibleRange / 2; spd += 10) {
    const yPos = centreY - (spd - tas) * pxPerKt

    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + w, yPos)
    ctx.lineTo(x + w - 10, yPos)
    ctx.stroke()

    ctx.font = '13px monospace'
    ctx.fillStyle = '#DDDDDD'
    ctx.textAlign = 'right'
    ctx.fillText(String(spd), x + w - 12, yPos + 5)
  }

  ctx.restore()

  // Current speed pointer box (centre)
  const pY = centreY
  ctx.fillStyle = '#222'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, x - 2, pY - 14, w + 4, 28, 3)
  ctx.fill()
  ctx.stroke()

  // Speed readout
  const spdStr = String(Math.round(tas)).padStart(3, ' ')
  ctx.font = 'bold 15px monospace'
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.fillText(spdStr, x + w / 2, pY + 5)
}

function drawVSI(ctx, vs, x, y) {
  const h = ALT_H
  const w = 20

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(x, y, w, h)

  // Scale: -2000 to +2000 fpm
  const maxVS = 2000
  const centreY = y + h / 2
  const scale = (h / 2) / maxVS
  const vsClamp = Math.max(-maxVS, Math.min(maxVS, vs))

  // Ticks at ±500, ±1000, ±2000
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1
  for (const v of [500, 1000, 2000]) {
    for (const s of [-1, 1]) {
      const ty = centreY - s * v * scale
      ctx.beginPath()
      ctx.moveTo(x, ty)
      ctx.lineTo(x + 8, ty)
      ctx.stroke()
      ctx.font = '9px monospace'
      ctx.fillStyle = '#888'
      ctx.textAlign = 'left'
      ctx.fillText(String(v / 100), x + 10, ty + 4)
    }
  }

  // VS pointer
  if (vs !== 0) {
    const vsY = centreY - vsClamp * scale
    ctx.fillStyle = '#00FF00'
    ctx.beginPath()
    ctx.moveTo(x, vsY)
    ctx.lineTo(x + 14, vsY - 4)
    ctx.lineTo(x + 14, vsY + 4)
    ctx.closePath()
    ctx.fill()
  }

  // Centre line
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, centreY)
  ctx.lineTo(x + w, centreY)
  ctx.stroke()
}

// ── Heading tape (horizontal at bottom) ─────────────────────────────────────
function drawHeadingTape(ctx, heading) {
  const x = SPD_X
  const y = SPD_Y
  const w = SPD_W
  const h = SPD_H
  const centreX = x + w / 2
  const VISIBLE_DEG = 30          // degrees shown each side
  const PX_PER_DEG = w / 2 / VISIBLE_DEG   // scale to fit exactly ±30°

  // Background
  ctx.fillStyle = '#111'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)

  // Clip to tape area
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  // Draw ticks and labels — iterate degrees in visible range
  for (let offset = -VISIBLE_DEG; offset <= VISIBLE_DEG; offset += 1) {
    const deg = ((Math.round(heading) + offset) % 360 + 360) % 360
    const xPos = centreX + offset * PX_PER_DEG

    if (deg % 10 === 0) {
      // Major tick + label
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xPos, y + h - 14)
      ctx.lineTo(xPos, y + h)
      ctx.stroke()

      ctx.font = '12px monospace'
      ctx.fillStyle = '#DDDDDD'
      ctx.textAlign = 'center'
      ctx.fillText(String(deg).padStart(3, '0'), xPos, y + h - 16)
    } else if (deg % 5 === 0) {
      // Minor tick
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xPos, y + h - 8)
      ctx.lineTo(xPos, y + h)
      ctx.stroke()
    }
  }

  ctx.restore()

  // Current heading pointer — yellow triangle at top centre
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(centreX, y)
  ctx.lineTo(centreX - 7, y + 14)
  ctx.lineTo(centreX + 7, y + 14)
  ctx.closePath()
  ctx.fill()

  // Current heading readout box at bottom centre
  const boxW = 44
  const boxH = 20
  const boxX = centreX - boxW / 2
  const boxY = y + h - boxH - 2
  ctx.fillStyle = '#222'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  roundRect(ctx, boxX, boxY, boxW, boxH, 3)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#FFD700'
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.round(heading) % 360).padStart(3, '0'), centreX, boxY + 14)
}

// ── Barometric indicator (bottom-right) ─────────────────────────────────────
function drawBaroIndicator(ctx, baroStd, baroValue) {
  const label = baroStd ? 'STD' : String(Math.round(baroValue))
  const x = ALT_X + ALT_W - 38
  const y = SPD_Y + SPD_H + 6

  ctx.fillStyle = '#002200'
  ctx.strokeStyle = '#FFFF00'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, x, y, 44, 20, 3)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#FFFF00'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + 22, y + 14)
}

// ── Utility: rounded rectangle path ─────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
