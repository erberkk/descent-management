import { useRef, useCallback } from 'react'
import './FCU.css'

// ═══════════════════════════════════════════════════════════════════════════
// Shared drag hook — vertical drag changes a numeric value
// ═══════════════════════════════════════════════════════════════════════════
function useKnobDrag({ value, onChange, step = 1, min, max, pxPerStep = 4, wrap = false }) {
  const drag = useRef(null)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    drag.current = { startY: e.clientY, startVal: value }

    function onMove(me) {
      if (!drag.current) return
      const steps = Math.round((drag.current.startY - me.clientY) / pxPerStep)
      let next = drag.current.startVal + steps * step
      if (wrap) {
        next = ((next % 360) + 360) % 360
      } else {
        if (min !== undefined) next = Math.max(min, next)
        if (max !== undefined) next = Math.min(max, next)
      }
      // Round to avoid float drift
      next = Math.round(next / step) * step
      onChange(next)
    }

    function onUp() {
      drag.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [value, onChange, step, min, max, pxPerStep, wrap])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    let next = value + dir * step
    if (wrap) {
      next = ((next % 360) + 360) % 360
    } else {
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
    }
    onChange(Math.round(next / step) * step)
  }, [value, onChange, step, min, max, wrap])

  return { onMouseDown, onWheel }
}

// ── Knob visual angle from value ──────────────────────────────────────────
function knobAngle(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return -135 + t * 270   // -135° … +135°
}

