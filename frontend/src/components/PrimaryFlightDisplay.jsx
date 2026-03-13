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
const ALT_RANGE = 570      // ft visible above and below centre (extra margin for edge labels)
const ALT_PX = (290 / 2) / ALT_RANGE  // px per ft  (≈ 0.254)

// Attitude indicator ref-line scale (independent of altitude tape)
const AI_PX = (290 / 2) / 2000        // px per ft for AI elements (= 0.0725)

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
  mach: 0.788, tas: 465, ias: 304, gs: 445,
  spd_mode: 'MACH', alt_mode: 'ALTCRZ', lat_mode: 'NAV',
  ap_num: 2, fd1: true, fd2: true, athr: true,
  baro_std: true, baro_value: 1013.25,
  crossover_ft: 27000,
  n1: 70.0,
}

// ═══════════════════════════════════════════════════════════════════════════
const SQ_OFFSET = 250 * AI_PX    // px distance to first ±250 ft line

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

  drawFMA(ctx, s)
  drawEngineGauges(ctx, s.n1 ?? 70)
  drawAPStatus(ctx, s)
  drawLeftBox(ctx, s.ias ?? s.actual_spd ?? 304, s.mach ?? 0.788, s.vmo ?? 350, s.vls ?? 201, s.alpha_prot ?? 177, s.alpha_max ?? 162, s.spd_trend ?? 0)
  drawAttitudeIndicator(ctx, s.pitch ?? 2.5)
  drawBankArc(ctx)
  drawAircraftSymbol(ctx)
  drawFlightDirector(ctx, squareY ?? REF_CY)
  drawAltitudeTape(ctx, s.altitude ?? 27000, selAlt ?? s.sel_alt ?? 36000, s.vs ?? 0)
  drawHeadingTape(ctx, s.heading ?? 87)
  drawBaroIndicator(ctx, s.baro_std, s.baro_value)
}

// ── FMA — Flight Mode Annunciator ───────────────────────────────────────────
//
//  ┌──────────────┬──────────────┬──────────────┐  y=4
//  │  A/THR       │   VERTICAL   │   LATERAL    │  active row (50px)
//  │  ┌───────┐   │  ┌────────┐  │  ┌───────┐   │
//  │  │ SPEED │   │  │OP DES  │  │  │  HDG  │   │
//  │  └───────┘   │  └────────┘  │  └───────┘   │
//  │              │  -1800       │              │
//  ├──────────────┼──────────────┼──────────────┤  y=54
//  │              │     ALT      │              │  armed row (22px)
//  └──────────────┴──────────────┴──────────────┘  y=76
//
function drawFMA(ctx, s) {
  const FX = AI_X          // 78
  const FY = 4
  const FW = AI_W          // 340
  const FH = 72
  const COL = FW / 3       // ≈113
  const ACTIVE_H = 50
  const ARMED_H  = FH - ACTIVE_H   // 22

  // Background
  ctx.fillStyle = '#0c0c0c'
  ctx.fillRect(FX, FY, FW, FH)

  // Outer border
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 1
  ctx.strokeRect(FX, FY, FW, FH)

  // Column dividers
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(FX + COL * i, FY)
    ctx.lineTo(FX + COL * i, FY + FH)
    ctx.stroke()
  }

  // Active / armed row separator
  ctx.beginPath()
  ctx.moveTo(FX, FY + ACTIVE_H)
  ctx.lineTo(FX + FW, FY + ACTIVE_H)
  ctx.stroke()

  // Column centre X values
  const CX = [FX + COL * 0.5, FX + COL * 1.5, FX + COL * 2.5]

  // Draw a bordered mode box in the active row
  function modeBox(col, label, color) {
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    const tw  = ctx.measureText(label).width
    const bw  = Math.max(tw + 14, 46)
    const bh  = 22
    const bx  = CX[col] - bw / 2
    const by  = FY + 13
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, bw, bh)
    ctx.fillStyle = color
    ctx.fillText(label, CX[col], by + bh - 5)
  }

  // Draw small armed-mode text in the lower row
  function armedText(col, label) {
    ctx.font = '11px monospace'
    ctx.fillStyle = '#00BFFF'
    ctx.textAlign = 'center'
    ctx.fillText(label, CX[col], FY + ACTIVE_H + ARMED_H / 2 + 4)
  }

  const altMode = s.alt_mode ?? 'ALTCRZ'
  const latMode = s.lat_mode ?? 'HDG'

  // ── Col 0 — A/THR ────────────────────────────────────────────────────────
  if (s.athr) {
    modeBox(0, s.spd_mode ?? 'SPEED', '#00FF00')
  }

  // ── Col 1 — Vertical mode ────────────────────────────────────────────────
  const isCapture = altMode === 'ALT*'
  const vColor    = isCapture ? '#00BFFF' : '#00FF00'
  modeBox(1, altMode, vColor)

  // V/S sub-value (FPM) shown below the mode box
  if (altMode === 'V/S') {
    const vs = s.vs ?? 0
    ctx.font = '11px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText((vs >= 0 ? '+' : '') + Math.round(vs), CX[1], FY + 43)
  }

  // ALT armed when actively climbing / descending toward target
  if (['OP CLB', 'OP DES', 'V/S'].includes(altMode)) {
    armedText(1, 'ALT')
  }

  // ── Col 2 — Lateral mode ─────────────────────────────────────────────────
  const lIsArmed = latMode.endsWith('*')
  const lColor   = lIsArmed ? '#00BFFF' : '#00FF00'
  modeBox(2, latMode.replace('*', ''), lColor)
}

