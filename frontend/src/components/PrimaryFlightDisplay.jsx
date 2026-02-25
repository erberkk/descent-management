import { useEffect, useRef } from 'react'

const W = 560
const H = 540

// Attitude Indicator geometry
const AI_W  = 340          // width
const AI_H  = 290          // height
const AI_X  = 78           // left edge (AI_CX - AI_W/2)
const AI_Y  = 143          // top edge  (AI_CY - AI_H/2)

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
const SQ_OFFSET = 250 * ALT_PX   // px distance to first ±250 ft line

function targetSquareY(vs) {
  return vs > 0 ? REF_CY - SQ_OFFSET
       : vs < 0 ? REF_CY + SQ_OFFSET
       :          REF_CY
}

export function PrimaryFlightDisplay({ state, selAlt, selVs }) {
  const canvasRef  = useRef(null)
  const stateRef   = useRef(state)
  const selAltRef  = useRef(selAlt)
  const selVsRef   = useRef(selVs)
  const animRef    = useRef({ currentY: REF_CY, startY: REF_CY, targetY: REF_CY, startTime: null })
  const rafRef     = useRef(null)

  // Keep latest props accessible inside the RAF loop without re-subscribing
  stateRef.current  = state
  selAltRef.current = selAlt
  selVsRef.current  = selVs

  // Decide square target on every state update:
  // – Return to base when ≤3 s remain to target alt (2 s anim + 1 s buffer)
  // – Otherwise track vs direction
  useEffect(() => {
    const vs       = state?.vs      ?? 0
    const altitude = state?.altitude ?? 0
    const target   = selAlt ?? state?.sel_alt ?? altitude

    let newTarget
    if (vs === 0) {
      newTarget = REF_CY
    } else {
      const secsLeft = (Math.abs(altitude - target) / Math.abs(vs)) * 60
      newTarget = secsLeft <= 3 ? REF_CY : targetSquareY(vs)
    }

    const anim = animRef.current
    if (Math.abs(newTarget - anim.targetY) > 0.1) {
      anim.startY    = anim.currentY
      anim.targetY   = newTarget
      anim.startTime = null
    }
  }, [state, selAlt])

  // Continuous RAF render loop
  useEffect(() => {
    function loop(timestamp) {
      const anim = animRef.current
      if (Math.abs(anim.currentY - anim.targetY) > 0.1) {
        if (anim.startTime === null) anim.startTime = timestamp
        const t    = Math.min((timestamp - anim.startTime) / 2000, 1)
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t   // ease-in-out
        anim.currentY = anim.startY + (anim.targetY - anim.startY) * ease
        if (t >= 1) anim.currentY = anim.targetY
      }

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        render(ctx, stateRef.current ?? DEFAULT, selAltRef.current, selVsRef.current, anim.currentY)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block' }} />
}

// ═══════════════════════════════════════════════════════════════════════════
function render(ctx, s, selAlt, selVs, squareY) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  drawModeAnnunciators(ctx, s)
  drawAPStatus(ctx, s)
  drawLeftBox(ctx, s.actual_spd ?? s.tas ?? 300)
  drawAttitudeIndicator(ctx)
  drawCentreHorizonLine(ctx, squareY ?? REF_CY)
  drawStaticRefLines(ctx)
  drawHorizonArc(ctx)
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
function drawAttitudeIndicator(ctx) {
  const x1 = LB_X + LB_W   // right edge of speed box
  const x2 = ALT_X          // left edge of altitude box
  const w  = x2 - x1
  const yMid = AI_Y + AI_H / 2

  // Sky – blue upper half
  ctx.fillStyle = '#3A78C2'
  ctx.fillRect(x1, AI_Y, w, yMid - AI_Y)

  // Earth – light brown lower half down to heading tape
  ctx.fillStyle = '#C4A060'
  ctx.fillRect(x1, yMid, w, SPD_Y - yMid)
}

// ── Centre horizon line + vertical cross ────────────────────────────────────
function drawCentreHorizonLine(ctx, squareY) {
  const y  = AI_Y + AI_H / 2         // vertical centre of the AI area
  const x1 = LB_X + LB_W            // right edge of speed box
  const x2 = ALT_X                   // left edge of altitude box
  const xm = (x1 + x2) / 2          // midpoint of horizontal line

  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2

  // Horizontal line
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()

  // Vertical line: from top of boxes down to the heading tape
  ctx.beginPath()
  ctx.moveTo(xm, AI_Y)
  ctx.lineTo(xm, SPD_Y)
  ctx.stroke()

  // Green square (animated y position)
  const sq = 10
  ctx.fillStyle = '#00FF00'
  ctx.fillRect(xm - sq / 2, squareY - sq / 2, sq, sq)
}

// ── Static reference line grid ───────────────────────────────────────────────
// Pixel positions fixed at initial conditions: alt=27000, hdg=87.
// REF_CY is the centre y; ALT_PX converts ft offset to px.
// REF_CX is the centre x; REF_PPD converts heading degrees to px.
const REF_CY  = AI_Y + AI_H / 2          // 288
const REF_CX  = AI_X + AI_W / 2          // 248
const REF_PPD = (SPD_W / 2) / 30         // px per degree ≈ 5.667

function refY(alt)  { return REF_CY - (alt - 26000) * ALT_PX }
function refX(hdg)  { return REF_CX + (hdg - 87)    * REF_PPD }

function drawStaticRefLines(ctx) {
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2

  // Long lines (hdg 080–094) at 27000, 26500, 25500, 25000
  for (const alt of [27000, 26500, 25500, 25000]) {
    ctx.beginPath()
    ctx.moveTo(refX(80), refY(alt))
    ctx.lineTo(refX(94), refY(alt))
    ctx.stroke()
  }

  // Short lines (hdg 084–090) at 26750, 26250, 25750, 25250
  for (const alt of [26750, 26250, 25750, 25250]) {
    ctx.beginPath()
    ctx.moveTo(refX(84), refY(alt))
    ctx.lineTo(refX(90), refY(alt))
    ctx.stroke()
  }
}

// ── Horizon arc ─────────────────────────────────────────────────────────────
// Static: endpoints at hdg 062 & 112 on the baseline, peak at alt 27250.
// All pixel positions fixed at initial conditions (alt=27000, hdg=87).
function drawHorizonArc(ctx) {
  const arcCX = REF_CX                      // symmetric about hdg 87
  const halfW = 25 * REF_PPD               // half of 50° span (hdg 062–112)
  const yBase = REF_CY                      // baseline y (main horizontal line)
  const yPeak = refY(27250)                 // fixed peak y

  const h    = yBase - yPeak               // arc height (px)
  const dy   = (halfW * halfW - h * h) / (2 * h)
  const yCtr = yBase + dy
  const R    = Math.sqrt(halfW * halfW + dy * dy)
  const aStart = Math.atan2(yBase - yCtr, -halfW)
  const aEnd   = Math.atan2(yBase - yCtr,  halfW)

  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(arcCX, yCtr, R, aEnd, aStart, true)
  ctx.stroke()
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
