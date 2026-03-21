import { useEffect, useRef } from 'react'

const W = 560
const H = 540

// Attitude Indicator geometry
const AI_W  = 340          // width
const AI_H  = 290          // height
const AI_X  = 78           // left edge (AI_CX - AI_W/2)
const AI_Y  = 80           // top edge — small gap below FMA bottom

// Left box geometry (mirrors altitude tape)
const LB_W   = 62
const LB_H   = 290   // = AI_H
const LB_X   = 78 - LB_W - 12   // AI_X - LB_W - 12 (mirrors right gap)

// Altitude tape geometry
const ALT_X  = 430
const ALT_Y  = AI_Y
const ALT_W  = 50
const ALT_H  = AI_H
const ALT_RANGE = 570      // ft visible above and below centre (extra margin for edge labels)
const ALT_PX = (290 / 2) / ALT_RANGE  // px per ft  (≈ 0.254)

// Attitude indicator ref-line scale (independent of altitude tape)
const AI_PX = (290 / 2) / 2000        // px per ft for AI elements (= 0.0725)

// Speed (Mach) tape geometry – horizontal at bottom
const SPD_W  = 280
const SPD_X  = AI_X + (AI_W - SPD_W) / 2   // centred under AI
const SPD_Y  = AI_Y + AI_H + 18
const SPD_H  = 42
const SPD_PX_MACH = 280   // total tape width for Mach 0…1.2

// Default state for initial render
const DEFAULT = {
  pitch: 2.5, roll: 0,
  altitude: 35000, sel_alt: 35000, vs: 0,
  mach: 0.78, tas: 465, ias: 304, gs: 465,
  spd_mode: 'MACH', alt_mode: 'ALT CRZ', lat_mode: 'HDG',
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

  drawFMA(ctx, s, selVs)
  drawLeftBox(ctx, s.ias ?? s.actual_spd ?? 304, s.mach ?? 0.78, s.vmo ?? 350, s.vls ?? 201, s.alpha_prot ?? 177, s.alpha_max ?? 162, s.spd_trend ?? 0, s.target_spd_ias ?? s.ias ?? 304, s.flap_conf ?? 'CONF 0', s.gd_speed ?? 215, s.s_speed ?? 185, s.f_speed ?? 155, (s.altitude ?? 35000) <= 20000 ? s.vfe_next : null)
  drawAttitudeIndicator(ctx, s.pitch ?? 2.5, s.roll ?? 0)
  // drawBankArc(ctx)  — disabled, will be rebuilt
  drawAircraftSymbol(ctx, squareY ?? REF_CY)
  drawFlightDirector(ctx, squareY ?? REF_CY)
  drawAltitudeTape(ctx, s.altitude ?? 27000, selAlt ?? s.sel_alt ?? 36000, s.vs ?? 0, s.alt_mode ?? 'ALT CRZ')
  drawHeadingTape(ctx, s.heading ?? 87)
  drawBaroIndicator(ctx, s.baro_std, s.baro_value)

}

// ── FMA — Flight Mode Annunciator (5-column A320 layout) ────────────────────
//
//  ┌─────────┬─────────┬─────────┬─────────┬─────────┐  y=4
//  │  A/THR  │  VERT   │  LAT    │  APPR   │   AP2   │  active row (50px)
//  │  SPEED  │ OP DES  │  NAV    │         │  1 FD 2 │
//  │         │  -1800  │         │         │  A/THR  │
//  ├─────────┼─────────┼─────────┼─────────┤         │  armed row (22px)
//  │         │   ALT   │         │         │         │
//  └─────────┴─────────┴─────────┴─────────┴─────────┘  y=76
//
// ── FMA mode-change tracker (white box for 5 s on new engagement) ──────────
const _fmaTrack = {
  spd: { mode: null, time: 0 },
  vert: { mode: null, time: 0 },
  lat: { mode: null, time: 0 },
}

function fmaBoxActive(slot, currentMode) {
  const now = Date.now()
  if (currentMode !== _fmaTrack[slot].mode) {
    _fmaTrack[slot].mode = currentMode
    _fmaTrack[slot].time = now
  }
  return (now - _fmaTrack[slot].time) < 5000
}