// ── N1 engine gauges — two circular dials between FMA and AI ────────────────
//  FMA bottom: y=76   AI top: y=143   → 67 px gap
//  cy=109  R=22  fits with ~11 px margin each side
function drawEngineGauges(ctx, n1) {
  const n1Val   = Math.max(0, Math.min(100, n1 ?? 70))
  const cy      = 109
  const R       = 22
  const cx1     = 183    // left gauge (ENG 1)
  const cx2     = 313    // right gauge (ENG 2)
  // Arc geometry: 270° sweep, start at 135° canvas (≈7:30 clock position)
  const START   = Math.PI * 0.75      // 135°  in radians
  const SWEEP   = Math.PI * 1.5       // 270°

  for (const [cx, label] of [[cx1, 'E1'], [cx2, 'E2']]) {
    // Background arc
    ctx.beginPath()
    ctx.arc(cx, cy, R, START, START + SWEEP)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 5
    ctx.stroke()

    // Tick marks at 0 / 25 / 50 / 75 / 100 %
    ctx.lineWidth = 1
    for (let pct = 0; pct <= 100; pct += 25) {
      const a  = START + SWEEP * pct / 100
      const r0 = R - 6
      ctx.beginPath()
      ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a))
      ctx.lineTo(cx + (R + 3) * Math.cos(a), cy + (R + 3) * Math.sin(a))
      ctx.strokeStyle = '#555'
      ctx.stroke()
    }

    // Value arc — green below 92 %, amber at/above 92 %
    const arcColor = n1Val >= 92 ? '#FFA500' : '#00CC00'
    const endAngle = START + SWEEP * n1Val / 100
    ctx.beginPath()
    ctx.arc(cx, cy, R, START, endAngle)
    ctx.strokeStyle = arcColor
    ctx.lineWidth = 5
    ctx.stroke()

    // N1 value text
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = n1Val >= 92 ? '#FFA500' : '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.fillText(n1Val.toFixed(1), cx, cy + 4)

    // Engine label (small, inside top area)
    ctx.font = '9px monospace'
    ctx.fillStyle = '#888'
    ctx.fillText(label, cx, cy - R - 2)
  }

  // "N1 %" label centred between the two gauges
  ctx.font = '9px monospace'
  ctx.fillStyle = '#AAA'
  ctx.textAlign = 'center'
  ctx.fillText('N1 %', (cx1 + cx2) / 2, cy + 4)
}

// ── AP / FD / A-THR status (right of FMA, top-right corner) ────────────────
function drawAPStatus(ctx, s) {
  const x = ALT_X + ALT_W - 4
  ctx.textAlign = 'right'
  ctx.font = 'bold 12px monospace'

  ctx.fillStyle = '#00FFFF'
  ctx.fillText(`AP${s.ap_num ?? 2}`, x, 84)

  ctx.fillStyle = '#00FFFF'
  ctx.fillText(`${s.fd1 ? '1' : '-'} FD ${s.fd2 ? '2' : '-'}`, x, 100)

  ctx.fillStyle = s.athr ? '#00FFFF' : '#888'
  ctx.fillText('A/THR', x, 116)
}

