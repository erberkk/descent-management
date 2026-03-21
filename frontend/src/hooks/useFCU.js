import { useState, useCallback, useRef } from 'react'

const DEFAULTS = {
  fcu_spd_managed:  true,
  fcu_mach_mode:    true,
  fcu_sel_mach:     0.78,
  fcu_sel_spd:      300,
  flap_lever:       0,
  spd_brk_lever:    0,
  fcu_hdg_managed:  true,
  fcu_hdg_trk_mode: 'HDG',
  fcu_vs_fpa_mode:  'V/S',
  fcu_sel_hdg:      87,
  fcu_sel_vs:       0,
  fcu_vs_managed:   true,
  fcu_sel_alt:      35000,
  fcu_alt_step:     1000,
  metric_alt:       false,
  exped_active:     false,
  ap1_engaged:      false,
  ap2_engaged:      true,
  athr_engaged:     true,
  loc_armed:        false,
  appr_armed:       false,
}

export function useFCU() {
  const [fcu, setFcu] = useState(DEFAULTS)
  const pending = useRef(false)

  /** Called when a fresh WS state arrives — reconcile if no PATCH in-flight */
  const reconcile = useCallback((ws) => {
    if (pending.current) return
    setFcu({
      fcu_spd_managed:  ws.fcu_spd_managed  ?? DEFAULTS.fcu_spd_managed,
      fcu_mach_mode:    ws.fcu_mach_mode    ?? DEFAULTS.fcu_mach_mode,
      fcu_sel_mach:     ws.fcu_sel_mach     ?? DEFAULTS.fcu_sel_mach,
      fcu_sel_spd:      ws.fcu_sel_spd      ?? DEFAULTS.fcu_sel_spd,
      fcu_hdg_managed:  ws.fcu_hdg_managed  ?? DEFAULTS.fcu_hdg_managed,
      fcu_hdg_trk_mode: ws.fcu_hdg_trk_mode ?? DEFAULTS.fcu_hdg_trk_mode,
      fcu_vs_fpa_mode:  ws.fcu_vs_fpa_mode  ?? DEFAULTS.fcu_vs_fpa_mode,
      fcu_sel_hdg:      ws.fcu_sel_hdg      ?? DEFAULTS.fcu_sel_hdg,
      fcu_sel_vs:       ws.fcu_sel_vs       ?? DEFAULTS.fcu_sel_vs,
      fcu_vs_managed:   ws.fcu_vs_managed   ?? DEFAULTS.fcu_vs_managed,
      fcu_sel_alt:      ws.fcu_sel_alt       ?? ws.sel_alt ?? DEFAULTS.fcu_sel_alt,
      fcu_alt_step:     ws.fcu_alt_step     ?? DEFAULTS.fcu_alt_step,
      metric_alt:       ws.metric_alt       ?? DEFAULTS.metric_alt,
      exped_active:     ws.exped_active     ?? DEFAULTS.exped_active,
      ap1_engaged:      ws.ap1_engaged      ?? DEFAULTS.ap1_engaged,
      ap2_engaged:      ws.ap2_engaged      ?? DEFAULTS.ap2_engaged,
      athr_engaged:     ws.athr_engaged     ?? DEFAULTS.athr_engaged,
      loc_armed:        ws.loc_armed        ?? DEFAULTS.loc_armed,
      appr_armed:       ws.appr_armed       ?? DEFAULTS.appr_armed,
      flap_lever:       ws.flap_lever       ?? DEFAULTS.flap_lever,
      spd_brk_lever:    ws.spd_brk_lever    ?? DEFAULTS.spd_brk_lever,
    })
  }, [])

  /** Optimistically update FCU locally and PATCH the backend */
  const patch = useCallback(async (changes) => {
    setFcu(prev => ({ ...prev, ...changes }))
    pending.current = true
    try {
      await fetch('/fcu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    } finally {
      setTimeout(() => { pending.current = false }, 250)
    }
  }, [])

  return { fcu, reconcile, patch }
}