function drawFmaBox(ctx, cx, y, text, font) {
  ctx.save()
  ctx.font = font
  const tw = ctx.measureText(text).width
  const pad = 4
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.strokeRect(cx - tw / 2 - pad, y - 13, tw + pad * 2, 18)
  ctx.restore()
}

function drawFMA(ctx, s, selVs) {
  const FX = LB_X           // 4 — left edge of speed tape
  const FY = 4
  const FW = 528            // spans to right edge of VSI area
  const FH = 72
  const COLS = 5
  const COL = FW / COLS      // ~105.6
  const ACTIVE_H = 50
  const ARMED_H  = FH - ACTIVE_H   // 22

  // Background — black
  ctx.fillStyle = '#000000'
  ctx.fillRect(FX, FY, FW, FH)

  // Column dividers — thin white/gray lines
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1
  for (let i = 1; i < COLS; i++) {
    ctx.beginPath()
    ctx.moveTo(Math.round(FX + COL * i), FY)
    ctx.lineTo(Math.round(FX + COL * i), FY + FH)
    ctx.stroke()
  }


  // Column centre X values
  const CX = Array.from({ length: COLS }, (_, i) => FX + COL * (i + 0.5))

  // Active mode text Y (near top of FMA)
  const modeY = FY + 16

  const altMode = s.alt_mode ?? 'ALT CRZ'
  const latMode = s.lat_mode ?? 'HDG'

  // ── Col 0 — A/THR (speed mode) ───────────────────────────────────────────
  const spdMode = s.spd_mode ?? 'SPEED'
  if (s.athr) {
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText(spdMode, CX[0], modeY)
    if (fmaBoxActive('spd', spdMode)) {
      drawFmaBox(ctx, CX[0], modeY, spdMode, 'bold 16px monospace')
    }
  }

  // ── Col 1 — Vertical mode ────────────────────────────────────────────────
  const isCapture = altMode === 'ALT*'
  if (altMode === 'V/S') {
    // V/S mode: "V/S" green + value blue on same line
    const vs = selVs ?? s.vs ?? 0
    const vsStr = (vs >= 0 ? '+' : '') + Math.round(vs)
    ctx.font = 'bold 16px monospace'
    const fullW = ctx.measureText('VS' + vsStr).width
    const startX = CX[1] - fullW / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = '#00FF00'
    ctx.fillText('VS', startX, modeY)
    ctx.fillStyle = '#00BFFF'
    ctx.fillText(vsStr, startX + ctx.measureText('VS').width, modeY)
    if (fmaBoxActive('vert', altMode)) {
      drawFmaBox(ctx, CX[1], modeY, 'VS' + vsStr, 'bold 16px monospace')
    }
  } else if (isCapture) {
    // ALT* — green on top only, no ALT blue below
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText('ALT*', CX[1], modeY)
    if (fmaBoxActive('vert', altMode)) {
      drawFmaBox(ctx, CX[1], modeY, 'ALT*', 'bold 16px monospace')
    }
  } else {
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText(altMode, CX[1], modeY)
    if (fmaBoxActive('vert', altMode)) {
      drawFmaBox(ctx, CX[1], modeY, altMode, 'bold 16px monospace')
    }
  }

  // ALT armed — blue, just below active mode, left-aligned
  if (['OP CLB', 'OP DES', 'V/S'].includes(altMode)) {
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = '#00BFFF'
    ctx.textAlign = 'left'
    ctx.fillText('ALT', Math.round(FX + COL) + 4, modeY + 18)
  }

  // ── Col 2 — Lateral mode ─────────────────────────────────────────────────
  const lIsArmed = latMode.endsWith('*')
  ctx.font = 'bold 16px monospace'
  ctx.fillStyle = lIsArmed ? '#00BFFF' : '#00FF00'
  ctx.textAlign = 'center'
  ctx.fillText(latMode.replace('*', ''), CX[2], modeY)
  if (fmaBoxActive('lat', latMode)) {
    drawFmaBox(ctx, CX[2], modeY, latMode.replace('*', ''), 'bold 16px monospace')
  }

  // ── Col 3 — ECAM memo (speed brake, flap config, etc.) ───────────────────
  const sbrk = s.spd_brk_actual ?? 0
  if (sbrk > 0.01) {
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = '#00FF00'
    ctx.textAlign = 'center'
    ctx.fillText('SPD BRK', CX[3], modeY)
  }

  // ── Col 4 — AP / FD / A-THR engagement ────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.font = 'bold 13px monospace'
  const apX = Math.round(FX + COL * 4) + 4   // left edge of col 5 + small padding
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(`AP${s.ap_num ?? 2}`, apX, FY + 20)
  ctx.fillText(`${s.fd1 ? '1' : '-'} FD ${s.fd2 ? '2' : '-'}`, apX, FY + 38)
  ctx.fillStyle = s.athr ? '#FFFFFF' : '#888'
  ctx.fillText('A/THR', apX, FY + 56)
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
function drawAttitudeIndicator(ctx, pitch, roll) {
  const x1 = AI_X1
  const x2 = AI_X2
  const w  = x2 - x1
  const rollRad = -(roll ?? 0) * Math.PI / 180

  // Clip to AI area — stadium shape (straight sides, arced top/bottom)
  // Inset from AI bounds so it doesn't overlap FMA/heading/speed/alt boxes
  const inX = 40             // horizontal inset from AI edges
  const al = x1 + inX       // left edge of AI shape
  const ar = x2 - inX       // right edge
  const topPeak = AI_Y + 10  // top of dome
  const botPeak = AI_Y + AI_H - 10  // bottom of dome
  // Straight sides end around middle — then sharp bend into arc
  const straightHalf = 50

  ctx.save()
  ctx.beginPath()
  // Start at right side top of straight
  ctx.moveTo(ar, AI_CY - straightHalf)
  // Right side straight down
  ctx.lineTo(ar, AI_CY + straightHalf)
  // Bottom-right: sharp corner then curves to peak
  ctx.bezierCurveTo(ar, AI_CY + straightHalf + 8, ar - 10, botPeak, AI_CX, botPeak)
  // Bottom-left: curves from peak then sharp corner
  ctx.bezierCurveTo(al + 10, botPeak, al, AI_CY + straightHalf + 8, al, AI_CY + straightHalf)
  // Left side straight up
  ctx.lineTo(al, AI_CY - straightHalf)
  // Top-left: sharp corner then curves to peak
  ctx.bezierCurveTo(al, AI_CY - straightHalf - 8, al + 10, topPeak, AI_CX, topPeak)
  // Top-right: curves from peak then sharp corner
  ctx.bezierCurveTo(ar - 10, topPeak, ar, AI_CY - straightHalf - 8, ar, AI_CY - straightHalf)
  ctx.closePath()
  ctx.clip()

  // Rotate sky/ground/horizon/ladder around AI centre
  ctx.save()
  ctx.translate(AI_CX, AI_CY)
  ctx.rotate(rollRad)

  const horizonY = pitch * PPD   // relative to AI_CY (pitch up → horizon moves down)
  const bigR = w + AI_H          // large enough to fill rotated area

  // Sky — blue
  ctx.fillStyle = '#0A6EBD'
  ctx.fillRect(-bigR, -bigR, bigR * 2, bigR + horizonY)

  // Ground — brown
  ctx.fillStyle = '#6B3410'
  ctx.fillRect(-bigR, horizonY, bigR * 2, bigR * 2)

  // Horizon line
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-bigR, horizonY)
  ctx.lineTo(bigR, horizonY)
  ctx.stroke()

  // ── Pitch ladder (every 2.5°) ──
  const longHalf  = 55
  const medHalf   = 30
  const shortHalf = 15

  for (let degX10 = -300; degX10 <= 300; degX10 += 25) {
    if (degX10 === 0) continue
    const deg = degX10 / 10
    const y = horizonY - deg * PPD

    const isMajor = degX10 % 100 === 0
    const is5     = degX10 % 50 === 0
    const absDeg  = Math.abs(degX10)
    const half = isMajor ? (absDeg <= 200 ? 38 : longHalf) : is5 ? medHalf : shortHalf

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = isMajor ? 2 : is5 ? 1.5 : 1

    ctx.beginPath()
    ctx.moveTo(-half, y)
    ctx.lineTo(half, y)
    ctx.stroke()

    if (isMajor) {
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.abs(deg)), -half - 5, y + 4)
      ctx.textAlign = 'left'
      ctx.fillText(String(Math.abs(deg)), half + 5, y + 4)
    }
  }

  // Cover pitch lines above 20° with sky blue (clean sky, no lines)
  const boundY = horizonY - 21 * PPD
  ctx.fillStyle = '#0A6EBD'
  ctx.fillRect(-bigR, -bigR, bigR * 2, bigR + boundY)

  // White boundary line just above 20° mark (spans full AI width, clipped by stadium)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-bigR, boundY)
  ctx.lineTo(bigR, boundY)
  ctx.stroke()

  ctx.restore()  // undo rotation

  ctx.restore()  // undo clip

  // ── Bank indicators (OUTSIDE the AI stadium, on the black background) ──
  // Each marker has its own radius matched to the stadium bezier border at that angle
  const bankCY = AI_CY

  const bankMarkers = [
    { deg: 10, w: 5, h: 8,  r: 136 },
    { deg: 20, w: 5, h: 8,  r: 138 },
    { deg: 30, w: 5, h: 14, r: 141 },
  ]

  for (const { deg, w: mw, h: mh, r: mR } of bankMarkers) {
    for (const sign of [-1, 1]) {
      const rad = sign * deg * Math.PI / 180
      const angle = -Math.PI / 2 + rad
      const px = AI_CX + mR * Math.cos(angle)
      const py = bankCY + mR * Math.sin(angle)

      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(rad)
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 1.5
      ctx.strokeRect(-mw / 2, -mh, mw, mh)   // extends OUTWARD from arc (away from centre)
      ctx.restore()
    }
  }

  // 45° notches — radius matched to stadium border at 45° angle
  const bank45R = 142
  for (const sign of [-1, 1]) {
    const rad = sign * 45 * Math.PI / 180
    const angle = -Math.PI / 2 + rad
    const px = AI_CX + bank45R * Math.cos(angle)
    const py = bankCY + bank45R * Math.sin(angle)

    const outR = bank45R + 14
    const ox = AI_CX + outR * Math.cos(angle)
    const oy = bankCY + outR * Math.sin(angle)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(px, py)    // tip touches border
    ctx.lineTo(ox, oy)    // extends outward
    ctx.stroke()
  }

  // Yellow hollow inverted triangle at top centre (fixed reference)
  const bankTopY = bankCY - 136  // radius at 0° (top centre, same as 10° marker)
  const bTriH = 10
  const bTriW = 7
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(AI_CX, bankTopY)                        // bottom point (on arc)
  ctx.lineTo(AI_CX - bTriW, bankTopY - bTriH)        // top-left
  ctx.lineTo(AI_CX + bTriW, bankTopY - bTriH)        // top-right
  ctx.closePath()
  ctx.stroke()

  // Yellow hollow upright triangle — rotates with bank angle
  const upTriTop = bankTopY + 3
  const rollAngle = -(roll ?? 0) * Math.PI / 180
  ctx.save()
  ctx.translate(AI_CX, bankCY)
  ctx.rotate(rollAngle)
  ctx.translate(-AI_CX, -bankCY)
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(AI_CX, upTriTop)                        // top point
  ctx.lineTo(AI_CX - bTriW, upTriTop + bTriH)        // bottom-left
  ctx.lineTo(AI_CX + bTriW, upTriTop + bTriH)        // bottom-right
  ctx.closePath()
  ctx.stroke()
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
function drawAircraftSymbol(ctx, fdY) {
  const cx = AI_CX
  const sqY = fdY ?? AI_CY

  ctx.save()
  ctx.translate(cx, sqY)

  // Centre square
  const sq = 5
  ctx.fillStyle = '#FFD700'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.fillRect(-sq, -sq, sq * 2, sq * 2)
  ctx.strokeRect(-sq, -sq, sq * 2, sq * 2)

  // L-shaped wings
  const wingGap  = 58
  const wingW    = 28
  const wingH    = 6
  const dropW    = 6
  const dropH    = 18

  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 1.5

  // Left wing
  ctx.beginPath()
  ctx.moveTo(-wingGap - wingW, -wingH / 2)
  ctx.lineTo(-wingGap, -wingH / 2)
  ctx.lineTo(-wingGap, -wingH / 2 + dropH)
  ctx.lineTo(-wingGap - dropW, -wingH / 2 + dropH)
  ctx.lineTo(-wingGap - dropW, wingH / 2)
  ctx.lineTo(-wingGap - wingW, wingH / 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Right wing
  ctx.beginPath()
  ctx.moveTo(wingGap + wingW, -wingH / 2)
  ctx.lineTo(wingGap, -wingH / 2)
  ctx.lineTo(wingGap, -wingH / 2 + dropH)
  ctx.lineTo(wingGap + dropW, -wingH / 2 + dropH)
  ctx.lineTo(wingGap + dropW, wingH / 2)
  ctx.lineTo(wingGap + wingW, wingH / 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

// ── Flight Director (green cross + wing shapes) ─────────────────────────────
function drawFlightDirector(ctx, fdY) {
  const cx = AI_CX
  const barH = 3.5

  ctx.save()
  ctx.translate(cx, fdY)

  // Horizontal FD bars
  const innerHalf = 50
  const outerGap  = 8
  ctx.fillStyle = '#00FF00'
  ctx.fillRect(-outerGap - innerHalf, -barH / 2, innerHalf, barH)
  ctx.fillRect(outerGap, -barH / 2, innerHalf, barH)

  // Vertical FD bar
  const vBarHalfH = 28
  ctx.fillRect(-barH / 2, -vBarHalfH, barH, vBarHalfH * 2)

  ctx.restore()
}

// ── Altitude tape (right side) ──────────────────────────────────────────────
function drawAltitudeTape(ctx, altitude, selAlt, vs, altMode) {
  const cx = ALT_X
  const cy = ALT_Y
  const centreY = cy + ALT_H / 2

  // Background
  ctx.fillStyle = '#5C6B7A'
  ctx.fillRect(cx, cy, ALT_W, ALT_H)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
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
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, yPos)
    ctx.lineTo(cx + 13, yPos)
    ctx.stroke()
  }

  // Major ticks + labels every 500 ft
  for (let a = firstAlt; a <= lastAlt; a += 500) {
    const yPos = centreY - (a - altitude) * ALT_PX

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, yPos)
    ctx.lineTo(cx + 13, yPos)
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

  // ── Current altitude pointer box (A320 drum style) ──
  //  ┌────────┬──────────┐
  //  │        │          │  ← drum section taller (mushroom head)
  //  │   37   │  40      │
  //  │        │  20      │
  //  │        │  00      │
  //  │        │          │
  //  └────────┴──────────┘
  const pY = centreY

  // Left section (thousands digits) — within altitude tape, shorter
  const leftL  = cx
  const leftH2 = 16               // half-height of left section
  const divX   = cx + ALT_W       // divider at right edge of altitude tape

  // Right section (drum) — taller, protrudes RIGHT beyond the tape
  const drumH2 = 22              // half-height of drum (mushroom head)
  const boxR   = cx + ALT_W + 30 // extends past tape

  // Draw right drum section first (taller, protrudes right)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, divX - 1, pY - drumH2, boxR - divX + 1, drumH2 * 2, 2)
  ctx.fill()
  ctx.stroke()

  // Draw left section (shorter rectangle, within tape)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, leftL, pY - leftH2, divX - leftL + 1, leftH2 * 2, 2)
  ctx.fill()
  ctx.stroke()

  // Cover the shared edge so they look connected
  ctx.fillStyle = '#000'
  ctx.fillRect(divX - 2, pY - leftH2 + 1, 4, leftH2 * 2 - 2)

  // Split: left = altitude/100, right drum = last 2 digits scrolling by 20
  // Use raw altitude for smooth drum scroll, snapped value for left digits
  const last2Raw      = ((altitude % 100) + 100) % 100       // 0..99 continuous
  const drumStep      = 20
  const drumFrac      = (last2Raw % drumStep) / drumStep     // smooth 0..1 within slot
  const curSlot       = Math.floor(last2Raw / drumStep) * drumStep  // 0,20,40,60,80

  // Left digits — each digit scrolls independently at its own boundary
  const leftVal       = Math.floor(altitude / 100)
  const digitFont     = 'bold 20px monospace'
  const leftStr       = String(leftVal)
  const numDigits     = leftStr.length

  ctx.font = digitFont
  ctx.fillStyle = '#00FF00'
  const charW = ctx.measureText('0').width

  const rightEdge = divX - 3
  const ZONE = 8                                            // ft zone for quick scroll

  for (let d = 0; d < numDigits; d++) {
    const strIdx   = numDigits - 1 - d                      // index in string (0=leftmost)
    const digitCX  = rightEdge - charW * d - charW / 2      // centre X of this digit
    const curDigit = parseInt(leftStr[strIdx])

    // Each digit's cycle: d=0 → 100ft, d=1 → 1000ft, d=2 → 10000ft
    const cycle     = Math.pow(10, d + 2)
    const remainder = ((altitude % cycle) + cycle) % cycle

    ctx.save()
    ctx.beginPath()
    ctx.rect(digitCX - charW / 2 - 1, pY - leftH2 + 2, charW + 2, leftH2 * 2 - 4)
    ctx.clip()
    ctx.textAlign = 'center'

    if (vs < 0 && remainder > (cycle - ZONE)) {
      // Descent: new digit rises from below
      const progress = (cycle - remainder) / ZONE
      const offset   = (1 - progress) * 18
      ctx.fillText(String(curDigit), digitCX, pY + 7 + offset)
      ctx.fillText(String((curDigit + 1) % 10), digitCX, pY + 7 + offset - 18)
    } else if (vs > 0 && remainder < ZONE && remainder > 0) {
      // Ascent: new digit drops from above
      const progress = remainder / ZONE
      const offset   = (1 - progress) * 18
      ctx.fillText(String(curDigit), digitCX, pY + 7 - offset)
      ctx.fillText(String((curDigit - 1 + 10) % 10), digitCX, pY + 7 - offset + 18)
    } else {
      // Static
      ctx.fillText(String(curDigit), digitCX, pY + 7)
    }

    ctx.restore()
  }

  // Right: rolling drum for last 2 digits (00, 20, 40, 60, 80)
  const drumX  = divX + 1
  const drumW  = boxR - drumX - 2
  const drumCX = drumX + drumW / 2 - 2

  // Clip drum area
  ctx.save()
  ctx.beginPath()
  ctx.rect(drumX, pY - drumH2 + 3, drumW, drumH2 * 2 - 6)
  ctx.clip()

  const drumPxPerSlot = 16
  const drumOffset    = drumFrac * drumPxPerSlot

  ctx.font = digitFont
  ctx.textAlign = 'center'
  for (let i = -3; i <= 3; i++) {
    const val = ((curSlot - i * drumStep) % 100 + 100) % 100
    const dy  = pY + 7 + i * drumPxPerSlot + drumOffset
    const lbl = String(val).padStart(2, '0')
    ctx.fillStyle = '#00FF00'
    ctx.fillText(lbl, drumCX, dy)
  }

  ctx.restore()

  // ── Selected altitude readout — only during active descent/climb ──
  const activeVertModes = ['OP DES', 'OP CLB', 'V/S', 'ALT*']
  if (activeVertModes.includes(altMode)) {
    const flHundreds = Math.round(selAlt / 100)
    const selLabel = 'FL' + String(flHundreds)
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = '#00BFFF'
    ctx.textAlign = 'right'
    ctx.fillText(selLabel, cx + ALT_W, cy + ALT_H + 20)
  }

  // ── Vertical speed indicator (outer right of altitude tape) ──
  drawVSI(ctx, vs, cx + ALT_W + 36, cy)
}

// ── Left speed tape (IAS) + Mach readout ─────────────────────────────────────
function drawLeftBox(ctx, ias, mach, vmo, vls, alphaProt, alphaMax, spdTrend, targetIas, flapConf, gdSpeed, sSpeed, fSpeed, vfeNext) {
  const x = LB_X
  const y = AI_Y
  const w = LB_W
  const h = LB_H
  const visibleRange = 80        // kt visible (40 above + 40 below)
  const pxPerKt = h / visibleRange
  const centreY = y + h / 2

  // Background
  ctx.fillStyle = '#5C6B7A'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
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

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = isMajor ? 2 : 1.5
    ctx.beginPath()
    ctx.moveTo(x + w, yPos)
    ctx.lineTo(x + w - 12, yPos)
    ctx.stroke()

    if (isMajor) {
      ctx.font = 'bold 18px monospace'
      ctx.fillStyle = '#DDDDDD'
      ctx.textAlign = 'right'
      ctx.fillText(String(spd), x + w - 20, yPos + 5)
    }
  }

  // ── Speed trend arrow (from actual speed indicator) ──
  if (Math.abs(spdTrend) > 1) {
    const trendPx = Math.max(-h / 2 + 14, Math.min(h / 2 - 14, -spdTrend * pxPerKt))
    const arrowX  = x + w - 4       // at yellow triangle flat tip
    const arrowY0 = centreY
    const arrowY1 = centreY + trendPx
    // Dark outline for contrast
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY0)
    ctx.lineTo(arrowX, arrowY1)
    ctx.stroke()
    // Yellow line
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY0)
    ctx.lineTo(arrowX, arrowY1)
    ctx.stroke()
    // Arrowhead
    const dir = trendPx > 0 ? 1 : -1
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY1)
    ctx.lineTo(arrowX - 3, arrowY1 - dir * 6)
    ctx.lineTo(arrowX + 3, arrowY1 - dir * 6)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()

  const overspeed = ias > vmo

  // ── Mach readout — bottom-left of PFD, large green text, no box ──
  const machStr = '.' + String(Math.round((mach ?? 0.788) * 1000)).padStart(3, '0')
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = '#00FF00'
  ctx.textAlign = 'left'
  ctx.fillText(machStr, x, y + h + 20)

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

  // ── VFE next marker (amber tick at the next flap config's VFE) ──────
  if (vfeNext != null) {
    const vfeYm = centreY - (vfeNext - ias) * pxPerKt
    if (vfeYm >= y && vfeYm <= y + h) {
      ctx.strokeStyle = '#FF8C00'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x + w + 1, vfeYm)
      ctx.lineTo(x + w + AI_GAP - 4, vfeYm)
      ctx.stroke()
      // Small downward notch
      ctx.beginPath()
      ctx.moveTo(x + w + 1, vfeYm)
      ctx.lineTo(x + w + 1, vfeYm + 6)
      ctx.stroke()
    }
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

  // Amber barber pole squares: Alpha Prot → Alpha Max (flush against speed tape box)
  {
    const top    = Math.max(aProtY, y)
    const bot    = Math.min(aMaxY, y + h)
    const sqSize = 6
    const gap    = 6
    const abpX   = x + w + 1                      // flush against speed box
    if (bot > top) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(abpX, top, AI_GAP, bot - top)
      ctx.clip()
      for (let sy = bot - sqSize; sy >= top - sqSize; sy -= (sqSize + gap)) {
        ctx.fillStyle = '#CC8800'
        ctx.fillRect(abpX, sy, sqSize, sqSize)
      }
      // Thin vertical line on right edge of squares
      ctx.strokeStyle = '#CC8800'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(abpX + sqSize + 1, top)
      ctx.lineTo(abpX + sqSize + 1, bot)
      ctx.stroke()
      ctx.restore()
    }
  }

  // ── Blue hollow triangle: target speed ──────────────────────────────────
  const tgtY = centreY - ((targetIas ?? ias) - ias) * pxPerKt
  if (tgtY >= y - 10 && tgtY <= y + h + 10) {
    ctx.strokeStyle = '#00BFFF'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x + w, tgtY)               // point touches tape right edge
    ctx.lineTo(x + w + 15, tgtY - 9)      // top right
    ctx.lineTo(x + w + 15, tgtY + 9)      // bottom right
    ctx.closePath()
    ctx.stroke()
  }

  // ── Yellow filled triangle: actual speed ─────────────────────────────────
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(x + w, centreY)              // point touches tape right edge
  ctx.lineTo(x + w + 7, centreY - 4)      // top right
  ctx.lineTo(x + w + 7, centreY + 4)      // bottom right
  ctx.closePath()
  ctx.fill()
  // Yellow line extending from tip into the tape
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x + w, centreY)
  ctx.lineTo(x + w - 14, centreY)          // extends past long ticks (~12px)
  ctx.stroke()

  // ── Characteristic speed markers (GD, S, F) ─────────────────────────────
  const markerX = x + w + 10

  // Green Dot — only in clean config
  if (flapConf === 'CONF 0' && gdSpeed) {
    const gdY = centreY - (gdSpeed - ias) * pxPerKt
    if (gdY >= y && gdY <= y + h) {
      ctx.fillStyle = '#00FF00'
      ctx.beginPath()
      ctx.arc(markerX, gdY, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // S speed — in CONF 1 / 1+F
  if ((flapConf === 'CONF 1' || flapConf === 'CONF 1+F') && sSpeed) {
    const sY = centreY - (sSpeed - ias) * pxPerKt
    if (sY >= y && sY <= y + h) {
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = '#00FF00'
      ctx.textAlign = 'center'
      ctx.fillText('S', markerX, sY + 4)
    }
  }


  // ── Flap config indicator (below Mach readout) ─────────────────────────
  if (flapConf && flapConf !== 'CONF 0') {
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = '#00BFFF'
    ctx.textAlign = 'left'
    ctx.fillText(flapConf, x, y + h + 38)
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
  ctx.fillStyle = '#5C6B7A'
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
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
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

// ── Heading tape (horizontal at bottom — A320 style) ────────────────────────
function drawHeadingTape(ctx, heading) {
  const x = SPD_X
  const y = SPD_Y
  const w = SPD_W
  const h = SPD_H
  const centreX = x + w / 2
  const VISIBLE_DEG = 25          // ±25° = 50° total visible
  const PX_PER_DEG = w / 2 / VISIBLE_DEG

  // Blue-gray background (A320 style)
  ctx.fillStyle = '#5C6B7A'
  ctx.fillRect(x, y, w, h)

  // White border
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, w, h)

  // Clip to tape area
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  // Draw ticks and labels — ticks from top down, labels below
  for (let offset = -VISIBLE_DEG; offset <= VISIBLE_DEG; offset += 1) {
    const deg = ((Math.round(heading) + offset) % 360 + 360) % 360
    const xPos = centreX + offset * PX_PER_DEG

    if (deg % 10 === 0) {
      // Major tick from top edge downward
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(xPos, y)
      ctx.lineTo(xPos, y + 12)
      ctx.stroke()

      // 2-digit label (heading / 10): 330° → "33", 0° → "0"
      const lbl = String(Math.round(deg / 10))
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.fillText(lbl, xPos, y + 28)
    } else if (deg % 5 === 0) {
      // Minor tick — shorter
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xPos, y)
      ctx.lineTo(xPos, y + 8)
      ctx.stroke()
    }
  }

  ctx.restore()

  // Yellow inverted triangle at top centre (current heading pointer)
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.moveTo(centreX, y + 1)
  ctx.lineTo(centreX - 6, y - 8)
  ctx.lineTo(centreX + 6, y - 8)
  ctx.closePath()
  ctx.fill()

  // Green diamond below the triangle (track / heading marker)
  const dY = y + 6
  const dS = 5
  ctx.strokeStyle = '#00FF00'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(centreX, dY - dS)
  ctx.lineTo(centreX + dS, dY)
  ctx.lineTo(centreX, dY + dS)
  ctx.lineTo(centreX - dS, dY)
  ctx.closePath()
  ctx.stroke()
}

// ── Barometric indicator (bottom-right) ─────────────────────────────────────
function drawBaroIndicator(ctx, baroStd, baroValue) {
  const label = baroStd ? 'STD' : String(Math.round(baroValue))
  const x = ALT_X + ALT_W - 38
  const y = ALT_Y + ALT_H + 26

  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2
  ctx.beginPath()
  roundRect(ctx, x, y, 44, 20, 3)
  ctx.fill()
  ctx.stroke()

  ctx.font = 'bold 13px monospace'
  ctx.fillStyle = '#00BFFF'
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