// Gap between AI and speed/altitude boxes
const AI_GAP = 18

// Attitude indicator edges and centre
const AI_X1  = LB_X + LB_W + AI_GAP       // left edge of AI area
const AI_X2  = ALT_X - AI_GAP             // right edge of AI area
const AI_CX  = (AI_X1 + AI_X2) / 2        // horizontal centre
const AI_CY  = AI_Y + AI_H / 2            // vertical centre
const PPD    = 6                           // pixels per degree of pitch

// Keep REF_CY for squareY animation target
const REF_CY = AI_CY

// ── Attitude Indicator — sky, ground, horizon, pitch ladder ─────────────────
function drawAttitudeIndicator(ctx, pitch) {
  const x1 = AI_X1
  const x2 = AI_X2
  const w  = x2 - x1
  const horizonY = AI_CY + pitch * PPD   // pitch up → horizon moves down

  // Clip to AI area (+ heading gap below)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x1, AI_Y, w, SPD_Y - AI_Y)
  ctx.clip()

  // Sky — blue
  ctx.fillStyle = '#0A6EBD'
  ctx.fillRect(x1, AI_Y, w, Math.max(0, horizonY - AI_Y))

  // Ground — dark brown (extends to heading tape)
  ctx.fillStyle = '#6B3410'
  ctx.fillRect(x1, horizonY, w, Math.max(0, SPD_Y - horizonY))

  // Horizon line
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x1, horizonY)
  ctx.lineTo(x2, horizonY)
  ctx.stroke()

  // ── Pitch ladder (every 2.5°) ──
  const longHalf  = 55     // half-width of 10° lines
  const medHalf   = 30     // half-width of 5° lines
  const shortHalf = 15     // half-width of 2.5° lines

  for (let degX10 = -300; degX10 <= 300; degX10 += 25) {
    if (degX10 === 0) continue
    const deg = degX10 / 10
    const y = horizonY - deg * PPD
    if (y < BANK_BOTTOM || y > AI_Y + AI_H - 10) continue

    const isMajor = degX10 % 100 === 0   // 10°, 20°, 30°
    const is5     = degX10 % 50 === 0     // 5°, 15°, 25°
    const half = isMajor ? longHalf : is5 ? medHalf : shortHalf

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = isMajor ? 2 : is5 ? 1.5 : 1

    // All lines straight
    ctx.beginPath()
    ctx.moveTo(AI_CX - half, y)
    ctx.lineTo(AI_CX + half, y)
    ctx.stroke()

    // Degree labels for 10° lines
    if (isMajor) {
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.abs(deg)), AI_CX - half - 5, y + 4)
      ctx.textAlign = 'left'
      ctx.fillText(String(Math.abs(deg)), AI_CX + half + 5, y + 4)
    }
  }

  ctx.restore()
}

// ── Bank angle arc (top of AI) ──────────────────────────────────────────────
//  A320 layout: white arc with ticks at 10, 20, 30, 45°
//  Yellow triangle (roll index) below arc pointing UP
//  White inverted triangle at 0° on the arc (fixed reference)
// Bank arc geometry — smaller arc so pitch 20° line sits below 45° ticks
const BANK_R      = 75
const BANK_ARC_TOP = AI_Y + 8
const BANK_CY     = BANK_ARC_TOP + BANK_R     // arc centre
// Bottom of 45° ticks (pitch ladder must stay below this)
const BANK_BOTTOM = Math.ceil(BANK_CY - BANK_R * Math.cos(Math.PI / 4)) + 5