// ═══════════════════════════════════════════════════════════════════════════
// LED Button — used for AP1, AP2, A/THR, LOC, EXPED, APPR
// ═══════════════════════════════════════════════════════════════════════════
function LEDButton({ label, active, onClick }) {
  return (
    <button className={`fcu-led-btn ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="fcu-led-bar" />
      <span className="fcu-led-bar" />
      <span className="fcu-led-label">{label}</span>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Small push button (managed toggle on knob top)
// ═══════════════════════════════════════════════════════════════════════════
function PushButton({ onClick, title = '' }) {
  return <button className="fcu-push-btn" onClick={onClick} title={title} />
}

// ═══════════════════════════════════════════════════════════════════════════
// 2-position toggle rocker (HDG/TRK, V/S/FPA, 100/1000)
// ═══════════════════════════════════════════════════════════════════════════
function Rocker({ options, value, onChange }) {
  return (
    <div className="fcu-rocker">
      {options.map((opt) => (
        <button
          key={opt}
          className={`fcu-rocker-opt ${value === opt ? 'active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LCD Display segment  (MACH / HDG / V/S readout)
// ═══════════════════════════════════════════════════════════════════════════
function LCDDisplay({ label, value, managed, dot = true, wide = false }) {
  return (
    <div className={`fcu-lcd ${wide ? 'wide' : ''}`}>
      <div className="fcu-lcd-label">{label}</div>
      <div className={`fcu-lcd-value ${managed ? 'dashes' : ''}`}>
        {managed ? '- - -' : value}
      </div>
      {dot && <div className={`fcu-lcd-dot ${managed ? 'on' : 'off'}`} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section divider
// ═══════════════════════════════════════════════════════════════════════════
function Divider() {
  return <div className="fcu-sec-divider" />
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine N1 Gauge (SVG arc gauge)
// ═══════════════════════════════════════════════════════════════════════════
function EngineGauge({ label, n1 }) {
  const val = Math.max(0, Math.min(100, n1))
  const color = val >= 92 ? '#FFA500' : '#00CC00'
  // SVG arc parameters
  const cx = 28, cy = 28, r = 20
  const startAngle = 135, sweepTotal = 270
  const toRad = (d) => (d * Math.PI) / 180
  const arcPoint = (angle) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  })
  const endAngle = startAngle + sweepTotal * val / 100
  const bgEnd = arcPoint(startAngle + sweepTotal)
  const bgStart = arcPoint(startAngle)
  const valEnd = arcPoint(endAngle)
  const bgLargeArc = sweepTotal > 180 ? 1 : 0
  const valSweep = sweepTotal * val / 100
  const valLargeArc = valSweep > 180 ? 1 : 0

  return (
    <div className="fcu-eng-gauge">
      <div className="fcu-eng-label">{label}</div>
      <svg width="56" height="56" viewBox="0 0 56 56">
        {/* Background arc */}
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${bgLargeArc} 1 ${bgEnd.x} ${bgEnd.y}`}
          fill="none" stroke="#2a2a2a" strokeWidth="4" strokeLinecap="round"
        />
        {/* Value arc */}
        {val > 0 && (
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${valLargeArc} 1 ${valEnd.x} ${valEnd.y}`}
            fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          />
        )}
        {/* N1 value */}
        <text x={cx} y={cy + 4} textAnchor="middle" fill={val >= 92 ? '#FFA500' : '#FFF'}
              fontSize="10" fontWeight="bold" fontFamily="'Courier New', monospace">
          {val.toFixed(1)}
        </text>
      </svg>
    </div>
  )
}

function EngineGauges({ n1 }) {
  return (
    <div className="fcu-eng-gauges">
      <div className="fcu-eng-title">N1 %</div>
      <div className="fcu-eng-row">
        <EngineGauge label="E1" n1={n1} />
        <EngineGauge label="E2" n1={n1} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FCU MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function FCU({ fcu, patch, state }) {
  if (!fcu) return null

  // ── V/S initialization from actual VS when in OP DES/OP CLB ───────────
  const isOpenMode = state && (state.alt_mode === 'OP DES' || state.alt_mode === 'OP CLB')
  const initVsFromActual = () => {
    // Round actual VS to nearest 100 FPM
    const rounded = Math.round((state?.vs || 0) / 100) * 100
    patch({ fcu_sel_vs: rounded, fcu_vs_managed: false })
  }

  // ── Speed section handlers ─────────────────────────────────────────────
  // Both hooks always called (Rules of Hooks), active one selected by mode
  const machKnob = useKnobDrag({
    value: fcu.fcu_sel_mach,
    onChange: (v) => patch({ fcu_sel_mach: v }),
    step:  0.001,
    min:   0.10,
    max:   0.99,
    pxPerStep: 3,
  })

  const iasKnob = useKnobDrag({
    value: fcu.fcu_sel_spd,
    onChange: (v) => patch({ fcu_sel_spd: v }),
    step:  1,
    min:   100,
    max:   400,
    pxPerStep: 2,
  })

  const spdKnob = fcu.fcu_mach_mode ? machKnob : iasKnob
  const toggleSpdManaged = () => patch({ fcu_spd_managed: !fcu.fcu_spd_managed })

  // ── HDG section handlers ───────────────────────────────────────────────
  const hdgKnob = useKnobDrag({
    value: fcu.fcu_sel_hdg,
    onChange: (v) => patch({ fcu_sel_hdg: v }),
    step:  1,
    wrap:  true,
    pxPerStep: 3,
  })

  const toggleHdgManaged = () => patch({ fcu_hdg_managed: !fcu.fcu_hdg_managed })

  // ── ALT section handlers ───────────────────────────────────────────────
  const altKnob = useKnobDrag({
    value: fcu.fcu_sel_alt,
    onChange: (v) => patch({ fcu_sel_alt: v }),
    step:  fcu.fcu_alt_step,
    min:   100,
    max:   49900,
    pxPerStep: 4,
  })

  // ── V/S section handlers ───────────────────────────────────────────────
  const vsKnob = useKnobDrag({
    value: fcu.fcu_sel_vs,
    onChange: (v) => patch({ fcu_sel_vs: v }),
    step:  100,
    min:  -6000,
    max:   6000,
    pxPerStep: 4,
  })

  const levelOff = () => patch({ fcu_vs_managed: true, fcu_sel_vs: 0 })

  // ── Format helpers ─────────────────────────────────────────────────────
  const machStr  = `.${String(Math.round(fcu.fcu_sel_mach * 1000)).padStart(3, '0')}`
  const hdgStr   = String(Math.round(fcu.fcu_sel_hdg)).padStart(3, '0')
  const altStr   = String(fcu.fcu_sel_alt).padStart(5, '0')
  const vsSign   = fcu.fcu_sel_vs >= 0 ? '+' : ''
  const vsStr    = `${vsSign}${fcu.fcu_sel_vs}`

  // Knob rotation angles
  const spdAngle = fcu.fcu_mach_mode
    ? knobAngle(fcu.fcu_sel_mach, 0.10, 0.99)
    : knobAngle(fcu.fcu_sel_spd, 100, 400)
  const altAngle = knobAngle(fcu.fcu_sel_alt,  100,  49900)
  const vsAngle  = knobAngle(fcu.fcu_sel_vs,  -6000, 6000)
  const hdgAngle = fcu.fcu_sel_hdg * (270 / 360) - 135

  return (
    <div className="fcu-panel">

      {/* ────────────── BOTTOM CONTROLS STRIP ────────────── */}
      <div className="fcu-controls-strip">

        {/* ── SPEED SECTION ── */}
        <div className="fcu-section spd-section">
          <div className="fcu-knob-col">
            <div className="fcu-spd-display">
              {fcu.fcu_mach_mode
                ? `.${String(Math.round(fcu.fcu_sel_mach * 1000)).padStart(3, '0')}`
                : fcu.fcu_sel_spd}
            </div>
            {fcu.fcu_mach_mode ? (
              <>
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_mach: Math.min(fcu.fcu_sel_mach + 0.01, 0.99) })}>▲</button>
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_mach: Math.max(fcu.fcu_sel_mach - 0.01, 0.10) })}>▼</button>
              </>
            ) : (
              <>
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_spd: Math.min(fcu.fcu_sel_spd + 5, 400) })}>▲</button>
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_spd: Math.max(fcu.fcu_sel_spd - 5, 100) })}>▼</button>
              </>
            )}
            <button
              className="fcu-spd-mach-btn"
              onClick={() => patch({ fcu_mach_mode: !fcu.fcu_mach_mode })}
              title="Toggle SPD/MACH"
            >
              {fcu.fcu_mach_mode ? 'SPD' : 'MACH'}
            </button>
            <div className="fcu-knob-label">{fcu.fcu_mach_mode ? 'MACH' : 'SPEED'}</div>
          </div>
        </div>

        <Divider />

        {/* ── HDG SECTION ── */}
        <div className="fcu-section hdg-section">
          <div className="fcu-knob-col">
            <div className="fcu-spd-display">{String(Math.round(fcu.fcu_sel_hdg)).padStart(3, '0')}</div>
            <div className="fcu-hdg-btn-row">
              <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_hdg: (fcu.fcu_sel_hdg - 1 + 360) % 360 })}>◄</button>
              <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_hdg: (fcu.fcu_sel_hdg + 1) % 360 })}>►</button>
            </div>
            <div className="fcu-hdg-btn-row">
              <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_hdg: (fcu.fcu_sel_hdg - 5 + 360) % 360 })}>◄◄</button>
              <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_hdg: (fcu.fcu_sel_hdg + 5) % 360 })}>►►</button>
            </div>
            <div className="fcu-knob-label">HDG</div>
          </div>
        </div>

        <Divider />

        {/* ── ALT SECTION ── */}
        <div className="fcu-section alt-section">
          <div className="fcu-knob-col">
            <div className="fcu-spd-display fcu-alt-display">{String(fcu.fcu_sel_alt).padStart(5, '0')}</div>
            <div className="fcu-alt-btn-row">
              <div className="fcu-alt-push-col">
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_alt: Math.min(fcu.fcu_sel_alt + 1000, 49000) })}>▲</button>
                <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_alt: Math.max(fcu.fcu_sel_alt - 1000, 0) })}>▼</button>
              </div>
              <button
                className="fcu-pull-btn"
                onClick={() => patch({ alt_pull: true })}
                title="ALT PULL"
              >
                <span>PULL</span>
              </button>
            </div>
            <div className="fcu-knob-label">ALT</div>
          </div>
        </div>

        <Divider />

        {/* ── LEVEL OFF ── */}
        <div className="fcu-knob-col">
          <button
            className="fcu-leveloff-btn"
            onClick={() => patch({ level_off: true, fcu_sel_vs: 0 })}
          >
            <span>LVL</span><span>OFF</span>
          </button>
        </div>

        <Divider />

        {/* ── V/S SECTION ── */}
        <div className="fcu-section vs-section">
          <div className="fcu-knob-col">
            <div className="fcu-spd-display fcu-vs-display">
              {fcu.fcu_sel_vs >= 0 ? '+' : ''}{fcu.fcu_sel_vs}
            </div>
            <div className="fcu-vs-btn-row">
              <div className="fcu-alt-push-col">
                <button className="fcu-mode-btn" onClick={() => {
                  if (isOpenMode && fcu.fcu_vs_managed) {
                    initVsFromActual()
                  } else {
                    patch({ fcu_sel_vs: Math.min(fcu.fcu_sel_vs + 100, 6000) })
                  }
                }}>▲</button>
                <button className="fcu-mode-btn" onClick={() => {
                  if (isOpenMode && fcu.fcu_vs_managed) {
                    initVsFromActual()
                  } else {
                    patch({ fcu_sel_vs: Math.max(fcu.fcu_sel_vs - 100, -6000) })
                  }
                }}>▼</button>
              </div>
              <button
                className="fcu-pull-btn"
                onClick={() => patch({ vs_pull: true })}
                title="V/S PULL — engage V/S mode toward target alt"
              >
                <span>PULL</span>
              </button>
            </div>
            <div className="fcu-knob-label">V/S</div>
          </div>
        </div>

        <Divider />

        {/* ── SPEED BRAKE ── */}
        <div className="fcu-section sbrk-section">
          <div className="fcu-knob-col">
            <div className="fcu-sbrk-value">
              {Math.round((fcu.spd_brk_lever ?? 0) * 100)}%
            </div>
            <div className="fcu-sbrk-track">
              {[1.0, 0.75, 0.50, 0.25, 0.0].map(pos => (
                <button
                  key={pos}
                  className={`fcu-sbrk-pos ${(fcu.spd_brk_lever ?? 0) === pos ? 'active' : ''}`}
                  onClick={() => patch({ spd_brk_lever: pos })}
                >
                  {pos === 0 ? 'RET' : Math.round(pos * 100)}
                </button>
              ))}
            </div>
            <div className="fcu-knob-label">SPD BRK</div>
          </div>
        </div>

        <Divider />

        {/* ── ENGINE N1 GAUGES ── */}
        <EngineGauges n1={state?.n1 ?? 70} />

        <Divider />

        {/* ── FLAP LEVER ── */}
        <div className="fcu-section flap-section">
          <div className="fcu-knob-col">
            <div className="fcu-flap-conf">
              {state?.flap_conf ?? 'CONF 0'}
            </div>
            <div className="fcu-flap-lever-track">
              {[0, 1, 2, 3, 4].map(pos => (
                <button
                  key={pos}
                  className={`fcu-flap-pos ${(fcu.flap_lever ?? 0) === pos ? 'active' : ''}`}
                  onClick={() => patch({ flap_lever: pos })}
                >
                  {pos === 4 ? 'F' : pos}
                </button>
              ))}
            </div>
            <div className="fcu-flap-btn-row">
              <button className="fcu-mode-btn" onClick={() => {
                const cur = fcu.flap_lever ?? 0
                if (cur > 0) patch({ flap_lever: cur - 1 })
              }}>▲ UP</button>
              <button className="fcu-mode-btn" onClick={() => {
                const cur = fcu.flap_lever ?? 0
                if (cur < 4) patch({ flap_lever: cur + 1 })
              }}>▼ DN</button>
            </div>
            <div className="fcu-knob-label">FLAPS</div>
          </div>
        </div>

      </div>{/* end controls strip */}
    </div>
  )
}
