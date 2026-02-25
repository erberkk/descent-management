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

      {/* ────────────── TOP DISPLAY STRIP ────────────── */}
      <div className="fcu-display-strip">

        {/* MACH display */}
        <LCDDisplay
          label="MACH"
          value={machStr}
          managed={fcu.fcu_spd_managed}
          dot={true}
        />

        {/* HDG + LAT labels */}
        <div className="fcu-lcd-group">
          <LCDDisplay
            label={<><span>HDG</span><span className="fcu-lat-label">LAT</span></>}
            value={hdgStr}
            managed={fcu.fcu_hdg_managed}
            dot={true}
          />
        </div>

        {/* Mode buttons (HDG / V/S) */}
        <div className="fcu-mode-btns">
          <button className="fcu-mode-btn" onClick={() => patch({ fcu_hdg_managed: false })}>
            HDG
          </button>
          <div className="fcu-mode-sep" />
          <button className="fcu-mode-btn" onClick={() => patch({ fcu_vs_managed: false })}>
            V/S
          </button>
        </div>

        {/* ALT display — large */}
        <div className="fcu-lcd wide alt-lcd">
          <div className="fcu-lcd-label">ALT</div>
          <div className="fcu-lcd-value alt-value">{altStr}</div>
          <div className="fcu-lcd-dot on" />
        </div>

        {/* V/S display */}
        <LCDDisplay
          label="V/S"
          value={vsStr}
          managed={fcu.fcu_vs_managed}
          dot={false}
        />
      </div>

      {/* ────────────── BOTTOM CONTROLS STRIP ────────────── */}
      <div className="fcu-controls-strip">

        {/* ── SPEED SECTION ── */}
        <div className="fcu-section spd-section">
          <div className="fcu-knob-col">
            <PushButton onClick={toggleSpdManaged} title="Push: managed / Pull: selected" />
            <div
              className="fcu-knob spd-knob"
              style={{ transform: `rotate(${spdAngle}deg)` }}
              {...spdKnob}
            >
              <div className="fcu-knob-marker" />
            </div>
            <div className="fcu-knob-label">SPD<br />MACH</div>
          </div>
          <LEDButton label="LOC" active={fcu.loc_armed}
            onClick={() => patch({ loc_armed: !fcu.loc_armed })} />
        </div>

        <Divider />

        {/* ── HDG / AP SECTION ── */}
        <div className="fcu-section hdg-section">
          {/* Rocker toggles at top */}
          <div className="fcu-rocker-row">
            <Rocker
              options={['HDG', 'TRK']}
              value={fcu.fcu_hdg_trk_mode}
              onChange={(v) => patch({ fcu_hdg_trk_mode: v })}
            />
            <Rocker
              options={['V/S', 'FPA']}
              value={fcu.fcu_vs_fpa_mode}
              onChange={(v) => patch({ fcu_vs_fpa_mode: v })}
            />
          </div>

          {/* HDG knob (centre with blue ▲) + AP buttons side by side */}
          <div className="fcu-hdg-row">
            <div className="fcu-knob-col">
              <PushButton onClick={toggleHdgManaged} title="Push: NAV managed" />
              <div
                className="fcu-knob hdg-knob"
                style={{ transform: `rotate(${hdgAngle}deg)` }}
                {...hdgKnob}
              >
                <div className="fcu-knob-marker" />
                <div className="fcu-hdg-triangle">▲</div>
              </div>
              <div className="fcu-knob-label">HDG/<br />TRK</div>
            </div>

            {/* AP + A/THR buttons */}
            <div className="fcu-ap-col">
              <div className="fcu-ap-row">
                <LEDButton label="AP1" active={fcu.ap1_engaged}
                  onClick={() => patch({ ap1_engaged: !fcu.ap1_engaged })} />
                <LEDButton label="AP2" active={fcu.ap2_engaged}
                  onClick={() => patch({ ap2_engaged: !fcu.ap2_engaged })} />
              </div>
              <LEDButton label="A/THR" active={fcu.athr_engaged}
                onClick={() => patch({ athr_engaged: !fcu.athr_engaged })} />
            </div>
          </div>
        </div>

        <Divider />

        {/* ── ALT SECTION ── */}
        <div className="fcu-section alt-section">
          {/* Step selector */}
          <div className="fcu-alt-step-row">
            <Rocker
              options={[100, 1000]}
              value={fcu.fcu_alt_step}
              onChange={(v) => patch({ fcu_alt_step: v })}
            />
            <span className="fcu-metric-label">METRIC<br />ALT</span>
          </div>

          <div className="fcu-knob-col">
            <div
              className="fcu-knob alt-knob"
              style={{ transform: `rotate(${altAngle}deg)` }}
              {...altKnob}
            >
              <div className="fcu-knob-marker" />
            </div>
            <div className="fcu-knob-label">ALT</div>
          </div>

          <LEDButton label="EXPED" active={fcu.exped_active}
            onClick={() => patch({ exped_active: !fcu.exped_active })} />
        </div>

        <Divider />

        {/* ── V/S SECTION ── */}
        <div className="fcu-section vs-section">
          <div className="fcu-vs-up-label">UP</div>
          <div className="fcu-knob-col">
            <PushButton onClick={levelOff} title="Push: Level Off" />
            <div
              className="fcu-knob vs-knob"
              style={{ transform: `rotate(${vsAngle}deg)` }}
              {...vsKnob}
            >
              <div className="fcu-knob-marker" />
            </div>
            <div className="fcu-knob-label">V/S<br />FPA</div>
          </div>
          <div className="fcu-vs-dn-label">DN</div>

          <div className="fcu-vs-right">
            <LEDButton label="APPR" active={fcu.appr_armed}
              onClick={() => patch({ appr_armed: !fcu.appr_armed })} />
            <div className="fcu-leveloff-label">PUSH<br />TO<br />LEVEL<br />OFF</div>
          </div>
        </div>

      </div>{/* end controls strip */}
    </div>
  )
}