function drawBankArc(ctx) {
  const R  = BANK_R
  const cy = BANK_CY

  // Arc spans ±45° from 12 o'clock
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(AI_CX, cy, R, -Math.PI / 2 - Math.PI / 4, -Math.PI / 2 + Math.PI / 4)
  ctx.stroke()

  // Tick marks — extend OUTWARD from arc
  const ticks = [
    { deg: 10, len: 7,  w: 1.5 },
    { deg: 20, len: 7,  w: 1.5 },
    { deg: 30, len: 12, w: 2 },
    { deg: 45, len: 9,  w: 1.5 },
  ]
  for (const { deg, len, w } of ticks) {
    for (const sign of [-1, 1]) {
      const a  = -Math.PI / 2 + sign * deg * Math.PI / 180
      const ax = Math.cos(a)
      const ay = Math.sin(a)
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(AI_CX + R * ax,         cy + R * ay)
      ctx.lineTo(AI_CX + (R + len) * ax, cy + (R + len) * ay)
      ctx.stroke()
    }
  }

  // ── Triangles at 0° — photo reference: ▽ white on top, △ yellow below ──
  const arcTopPt = cy - R               // y where arc meets 0° (top of arc)

  // White triangle ▽ — ABOVE arc, pointing DOWN toward arc
  const whiteH = 10
  const whiteW = 7
  const whiteTop = arcTopPt - whiteH - 2  // sits above arc with 2px gap
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.moveTo(AI_CX, whiteTop + whiteH)    // bottom point (near arc)
  ctx.lineTo(AI_CX - whiteW, whiteTop)    // top-left
  ctx.lineTo(AI_CX + whiteW, whiteTop)    // top-right
  ctx.closePath()
  ctx.fill()

  // Yellow triangle △ — BELOW arc, pointing UP toward arc
  const yellowH = 10
  const yellowW = 7
  const yellowTop = arcTopPt + 2           // sits below arc with 2px gap
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(AI_CX, yellowTop)            // top point (near arc)
  ctx.lineTo(AI_CX - yellowW, yellowTop + yellowH)  // bottom-left
  ctx.lineTo(AI_CX + yellowW, yellowTop + yellowH)  // bottom-right
  ctx.closePath()
  ctx.fill()
}

// ── Fixed aircraft symbol (centre square + L-shaped wings) ──────────────────
//  A320 style: black filled, yellow outline
//  Wings are L-shaped: horizontal bar + downward vertical piece at outer end
function drawAircraftSymbol(ctx) {
  const cx = AI_CX
  const cy = AI_CY

  // Centre square (yellow filled, black outline)
  const sq = 5
  ctx.fillStyle = '#FFD700'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.fillRect(cx - sq, cy - sq, sq * 2, sq * 2)
  ctx.strokeRect(cx - sq, cy - sq, sq * 2, sq * 2)

  // L-shaped wings — positioned at FD bar ends
  // Horizontal part: extends outward from centre gap
  // Vertical part: drops down at the outer tip
  const wingGap  = 58       // distance from centre to wing inner edge
  const wingW    = 28       // horizontal part width
  const wingH    = 6        // horizontal part thickness
  const dropW    = 6        // vertical drop thickness
  const dropH    = 18       // vertical drop height

  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 1.5

  // Left wing: downward drop at INNER end (near centre), horizontal extends outward
  ctx.beginPath()
  ctx.moveTo(cx - wingGap - wingW, cy - wingH / 2)                 // outer top
  ctx.lineTo(cx - wingGap, cy - wingH / 2)                         // inner top
  ctx.lineTo(cx - wingGap, cy - wingH / 2 + dropH)                // drop down
  ctx.lineTo(cx - wingGap - dropW, cy - wingH / 2 + dropH)        // drop outer
  ctx.lineTo(cx - wingGap - dropW, cy + wingH / 2)                // step up
  ctx.lineTo(cx - wingGap - wingW, cy + wingH / 2)                // outer bottom
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Right wing: mirror
  ctx.beginPath()
  ctx.moveTo(cx + wingGap + wingW, cy - wingH / 2)
  ctx.lineTo(cx + wingGap, cy - wingH / 2)
  ctx.lineTo(cx + wingGap, cy - wingH / 2 + dropH)
  ctx.lineTo(cx + wingGap + dropW, cy - wingH / 2 + dropH)
  ctx.lineTo(cx + wingGap + dropW, cy + wingH / 2)
  ctx.lineTo(cx + wingGap + wingW, cy + wingH / 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// ── Flight Director (green cross + wing shapes) ─────────────────────────────
function drawFlightDirector(ctx, fdY) {
  const cx = AI_CX
  const barH = 3.5        // bar thickness

  // ── Horizontal FD bar with wing shapes ──
  // Inner wing (thick, near centre)
  const innerHalf = 50
  const outerGap  = 8     // gap from centre to inner wing start
  ctx.fillStyle = '#00FF00'
  // Left inner wing
  ctx.fillRect(cx - outerGap - innerHalf, fdY - barH / 2, innerHalf, barH)
  // Right inner wing
  ctx.fillRect(cx + outerGap, fdY - barH / 2, innerHalf, barH)

  // ── Vertical FD bar ──
  const vBarHalfH = 28
  ctx.fillRect(cx - barH / 2, fdY - vBarHalfH, barH, vBarHalfH * 2)
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

  // Snap grid to nearest 500ft and draw labels
  const firstAlt = Math.ceil((altitude - ALT_RANGE) / 500) * 500
  const lastAlt  = Math.floor((altitude + ALT_RANGE) / 500) * 500

  // Minor ticks every 100 ft
  const firstMinor = Math.ceil((altitude - ALT_RANGE) / 100) * 100
  const lastMinor  = Math.floor((altitude + ALT_RANGE) / 100) * 100
  for (let a = firstMinor; a <= lastMinor; a += 100) {
    if (a % 500 === 0) continue  // skip major tick positions
    const yPos = centreY - (a - altitude) * ALT_PX
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, yPos)
    ctx.lineTo(cx + 7, yPos)
    ctx.stroke()
  }

  // Major ticks + labels every 500 ft
  for (let a = firstAlt; a <= lastAlt; a += 500) {
    const yPos = centreY - (a - altitude) * ALT_PX

    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, yPos)
    ctx.lineTo(cx + 12, yPos)
    ctx.stroke()

    // Label as 3-digit (ft / 100): 34500→345, 35000→350
    ctx.font = 'bold 17px monospace'
    ctx.fillStyle = '#CCCCCC'
    ctx.textAlign = 'left'
    ctx.fillText(String(Math.round(a / 100)), cx + 14, yPos + 5)
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

  ctx.font = 'bold 17px monospace'
  ctx.fillStyle = '#00FF00'
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.round(altitude / 20) * 20).padStart(5, ' '), cx + ALT_W / 2, pY + 5)

  // ── Vertical speed indicator (outer right of altitude tape) ──
  drawVSI(ctx, vs, cx + ALT_W + 4, cy)
}

