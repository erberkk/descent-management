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
// FCU MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function FCU({ fcu, patch }) {
  if (!fcu) return null

  // ── Speed section handlers ─────────────────────────────────────────────
  const spdKnob = useKnobDrag({
    value: fcu.fcu_sel_mach,
    onChange: (v) => patch({ fcu_sel_mach: v }),
    step:  0.001,
    min:   0.10,
    max:   0.99,
    pxPerStep: 3,
  })

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
  const spdAngle = knobAngle(fcu.fcu_sel_mach, 0.10, 0.99)
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
            <div className="fcu-spd-display">{fcu.fcu_sel_spd}</div>
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_spd: Math.min(fcu.fcu_sel_spd + 5, 999) })}>▲</button>
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_spd: Math.max(fcu.fcu_sel_spd - 5, 0) })}>▼</button>
            <div className="fcu-knob-label">SPEED</div>
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
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_alt: Math.min(fcu.fcu_sel_alt + 1000, 49000) })}>▲</button>
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_alt: Math.max(fcu.fcu_sel_alt - 1000, 0) })}>▼</button>
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
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_vs: Math.min(fcu.fcu_sel_vs + 100, 6000) })}>▲</button>
            <button className="fcu-mode-btn" onClick={() => patch({ fcu_sel_vs: Math.max(fcu.fcu_sel_vs - 100, -6000) })}>▼</button>
            <div className="fcu-knob-label">V/S</div>
          </div>
        </div>

      </div>{/* end controls strip */}
    </div>
  )
}