// ── Left speed tape (IAS) + Mach readout ─────────────────────────────────────
function drawLeftBox(ctx, ias, mach, vmo, vls, alphaProt, alphaMax, spdTrend) {
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

  // IAS ticks and labels every 10 kt
  const firstSpd = Math.ceil((ias - visibleRange / 2) / 10) * 10
  for (let spd = firstSpd; spd <= ias + visibleRange / 2; spd += 10) {
    const yPos = centreY - (spd - ias) * pxPerKt
    const isMajor = spd % 20 === 0

    ctx.strokeStyle = '#888'
    ctx.lineWidth = isMajor ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(x + w, yPos)
    ctx.lineTo(x + w - (isMajor ? 12 : 7), yPos)
    ctx.stroke()

    if (isMajor) {
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = '#DDDDDD'
      ctx.textAlign = 'right'
      ctx.fillText(String(spd), x + w - 14, yPos + 5)
    }
  }

  // ── Speed trend arrow (thick yellow, centre of tape) ──
  if (Math.abs(spdTrend) > 1) {
    const trendPx = Math.max(-h / 2 + 14, Math.min(h / 2 - 14, -spdTrend * pxPerKt))
    const arrowX  = x + w / 2 + 6   // centre-right of tape
    const arrowY0 = centreY
    const arrowY1 = centreY + trendPx
    // Dark outline for contrast
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY0)
    ctx.lineTo(arrowX, arrowY1)
    ctx.stroke()
    // Yellow line
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY0)
    ctx.lineTo(arrowX, arrowY1)
    ctx.stroke()
    // Arrowhead
    const dir = trendPx > 0 ? 1 : -1
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY1)
    ctx.lineTo(arrowX - 5, arrowY1 - dir * 8)
    ctx.lineTo(arrowX + 5, arrowY1 - dir * 8)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()

  // ── IAS pointer box (centre) ──
  const pY = centreY
  const overspeed = ias > vmo
  ctx.fillStyle = '#222'
  ctx.strokeStyle = overspeed ? '#FF0000' : '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, x - 2, pY - 14, w + 4, 28, 3)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 18px monospace'
  ctx.fillStyle = overspeed ? '#FF0000' : '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.round(ias)).padStart(3, ' '), x + w / 2, pY + 5)

  // ── Mach readout below IAS tape ──
  const machStr = '.' + String(Math.round((mach ?? 0.788) * 1000)).padStart(3, '0')
  const mY = y + h + 4
  ctx.fillStyle = '#001a00'
  ctx.strokeStyle = '#336633'
  ctx.lineWidth = 1
  ctx.beginPath()
  roundRect(ctx, x + 2, mY, w - 4, 18, 2)
  ctx.fill()
  ctx.stroke()
  ctx.font = 'bold 12px monospace'
  ctx.fillStyle = '#00FF88'
  ctx.textAlign = 'center'
  ctx.fillText(machStr, x + w / 2, mY + 13)

  // ── Overspeed barber pole (red squares flush left, thin line on right) ──
  const vmoY = centreY - (vmo - ias) * pxPerKt
  if (vmoY > y) {
    const bpX    = x + w + 1                   // flush against speed box
    const bpTop  = y
    const bpBot  = Math.min(vmoY, y + h)
    const sqSize = 6
    const gap    = 6

    ctx.save()
    ctx.beginPath()
    ctx.rect(bpX, bpTop, AI_GAP, bpBot - bpTop)
    ctx.clip()

    // Red squares — left-aligned
    for (let sy = bpBot - sqSize; sy >= bpTop - sqSize; sy -= (sqSize + gap)) {
      ctx.fillStyle = '#CC0000'
      ctx.fillRect(bpX, sy, sqSize, sqSize)
    }

    // Thin vertical line on the right edge of the squares
    ctx.strokeStyle = '#CC0000'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(bpX + sqSize + 1, bpTop)
    ctx.lineTo(bpX + sqSize + 1, bpBot)
    ctx.stroke()

    ctx.restore()
  }

  // ── VLS → Alpha Prot: solid amber strip ──────────────────────────────
  // ── Alpha Prot → Alpha Max: amber squares (barber pole) ────────────
  const vlsY   = centreY - (vls - ias) * pxPerKt
  const aProtY = centreY - (alphaProt - ias) * pxPerKt
  const aMaxY  = centreY - (alphaMax - ias) * pxPerKt
  const bpX    = x + w + 2
  const bpW    = AI_GAP - 4

  // Thin amber line: VLS → Alpha Prot, with a left notch at VLS
  {
    const top = Math.max(vlsY, y)
    const bot = Math.min(aProtY, y + h)
    const lineX = bpX + bpW / 2                   // centre of gap
    if (bot > top) {
      // Vertical thin line
      ctx.strokeStyle = '#CC8800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(lineX, top)
      ctx.lineTo(lineX, bot)
      ctx.stroke()
      // Left notch at VLS top (hook toward speed tape)
      if (vlsY >= y && vlsY <= y + h) {
        ctx.beginPath()
        ctx.moveTo(lineX, vlsY)
        ctx.lineTo(bpX - 3, vlsY)
        ctx.stroke()
      }
    }
  }

  // Amber barber pole squares: Alpha Prot → Alpha Max
  {
    const top    = Math.max(aProtY, y)
    const bot    = Math.min(aMaxY, y + h)
    const sqSize = 6
    const gap    = 6
    if (bot > top) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(bpX, top, bpW, bot - top)
      ctx.clip()
      for (let sy = top; sy <= bot; sy += (sqSize + gap)) {
        ctx.fillStyle = '#CC8800'
        ctx.fillRect(bpX + (bpW - sqSize) / 2, sy, sqSize, sqSize)
      }
      ctx.restore()
    }
  }
}

function drawVSI(ctx, vs, x, y) {
  const h       = ALT_H           // 290
  const W_MID   = 36              // width at centre (widest)
  const W_END   = 20              // width at top / bottom (narrowest)
  const centreY = y + h / 2
  const HALF_H  = (h / 2) - 6    // usable half-height (6 px margin)

  // ── Non-linear scale: fpm → Y pixel ──────────────────────────────────
  //   0→1 : 50 % of half-height  (longest gap)
  //   1→2 : 25 %  (same as 2→6)
  //   2→6 : 25 %
  function vsiToY(fpm) {
    const a   = Math.min(Math.abs(fpm), 6000)
    const sgn = fpm >= 0 ? -1 : 1                // climb = up on screen
    let frac
    if (a <= 1000)      frac = (a / 1000) * 0.50
    else if (a <= 2000) frac = 0.50 + ((a - 1000) / 1000) * 0.25
    else                frac = 0.75 + ((a - 2000) / 4000) * 0.25
    return centreY + sgn * frac * HALF_H
  }

  // ── Tapered width at any Y ───────────────────────────────────────────
  // Straight from centre to just past "2" mark, then tapers toward "6"
  const TAPER_START = HALF_H * 0.78            // ~just past the "2" position
  function tapW(yy) {
    const dist = Math.abs(yy - centreY)
    if (dist <= TAPER_START) return W_MID      // straight section
    const t = (dist - TAPER_START) / (h / 2 - TAPER_START)
    return W_MID + (W_END - W_MID) * Math.min(t, 1)
  }

  // ── Tapered background fill ──────────────────────────────────────────
  const S = 40
  ctx.fillStyle = '#181c20'
  ctx.beginPath()
  for (let i = 0; i <= S; i++) {                  // right edge ↓
    const yy = y + (h * i) / S
    const xx = x + tapW(yy)
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
  }
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.stroke()

  // ── Yellow zero line ─────────────────────────────────────────────────
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x + 1, centreY)
  ctx.lineTo(x + tapW(centreY) - 1, centreY)
  ctx.stroke()

  // ── White scale on gray background ────────────────────────────────────
  // Ticks at: 500, 1000, 1500, 2000, 4000, 6000 fpm (each side)
  // Only ONE tick between 2 and 6 (at 4000)
  const minorTicks = [500, 1500, 4000]
  const majorTicks = [[1000, '1'], [2000, '2'], [6000, '6']]

  // Minor ticks (no label, thin)
  for (const fpm of minorTicks) {
    for (const s of [1, -1]) {
      const ty = vsiToY(s * fpm)
      ctx.strokeStyle = '#CCC'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 14, ty)
      ctx.lineTo(x + 21, ty)
      ctx.stroke()
    }
  }
  // Major ticks + labels: 1, 2, 6 (× 1000 fpm) — white
  for (const [fpm, lbl] of majorTicks) {
    for (const s of [1, -1]) {
      const ty = vsiToY(s * fpm)
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = '#CCC'
      ctx.textAlign = 'left'
      ctx.fillText(lbl, x + 2, ty + 4)
      ctx.strokeStyle = '#CCC'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 14, ty)
      ctx.lineTo(x + 22, ty)
      ctx.stroke()
    }
  }

  // ── Green analog pointer (diagonal line from left-centre → right-VS) ─
  // VS=0: horizontal, aligned with yellow zero line.
  // VS≠0: tilts diagonally up (climb) or down (descent).
  // Starts at left edge at centreY, ends at right side at VS height.
  // Clamped at ±6000 — pointer stays at scale end.
  const vsClamped = Math.max(-6000, Math.min(6000, vs))
  const needleY   = vsiToY(vsClamped)
  const rootY     = centreY + (needleY - centreY) * 0.25  // root shifts ~25% toward VS
  const nxR       = x + tapW(rootY) - 2            // root: right edge
  const nxL       = x + 4                          // tip: left side, VS height

  ctx.strokeStyle = '#00FF00'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(nxR, rootY)                           // root: outer edge, shifted toward VS
  ctx.lineTo(nxL, needleY)                         // tip: inner side, VS height
  ctx.stroke()

  // ── Digital indication (hundreds of fpm, just right of pointer tip) ──
  // Disappears when |VS| < 200 fpm
  if (Math.abs(vs) >= 200) {
    const hundreds = Math.round(Math.abs(vs) / 100)
    const lbl     = String(hundreds).padStart(2, '0')
    const ly      = Math.max(y + 10, Math.min(y + h - 10, needleY))
    const lx      = nxL + 12                       // just right of the tip
    const boxW    = 22
    const boxH    = 16
    // Dark background box
    ctx.fillStyle = '#000'
    ctx.fillRect(lx - boxW / 2, ly - boxH / 2, boxW, boxH)
    // Green text
    ctx.font      = 'bold 12px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText(lbl, lx, ly + 4)
  }
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
