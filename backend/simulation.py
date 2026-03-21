import math
from typing import Any, Dict


def to_rad(deg: float) -> float:
    return deg * math.pi / 180


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3440.065
    dlat = to_rad(lat2 - lat1)
    dlon = to_rad(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing_to(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(to_rad, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def move_point(lat: float, lon: float, brg_deg: float, dist_nm: float):
    R = 3440.065
    d = dist_nm / R
    b = to_rad(brg_deg)
    lat1 = to_rad(lat)
    lon1 = to_rad(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(b))
    lon2 = lon1 + math.atan2(
        math.sin(b) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


# ═══════════════════════════════════════════════════════════════════════════════
# ISA Standard Atmosphere
# ═══════════════════════════════════════════════════════════════════════════════
_ISA_T0    = 288.15    # K   — sea-level temperature
_ISA_P0    = 101325.0  # Pa  — sea-level pressure
_ISA_RHO0  = 1.225     # kg/m³ — sea-level density
_ISA_GAMMA = 1.4       # ratio of specific heats (air)
_ISA_R     = 287.05    # J/(kg·K) — specific gas constant
_ISA_LAPSE = 0.0065    # K/m — tropospheric lapse rate
_ISA_TROP  = 11000.0   # m  — tropopause altitude
_ISA_EXP   = 9.80665 / (_ISA_LAPSE * _ISA_R)   # ≈ 5.2558


def isa_atmosphere(altitude_ft: float) -> dict:
    """Standard ISA atmosphere at a given pressure altitude (ft)."""
    h = altitude_ft * 0.3048                  # ft → m
    if h <= _ISA_TROP:
        T = _ISA_T0 - _ISA_LAPSE * h
        P = _ISA_P0 * (T / _ISA_T0) ** _ISA_EXP
    else:                                     # isothermal stratosphere
        T   = 216.65
        T_t = _ISA_T0 - _ISA_LAPSE * _ISA_TROP
        P_t = _ISA_P0 * (T_t / _ISA_T0) ** _ISA_EXP
        P   = P_t * math.exp(-9.80665 * (h - _ISA_TROP) / (_ISA_R * T))
    rho    = P / (_ISA_R * T)
    sos_kt = math.sqrt(_ISA_GAMMA * _ISA_R * T) * 1.94384   # m/s → kt
    return {"T": T, "P": P, "rho": rho, "sos_kt": sos_kt}


def _crossover_ft(mach: float, ias_kt: float) -> float:
    """Binary-search for the altitude where Mach and IAS yield the same TAS.
    Below crossover: TAS_mach > TAS_ias  → fly by IAS.
    Above crossover: TAS_ias  > TAS_mach → fly by Mach.
    """
    lo, hi = 0.0, 45000.0
    for _ in range(60):
        mid = (lo + hi) / 2.0
        atm = isa_atmosphere(mid)
        tas_mach = mach * atm["sos_kt"]
        tas_ias  = ias_kt * math.sqrt(_ISA_RHO0 / atm["rho"])
        if tas_mach > tas_ias:
            lo = mid   # crossover is above — search higher
        else:
            hi = mid   # crossover is below — search lower
    return (lo + hi) / 2.0


# ═══════════════════════════════════════════════════════════════════════════════
# A320 Fixed Aircraft Parameters
# ═══════════════════════════════════════════════════════════════════════════════
A320_MASS_KG   = 65_000      # fixed operating mass [kg]  (user-specified)
A320_WING_S    = 122.6       # reference wing area [m²]
A320_AR        = 9.4         # wing aspect ratio
A320_OSWALD    = 0.85        # Oswald efficiency factor
A320_CD0       = 0.022       # base zero-lift drag coefficient
A320_G         = 9.80665     # gravitational acceleration [m/s²]

# Altitude-dependent CD0 increase (Reynolds number / compressibility correction)
A320_CD0_ALT_REF = 27.0     # kft — CD0 starts increasing above this altitude
A320_CD0_ALT_K   = 0.0098   # CD0 increment at FL350
A320_CD0_ALT_POW = 2.0      # power law exponent
A320_CD0_ALT_NORM = (35.0 - A320_CD0_ALT_REF) ** A320_CD0_ALT_POW  # normalizer

# Thrust model — CFM56-5B4 (approximate)
A320_T_MAX_SL_N = 120_000   # N per engine, sea-level static
A320_N_ENGINES  = 2
A320_N1_IDLE    = 24.0      # % N1 at ground/flight IDLE
A320_N1_CLB     = 88.0      # % N1 at CLB (climb) thrust
A320_N1_MIN     = 18.0      # % N1 absolute minimum

# Calibrated idle thrust model (decoupled from max thrust lapse)
A320_T_IDLE_SL  = 12_000    # N total idle thrust at sea level (both engines)
A320_IDLE_EXP   = 1.3       # density exponent for idle thrust lapse

# Speed limits
A320_VS_RAMP_RATE = 200.0        # FPM/s  — max VS change rate (pitch servo limit)
A320_ACMD_RATE    = 0.10         # m/s²/s — acceleration command ramp rate (pitch lag)
A320_VMO          = 350          # kt IAS — max operating speed
A320_MMO          = 0.82         # Mach   — max operating Mach

# Low-speed protections (clean configuration, no slats/flaps)
# Vs1g_clean = 172 kt at MTOW 78t (FCOM LIM-13), scaled to 65t:
#   172 × sqrt(65000/78000) = 157 kt IAS
A320_CL_MAX_CLEAN = 1.30        # max lift coefficient, clean config
_Vs1g_ms  = math.sqrt(2 * A320_MASS_KG * A320_G / (_ISA_RHO0 * A320_WING_S * A320_CL_MAX_CLEAN))
A320_VS1G_IAS     = round(_Vs1g_ms * 1.94384, 1)   # ≈ 157 kt IAS
A320_VLS_FACTOR   = 1.28        # VLS = 1.28 × Vs1g (clean config)
A320_VLS          = round(A320_VS1G_IAS * A320_VLS_FACTOR)  # ≈ 201 kt IAS
A320_ALPHA_PROT   = round(A320_VS1G_IAS * 1.13)             # ≈ 177 kt IAS
A320_ALPHA_MAX    = round(A320_VS1G_IAS * 1.03)             # ≈ 162 kt IAS

# Crossover altitude for M0.78 / 300 kt IAS in standard ISA  →  ≈ FL270
A320_CROSSOVER_FT = _crossover_ft(0.78, 300)


# ═══════════════════════════════════════════════════════════════════════════════
# A320 Flap/Slat Configuration Table
# ═══════════════════════════════════════════════════════════════════════════════
A320_FLAP_TABLE = [
    {"name": "CONF 0",    "slat": 0,  "flap": 0,  "vfe": 350, "dcd0": 0.000, "cl_max": 1.30},
    {"name": "CONF 1",    "slat": 18, "flap": 0,  "vfe": 230, "dcd0": 0.010, "cl_max": 1.60},
    {"name": "CONF 1+F",  "slat": 18, "flap": 10, "vfe": 215, "dcd0": 0.025, "cl_max": 1.85},
    {"name": "CONF 2",    "slat": 22, "flap": 15, "vfe": 200, "dcd0": 0.040, "cl_max": 2.10},
    {"name": "CONF 3",    "slat": 22, "flap": 20, "vfe": 185, "dcd0": 0.060, "cl_max": 2.40},
    {"name": "CONF FULL", "slat": 27, "flap": 35, "vfe": 177, "dcd0": 0.085, "cl_max": 2.70},
]

# Precompute VLS, Vs1g, alpha speeds for each configuration
for _cfg in A320_FLAP_TABLE:
    _vs1g_ms = math.sqrt(2 * A320_MASS_KG * A320_G / (_ISA_RHO0 * A320_WING_S * _cfg["cl_max"]))
    _vs1g_kt = _vs1g_ms * 1.94384
    _vls_f = 1.28 if _cfg["name"] == "CONF 0" else 1.23
    _cfg["vs1g"]       = round(_vs1g_kt, 1)
    _cfg["vls"]        = round(_vs1g_kt * _vls_f)
    _cfg["alpha_prot"] = round(_vs1g_kt * 1.13)
    _cfg["alpha_max"]  = round(_vs1g_kt * 1.03)

# Flap/slat transition rates
A320_SLAT_RATE = 4.0    # deg/s
A320_FLAP_RATE = 3.5    # deg/s

# CONF 1 vs 1+F auto-transition threshold
A320_CONF1F_THRESHOLD = 210  # kt IAS

# Characteristic speeds (65,000 kg)
A320_GD_SPEED = round(2 * (A320_MASS_KG / 1000) + 85)   # ≈ 215 kt (Green Dot)
A320_S_SPEED  = round(A320_MASS_KG / 1000 + 120)        # ≈ 185 kt (slat retract speed)
A320_F_SPEED  = round(A320_MASS_KG / 1000 + 90)         # ≈ 155 kt (flap retract speed)

# VFE per lever position (structural limit — independent of CONF 1 vs 1+F)
A320_LEVER_VFE = {0: 350, 1: 230, 2: 200, 3: 185, 4: 177}

# Speed brake
A320_SPD_BRK_CD0  = 0.050     # ΔCD0 at full speed brake deployment
A320_SPD_BRK_RATE = 0.7       # deployment rate [1/s] (~1.4 s full travel)


class Aircraft:
    def __init__(self):
        # ── Position ────────────────────────────────────────────────────────
        self.lat = 33.10
        self.lon = -113.00

        # ── Altitude ────────────────────────────────────────────────────────
        self.altitude = 35000.0
        self.sel_alt  = 35000.0       # driven by FCU

        # ── Attitude ────────────────────────────────────────────────────────
        self.pitch = 2.5
        self.roll  = 0.0

        # ── Navigation ──────────────────────────────────────────────────────
        self.heading = 87.0
        self.track   = 87.0
        self.vs      = 0.0

        # ── Wind (calm for now — will add wind model later) ─────────────────
        self.wind_dir   = 0.0
        self.wind_speed = 0.0

        # ── Speeds (ISA-derived at initial altitude) ─────────────────────────
        self.mach = 0.78
        _atm      = isa_atmosphere(self.altitude)
        self.tas  = round(self.mach * _atm["sos_kt"], 1)
        self.ias  = round(self.tas * math.sqrt(_atm["rho"] / _ISA_RHO0), 1)
        self.gs   = round(max(self.tas + self.wind_speed * math.cos(
                        to_rad(self.wind_dir - self.heading)), 50.0), 1)
        self.actual_spd = self.ias   # kept for API compatibility

        # ── PFD mode annunciator strings ─────────────────────────────────────
        self.spd_mode = "MACH"
        self.alt_mode = "ALT CRZ"
        self.lat_mode = "HDG"

        # ── AP / FD / ATHR ──────────────────────────────────────────────────
        self.ap_num = 2
        self.fd1    = True
        self.fd2    = True
        self.athr   = True

        # ── Baro ────────────────────────────────────────────────────────────
        self.baro_std   = True
        self.baro_value = 1013.25

        # ── VOR 1 ───────────────────────────────────────────────────────────
        self.vor1_id  = "BLH"
        self.vor1_lat = 33.619
        self.vor1_lon = -114.718

        # ── Simulation clock ─────────────────────────────────────────────────
        self.sim_time   = 0.0
        self.base_clock = 18 * 3600 + 31 * 60   # 18:31

        # ── Thrust / engine ──────────────────────────────────────────────────
        self.n1 = 70.0          # % N1 (both engines, symmetric)

        # ── Phase control ────────────────────────────────────────────────────
        self.phase           = "CRUISE"
        self._vs_managed_override = False   # True when FCU VS knob is active
        self._leveloff_target     = None    # Temporary stop altitude from LVL OFF
        self._leveloff_capture_vs = None    # VS at moment level-off was pressed
        self._alt_capture_vs      = None    # VS at moment of entering capture zone
        self._vs_transition_target = None   # Gradual VS transition target (FPM)

        # ── Flap / Slat ───────────────────────────────────────────────────────
        self.flap_lever      = 0       # lever position: 0, 1, 2, 3, 4 (FULL)
        self.flap_conf_index = 0       # index into A320_FLAP_TABLE
        self.slat_angle      = 0.0     # actual slat angle [deg]
        self.flap_angle      = 0.0     # actual flap angle [deg]

        # ── Speed Brake ───────────────────────────────────────────────────────
        self.spd_brk_lever   = 0.0     # commanded: 0.0, 0.25, 0.50, 0.75, 1.0
        self.spd_brk_actual  = 0.0     # actual deployment (transitions gradually)

        # ── Speed trend (IAS acceleration for PFD speed trend arrow) ────────
        self._prev_ias = None               # previous tick IAS for derivative
        self._ias_accel = 0.0               # smoothed IAS acceleration [kt/s]

        # ── Smoothed acceleration command (pitch servo lag in OP DES/CLB) ──
        self._a_cmd_smooth = 0.0            # m/s² — ramps toward target a_cmd

        # ── FCU state (mirrors the physical FCU panel) ───────────────────────
        # Speed section — standard A320 descent: M0.78 / 300 kt IAS
        self.fcu_spd_managed  = True
        self.fcu_mach_mode    = True
        self._user_mach_override = False   # True when user manually toggled SPD/MACH
        self.fcu_sel_mach     = 0.78
        self.fcu_sel_spd      = 300

        # Dynamic crossover altitude (recomputed each tick)
        self._crossover_ft    = _crossover_ft(0.78, 300)

        # Lateral section
        self.fcu_hdg_managed  = True
        self.fcu_hdg_trk_mode = "HDG"    # "HDG" or "TRK"
        self.fcu_vs_fpa_mode  = "V/S"    # "V/S" or "FPA"
        self.fcu_sel_hdg      = 87.0

        # Altitude section
        self.fcu_sel_alt     = 35000.0  # FCU knob display value (pending target)
        self.fcu_alt_step    = 1000     # 100 or 1000
        self.metric_alt      = False
        self.exped_active    = False

        # V/S section
        self.fcu_vs_managed  = True
        self.fcu_sel_vs      = 0.0

        # Button states
        self.ap1_engaged  = False
        self.ap2_engaged  = True
        self.athr_engaged = True
        self.loc_armed    = False
        self.appr_armed   = False

        # ── Route / airports ─────────────────────────────────────────────────
        self.wps = {
            "ABBLH":   move_point(self.lat, self.lon, 87 + 180, 15.0),
            "ABHEDVI": move_point(self.lat, self.lon, 87, 5.8),
            "ABHOBOL": move_point(self.lat, self.lon, 87, 38.0),
        }
        self.airports = {
            "KPHX": (33.4373, -112.0078),
            "KIWA": (33.3078, -111.6548),
        }

    # ──────────────────────────────────────────────────────────────────────
    def apply_fcu(self, patch: Dict[str, Any]):
        """Apply a partial FCU patch (from the PATCH /fcu endpoint)."""

        # ── Speed section ───────────────────────────────────────────────────
        if "fcu_spd_managed" in patch:
            self.fcu_spd_managed = bool(patch["fcu_spd_managed"])
            self._update_spd_mode()

        if "fcu_mach_mode" in patch:
            new_mode = bool(patch["fcu_mach_mode"])
            if new_mode != self.fcu_mach_mode:
                _atm = isa_atmosphere(self.altitude)
                if new_mode:
                    # SPD → MACH: convert current IAS target to Mach
                    _tas = self.fcu_sel_spd * math.sqrt(_ISA_RHO0 / _atm["rho"])
                    self.fcu_sel_mach = round(max(0.10, min(0.99,
                        _tas / _atm["sos_kt"])), 3)
                else:
                    # MACH → SPD: convert current Mach target to IAS
                    _tas = self.fcu_sel_mach * _atm["sos_kt"]
                    self.fcu_sel_spd = int(max(100, min(400,
                        round(_tas * math.sqrt(_atm["rho"] / _ISA_RHO0)))))
                self._crossover_ft = self._dynamic_crossover()
            self.fcu_mach_mode = new_mode
            self._user_mach_override = True   # user manually chose — keep it

        if "fcu_sel_mach" in patch:
            self.fcu_sel_mach = round(max(0.10, min(0.99, float(patch["fcu_sel_mach"]))), 3)
            self.fcu_spd_managed = False
            self._crossover_ft = self._dynamic_crossover()
            self._update_spd_mode()

        if "fcu_sel_spd" in patch:
            self.fcu_sel_spd = int(max(100, min(400, patch["fcu_sel_spd"])))
            self.fcu_spd_managed = False
            self._crossover_ft = self._dynamic_crossover()
            self._update_spd_mode()

        # ── LOC ─────────────────────────────────────────────────────────────
        if "loc_armed" in patch:
            self.loc_armed = bool(patch["loc_armed"])
            if self.loc_armed:
                self.lat_mode = "LOC*"
            else:
                self.lat_mode = "NAV" if self.fcu_hdg_managed else "HDG"

        # ── HDG/TRK toggle ──────────────────────────────────────────────────
        if "fcu_hdg_trk_mode" in patch:
            self.fcu_hdg_trk_mode = patch["fcu_hdg_trk_mode"]

        # ── V/S – FPA toggle ────────────────────────────────────────────────
        if "fcu_vs_fpa_mode" in patch:
            self.fcu_vs_fpa_mode = patch["fcu_vs_fpa_mode"]

        # ── HDG knob ────────────────────────────────────────────────────────
        if "fcu_sel_hdg" in patch:
            self.fcu_sel_hdg = float(patch["fcu_sel_hdg"]) % 360
            self.fcu_hdg_managed = False
            mode = "HDG" if self.fcu_hdg_trk_mode == "HDG" else "TRK"
            self.lat_mode = mode

        if "fcu_hdg_managed" in patch:
            self.fcu_hdg_managed = bool(patch["fcu_hdg_managed"])
            if self.fcu_hdg_managed:
                self.lat_mode = "NAV"

        # ── AP1 / AP2 / A-THR ───────────────────────────────────────────────
        if "ap1_engaged" in patch:
            self.ap1_engaged = bool(patch["ap1_engaged"])
            self.fd1 = self.ap1_engaged
            self.ap_num = 1 if self.ap1_engaged else (2 if self.ap2_engaged else 0)

        if "ap2_engaged" in patch:
            self.ap2_engaged = bool(patch["ap2_engaged"])
            self.fd2 = self.ap2_engaged
            self.ap_num = 2 if self.ap2_engaged else (1 if self.ap1_engaged else 0)

        if "athr_engaged" in patch:
            self.athr_engaged = bool(patch["athr_engaged"])
            self.athr = self.athr_engaged

        # ── ALT knob ───────────────────────────────────────────────────────
        if "fcu_sel_alt" in patch:
            raw = float(patch["fcu_sel_alt"])
            self.fcu_sel_alt = max(100.0, min(49900.0, float(raw)))
            # In OP DES/CLB, knob turn updates the live target immediately
            if self.alt_mode in ("OP DES", "OP CLB", "ALT*"):
                self.sel_alt = self.fcu_sel_alt
                self._alt_capture_vs = None

        # ── ALT PULL (commits fcu_sel_alt and starts climb/descent) ─────────
        if patch.get("alt_pull"):
            self.sel_alt = self.fcu_sel_alt
            self._alt_capture_vs = None
            if self.altitude < self.sel_alt - 50:
                if self.alt_mode != "OP CLB":
                    # Ramp VS from current value toward CLB-thrust equilibrium
                    saved_n1 = self.n1
                    self.n1 = A320_N1_CLB
                    t = self._thrust_from_n1()
                    self.n1 = saved_n1
                    self._vs_transition_target = round(self._compute_vs(t), 1)
                self.alt_mode = "OP CLB"
                self._vs_managed_override = True
                self._a_cmd_smooth = 0.0
            elif self.altitude > self.sel_alt + 50:
                if self.alt_mode != "OP DES":
                    # Ramp VS from current value toward idle-thrust equilibrium
                    saved_n1 = self.n1
                    self.n1 = A320_N1_IDLE
                    t = self._thrust_from_n1()
                    self.n1 = saved_n1
                    self._vs_transition_target = round(self._compute_vs(t), 1)
                self.alt_mode = "OP DES"
                self._vs_managed_override = True
                self._a_cmd_smooth = 0.0
            else:
                self.vs = 0.0
                self.alt_mode = "ALT"
                self._vs_transition_target = None

        # ── V/S PULL (commits target alt and starts climb/descent at fcu_sel_vs) ─
        if patch.get("vs_pull"):
            self.sel_alt = self.fcu_sel_alt
            self._alt_capture_vs = None
            if self.fcu_sel_vs != 0:
                # Gradual transition: don't snap self.vs, ramp toward target
                self._vs_transition_target = self.fcu_sel_vs
                self.fcu_vs_managed = False
                self._vs_managed_override = True
                self.alt_mode = "V/S"
            else:
                self._vs_transition_target = None
                self.vs = 0.0
                self.alt_mode = "ALT"

        if "fcu_alt_step" in patch:
            self.fcu_alt_step = int(patch["fcu_alt_step"])   # 100 or 1000

        if "metric_alt" in patch:
            self.metric_alt = bool(patch["metric_alt"])

        if "exped_active" in patch:
            self.exped_active = bool(patch["exped_active"])
            if self.exped_active:
                if self.altitude < self.sel_alt:
                    self.vs       = 2500
                    self.alt_mode = "CLB"
                else:
                    self.vs       = -3000
                    self.alt_mode = "DES"

        # ── Level off (smooth deceleration, like ALT* capture) ──────────────
        if patch.get("level_off") and self.vs != 0:
            self._leveloff_capture_vs = self.vs
            # Ramp VS to 0 at same pitch-rate-limited ramp
            self._vs_transition_target = 0.0
            # Coast distance: triangle area during deceleration
            decel_sec = abs(self.vs) / A320_VS_RAMP_RATE
            coast_ft  = abs(self.vs) * (decel_sec / 60.0) / 2.0
            direction = 1 if self.vs > 0 else -1
            raw_target = self.altitude + direction * max(coast_ft, 50)
            self._leveloff_target = round(raw_target / 100) * 100
            self.fcu_sel_vs = 0.0
            self._alt_capture_vs = None
            self._vs_managed_override = True   # keep altitude integrating
            self.alt_mode = "ALT*"             # show capture annunciation

        # ── V/S knob ────────────────────────────────────────────────────────
        if "fcu_sel_vs" in patch:
            self.fcu_sel_vs = max(-6000.0, min(6000.0, float(patch["fcu_sel_vs"])))
            # In V/S mode, knob changes apply gradually (realistic transition)
            if self.alt_mode == "V/S" and self._vs_managed_override:
                self._vs_transition_target = self.fcu_sel_vs
            # If currently level, resume toward sel_alt if pointed right way.
            elif self.vs == 0 and self.fcu_sel_vs != 0:
                # Leveled off — resume if the dialled VS points toward sel_alt
                alt_error = self.sel_alt - self.altitude
                going_right_way = (self.fcu_sel_vs > 0 and alt_error > 50) or \
                                  (self.fcu_sel_vs < 0 and alt_error < -50)
                if going_right_way:
                    self.vs = self.fcu_sel_vs
                    self.fcu_vs_managed = False
                    self.alt_mode = "CLB" if self.vs > 0 else "DES"
                    self._vs_managed_override = True

        if "fcu_vs_managed" in patch:
            self.fcu_vs_managed = bool(patch["fcu_vs_managed"])
            if self.fcu_vs_managed:
                self.fcu_sel_vs = 0.0
                self.vs = 0.0
                self._vs_managed_override = False
                self._alt_capture_vs = None
                self._vs_transition_target = None
                self.alt_mode = "ALT CRZ" if self.phase == "CRUISE" else "ALT"

        # ── APPR ────────────────────────────────────────────────────────────
        if "appr_armed" in patch:
            self.appr_armed = bool(patch["appr_armed"])
            if self.appr_armed:
                self.alt_mode = "G/S*"

        # ── Flap lever ─────────────────────────────────────────────────────
        if "flap_lever" in patch:
            self.flap_lever = max(0, min(4, int(patch["flap_lever"])))

        # ── Speed brake lever ──────────────────────────────────────────────
        if "spd_brk_lever" in patch:
            self.spd_brk_lever = max(0.0, min(1.0, float(patch["spd_brk_lever"])))

    # ──────────────────────────────────────────────────────────────────────
    def _dynamic_crossover(self) -> float:
        return _crossover_ft(self.fcu_sel_mach, self.fcu_sel_spd)

    # ──────────────────────────────────────────────────────────────────────
    def _update_spd_mode(self):
        # OP DES / OP CLB → thrust column shows thrust setting
        if self.alt_mode == "OP DES":
            self.spd_mode = "THR IDLE"
        elif self.alt_mode == "OP CLB":
            self.spd_mode = "THR CLB"
        # V/S → A/THR manages speed, always show MACH or SPEED
        elif self.alt_mode == "V/S":
            self.spd_mode = "MACH" if self.fcu_mach_mode else "SPEED"
        else:
            self.spd_mode = "MACH" if self.fcu_mach_mode else "SPEED"

    # ── Thrust helpers ─────────────────────────────────────────────────────

    def _compute_drag(self) -> float:
        """Drag force [N] at current TAS and altitude."""
        atm  = isa_atmosphere(self.altitude)
        V_ms = self.tas / 1.94384                          # kt → m/s
        q    = 0.5 * atm["rho"] * V_ms ** 2               # dynamic pressure
        CL   = (A320_MASS_KG * A320_G) / max(q * A320_WING_S, 1.0)
        # Altitude-dependent CD0 (Reynolds / compressibility correction)
        alt_kft = self.altitude / 1000.0
        cd0_alt = A320_CD0_ALT_K * max(0.0, alt_kft - A320_CD0_ALT_REF) ** A320_CD0_ALT_POW / A320_CD0_ALT_NORM if alt_kft > A320_CD0_ALT_REF else 0.0
        # Flap/slat drag increment (proportional to actual deployment angle)
        cd0_flap = self.slat_angle * (0.015 / 27.0) + self.flap_angle * (0.070 / 35.0)
        # Speed brake drag increment
        cd0_sbrk = self.spd_brk_actual * A320_SPD_BRK_CD0
        cd0_eff = A320_CD0 + cd0_alt + cd0_flap + cd0_sbrk
        CD   = cd0_eff + CL ** 2 / (math.pi * A320_AR * A320_OSWALD)
        return q * A320_WING_S * CD

    def _thrust_from_n1(self) -> float:
        """Total thrust [N] produced at current N1 and altitude."""
        atm   = isa_atmosphere(self.altitude)
        sigma = atm["rho"] / _ISA_RHO0
        if self.n1 <= A320_N1_IDLE:
            # Calibrated idle thrust (decoupled lapse rate)
            return A320_T_IDLE_SL * sigma ** A320_IDLE_EXP
        t_max = A320_T_MAX_SL_N * A320_N_ENGINES * sigma ** 0.6
        f    = (self.n1 - A320_N1_IDLE) / (100.0 - A320_N1_IDLE)
        frac = 0.04 + 0.96 * f ** 2
        return t_max * frac

    def _n1_for_level_mach(self) -> float:
        """N1 [%] required for level flight, including A/THR acceleration thrust.

        When the FCU target speed differs from current speed, the autothrust
        commands extra thrust (accelerate) or reduced thrust (decelerate)
        on top of the drag-balancing baseline — just like a real A320 A/THR.
        """
        D   = self._compute_drag()
        atm = isa_atmosphere(self.altitude)

        # ── Speed error → acceleration command ──────────────────────────────
        if self.fcu_mach_mode:
            tgt_tas_kt = self.fcu_sel_mach * atm["sos_kt"]
        else:
            tgt_tas_kt = self.fcu_sel_spd * math.sqrt(_ISA_RHO0 / atm["rho"])

        v_err_ms = (tgt_tas_kt - self.tas) / 1.94384        # kt → m/s
        Kp       = 0.08                                       # A/THR speed gain [1/s]
        a_cmd    = max(-0.50, min(0.50, Kp * v_err_ms))       # m/s², clamped

        # Total thrust = drag + acceleration force
        T_needed = D + A320_MASS_KG * a_cmd

        # ── Convert thrust → N1 ────────────────────────────────────────────
        t_max = A320_T_MAX_SL_N * A320_N_ENGINES * (atm["rho"] / _ISA_RHO0) ** 0.6
        frac  = T_needed / max(t_max, 1.0)
        if frac <= 0.04:
            return A320_N1_IDLE
        f = math.sqrt(max(0.0, (frac - 0.04) / 0.96))
        return max(A320_N1_IDLE, min(A320_N1_CLB, A320_N1_IDLE + f * (100.0 - A320_N1_IDLE)))

    def _compute_vs(self, thrust_n: float) -> float:
        """Vertical speed [FPM] from thrust–drag energy balance."""
        D         = self._compute_drag()
        W         = A320_MASS_KG * A320_G
        sin_gamma = max(-0.35, min(0.35, (thrust_n - D) / W))
        return self.tas * 101.269 * sin_gamma    # kt × 101.269 → FPM

    # ──────────────────────────────────────────────────────────────────────
    def update(self, dt: float):
        self.sim_time += dt

        # ── Flap/Slat configuration & transition ──────────────────────────
        if self.flap_lever == 0:
            _tgt_conf = 0
        elif self.flap_lever == 1:
            _tgt_conf = 1 if self.ias > A320_CONF1F_THRESHOLD else 2
        elif self.flap_lever == 2:
            _tgt_conf = 3
        elif self.flap_lever == 3:
            _tgt_conf = 4
        else:
            _tgt_conf = 5
        self.flap_conf_index = _tgt_conf
        _fcfg = A320_FLAP_TABLE[_tgt_conf]

        # Gradual angle transition (slats and flaps move at realistic rates)
        for _attr, _target, _rate in [
            ("slat_angle", float(_fcfg["slat"]), A320_SLAT_RATE),
            ("flap_angle", float(_fcfg["flap"]), A320_FLAP_RATE),
        ]:
            _cur = getattr(self, _attr)
            _err = _target - _cur
            _max = _rate * dt
            if abs(_err) <= _max:
                setattr(self, _attr, _target)
            else:
                setattr(self, _attr, _cur + math.copysign(_max, _err))

        # ── Speed brake transition ────────────────────────────────────────
        _sb_err = self.spd_brk_lever - self.spd_brk_actual
        _sb_max = A320_SPD_BRK_RATE * dt
        if abs(_sb_err) <= _sb_max:
            self.spd_brk_actual = self.spd_brk_lever
        else:
            self.spd_brk_actual += math.copysign(_sb_max, _sb_err)

        # ── Phase transitions (driven by altitude, not timers) ──────────────
        if not self._vs_managed_override:
            # CRUISE → DESCENT: triggered when pilot commands descent via FCU
            if self.phase == "CRUISE" and self.vs < -50:
                self.phase = "DESCENT"

            if self.phase == "DESCENT" and self.altitude <= 10000:
                self.phase    = "APPROACH"
                self.alt_mode = "ALT"
                self.vs       = -600.0
                self.pitch    = 1.0

            if self.phase == "APPROACH" and self.altitude <= 3000:
                self.phase    = "FINAL"
                self.alt_mode = "G/S"
                self.vs       = -700.0
                self.pitch    = -3.0

        # ── N1 spool — target depends on vertical mode ───────────────────────
        if self.alt_mode == "OP DES":
            n1_target = A320_N1_IDLE
        elif self.alt_mode == "OP CLB":
            n1_target = A320_N1_CLB
        else:
            n1_target = self._n1_for_level_mach()

        n1_err = n1_target - self.n1
        self.n1 = round(
            max(A320_N1_MIN, min(100.0, self.n1 + max(-4.0, min(4.0, n1_err)) * dt)),
            1,
        )

        # ── VS transition (gradual ramp toward target, pitch-rate limited) ──
        if self._vs_transition_target is not None:
            vs_err = self._vs_transition_target - self.vs
            max_change = A320_VS_RAMP_RATE * dt   # ~300 FPM per second
            if abs(vs_err) <= max_change:
                self.vs = self._vs_transition_target
                self._vs_transition_target = None
            else:
                self.vs = round(self.vs + math.copysign(max_change, vs_err), 1)

        # ── Physics VS + speed for OP DES / OP CLB (energy balance) ────────
        # In OP DES/CLB, speed has priority — pitch controls speed,
        # VS is whatever the energy balance gives.
        #   sin(γ) = (T − D) / (m·g) − a_cmd / g
        #   a_cmd  = Kp · (V_target − V_current)
        _spd_from_physics = False
        if (self.alt_mode in ("OP DES", "OP CLB")
                and self._vs_managed_override
                and self._alt_capture_vs is None
                and self._vs_transition_target is None):
            _spd_from_physics = True
            thrust = self._thrust_from_n1()
            D      = self._compute_drag()
            _patm  = isa_atmosphere(self.altitude)

            # Target TAS from FCU selection
            if self.fcu_mach_mode:
                tgt_tas_kt = self.fcu_sel_mach * _patm["sos_kt"]
            else:
                tgt_tas_kt = self.fcu_sel_spd * math.sqrt(_ISA_RHO0 / _patm["rho"])

            # Speed error → proportional acceleration command
            V_ms   = self.tas / 1.94384          # current TAS [m/s]
            tgt_ms = tgt_tas_kt / 1.94384        # target TAS [m/s]
            v_err  = tgt_ms - V_ms

            Kp    = 0.04                          # gain [1/s]
            a_cmd = max(-0.30, min(0.30, Kp * v_err))  # ±0.30 m/s² operational

            # Rate-limit acceleration command (pitch servo lag)
            a_err = a_cmd - self._a_cmd_smooth
            max_a_chg = A320_ACMD_RATE * dt
            if abs(a_err) <= max_a_chg:
                self._a_cmd_smooth = a_cmd
            else:
                self._a_cmd_smooth += math.copysign(max_a_chg, a_err)
            a_cmd = self._a_cmd_smooth

            # Safety: OP DES never climbs, OP CLB never descends
            a_limit = (thrust - D) / A320_MASS_KG
            if self.alt_mode == "OP DES":
                a_cmd = max(a_limit, a_cmd)     # floor: no climb
            elif self.alt_mode == "OP CLB":
                a_cmd = min(a_limit, a_cmd)     # ceiling: no descent

            # Energy balance → flight path angle (includes acceleration cost)
            W         = A320_MASS_KG * A320_G
            sin_gamma = (thrust - D) / W - a_cmd / A320_G
            sin_gamma = max(-0.35, min(0.35, sin_gamma))
            self.vs   = round(self.tas * 101.269 * sin_gamma, 1)

            # Integrate speed
            new_V_ms = max(50.0 / 1.94384, V_ms + a_cmd * dt)
            self.tas  = round(new_V_ms * 1.94384, 1)
            self.ias  = round(self.tas * math.sqrt(_patm["rho"] / _ISA_RHO0), 1)
            self.mach = self.tas / _patm["sos_kt"]
            self.actual_spd = self.ias

        # ── Altitude ─────────────────────────────────────────────────────────
        if self.phase != "CRUISE" or self._vs_managed_override:
            self.altitude += self.vs * (dt / 60.0)
            self.altitude  = max(self.altitude, 500.0)

        # Level off — smooth deceleration (VS ramped by _vs_transition_target)
        if self._leveloff_target is not None:
            # Overshot target altitude?
            overshot = (self._leveloff_capture_vs is not None and
                        ((self._leveloff_capture_vs < 0 and self.altitude <= self._leveloff_target) or
                         (self._leveloff_capture_vs > 0 and self.altitude >= self._leveloff_target)))
            # VS finished ramping to 0?
            vs_done = abs(self.vs) < 20 and self._vs_transition_target is None

            if overshot or vs_done:
                if overshot:
                    self.altitude = self._leveloff_target
                self.vs = 0.0
                self.alt_mode = "ALT"
                self._vs_managed_override = False
                self._leveloff_target = None
                self._leveloff_capture_vs = None
                self._vs_transition_target = None

        # Altitude capture — smooth deceleration toward sel_alt
        elif self._vs_managed_override and self.vs != 0:
            remaining = abs(self.sel_alt - self.altitude)

            # Overshot or arrived — hard stop
            # Proximity check: prevents false trigger when VS temporarily
            # reverses during OP DES/CLB speed transitions (energy trade).
            if (self.vs < 0 and self.altitude <= self.sel_alt) or \
               (self.vs > 0 and self.altitude >= self.sel_alt
                and abs(self.altitude - self.sel_alt) < 200):
                self.altitude = self.sel_alt
                self.vs = 0.0
                self.fcu_sel_vs = 0.0
                self.alt_mode = "ALT"
                self._vs_managed_override = False
                self.fcu_vs_managed = True
                self._alt_capture_vs = None
                self._vs_transition_target = None

            else:
                # Enter capture zone?
                capture_ft = max(abs(self._alt_capture_vs or self.vs) * 0.05, 50.0)

                if remaining <= capture_ft:
                    if self._alt_capture_vs is None:
                        self._alt_capture_vs = self.vs
                        self._vs_transition_target = None   # capture takes over
                        capture_ft = max(abs(self._alt_capture_vs) * 0.05, 50.0)
                    self.alt_mode = "ALT*"
                    ratio = remaining / capture_ft
                    # Scale VS down, minimum 50 FPM so we always reach target
                    self.vs = math.copysign(
                        max(abs(self._alt_capture_vs) * ratio, 50.0),
                        self._alt_capture_vs,
                    )
                else:
                    self._alt_capture_vs = None

        # ── Crossover auto-switch (200 ft hysteresis) ─────────────────────────
        # Only auto-switch if user hasn't manually overridden via SPD/MACH button.
        self._crossover_ft = self._dynamic_crossover()
        if not self._user_mach_override:
            if self.altitude > self._crossover_ft + 200 and not self.fcu_mach_mode:
                # IAS → MACH: convert current IAS target to equivalent Mach
                _xatm = isa_atmosphere(self.altitude)
                _xtas = self.fcu_sel_spd * math.sqrt(_ISA_RHO0 / _xatm["rho"])
                self.fcu_sel_mach = round(max(0.10, min(0.99,
                    _xtas / _xatm["sos_kt"])), 3)
                self.fcu_mach_mode = True
                self._crossover_ft = self._dynamic_crossover()
                self._update_spd_mode()
            elif self.altitude < self._crossover_ft - 200 and self.fcu_mach_mode:
                # MACH → IAS: convert current Mach target to equivalent IAS
                _xatm = isa_atmosphere(self.altitude)
                _xtas = self.fcu_sel_mach * _xatm["sos_kt"]
                self.fcu_sel_spd = int(max(100, min(400,
                    round(_xtas * math.sqrt(_xatm["rho"] / _ISA_RHO0)))))
                self.fcu_mach_mode = False
                self._crossover_ft = self._dynamic_crossover()
                self._update_spd_mode()

        # ── Speed: gradually approach FCU target ──────────────────────────
        # In OP DES/CLB, speed was already computed by physics above.
        # For other modes, use fixed-rate acceleration model.
        if not _spd_from_physics:
            _atm = isa_atmosphere(self.altitude)
            _SPD_ACCEL_KT = 2.0     # IAS acceleration rate  [kt / s]
            _MACH_ACCEL   = 0.004   # Mach acceleration rate [1 / s]

            if self.fcu_mach_mode:
                tgt  = self.fcu_sel_mach
                err  = tgt - self.mach
                maxd = _MACH_ACCEL * dt
                if abs(err) <= maxd:
                    self.mach = tgt
                else:
                    self.mach = self.mach + math.copysign(maxd, err)
                self.tas = round(self.mach * _atm["sos_kt"], 1)
                self.ias = round(self.tas * math.sqrt(_atm["rho"] / _ISA_RHO0), 1)
            else:
                tgt  = float(self.fcu_sel_spd)
                err  = tgt - self.ias
                maxd = _SPD_ACCEL_KT * dt
                if abs(err) <= maxd:
                    self.ias = tgt
                else:
                    self.ias = self.ias + math.copysign(maxd, err)
                self.tas = round(self.ias * math.sqrt(_ISA_RHO0 / _atm["rho"]), 1)
                self.mach = round(self.tas / _atm["sos_kt"], 3)
            self.actual_spd = self.ias
        self._update_spd_mode()

        # ── Speed trend (smoothed IAS acceleration → kt shown in 10 sec) ──
        if self._prev_ias is not None and dt > 0:
            raw_accel = (self.ias - self._prev_ias) / dt   # kt/s
            # Exponential smoothing (tau ≈ 1s)
            alpha = min(1.0, dt / 1.0)
            self._ias_accel = self._ias_accel * (1 - alpha) + raw_accel * alpha
        self._prev_ias = self.ias

        wind_comp = self.wind_speed * math.cos(to_rad(self.wind_dir - self.track))
        self.gs   = round(max(self.tas + wind_comp, 50.0), 1)

        # ── Heading: turn toward fcu_sel_hdg at 3°/second ───────────────────
        hdg_error = (self.fcu_sel_hdg - self.heading + 540) % 360 - 180
        max_turn  = 3.0 * dt
        turn_amount = max(-max_turn, min(max_turn, hdg_error))
        self.heading = (self.heading + turn_amount) % 360
        self.track   = self.heading

        # ── Bank angle from turn rate (max 15° — midpoint of 10°/20° markers) ─
        turn_rate = turn_amount / dt if dt > 0 else 0.0     # deg/s
        target_roll = max(-15.0, min(15.0, turn_rate * 5.0)) # ~15° at 3°/s
        # Smooth roll transition: 5°/s roll rate
        max_roll_change = 5.0 * dt
        roll_error = target_roll - self.roll
        self.roll += max(-max_roll_change, min(max_roll_change, roll_error))

        # ── Position ─────────────────────────────────────────────────────────
        dist_nm = (self.gs / 3600.0) * dt
        self.lat, self.lon = move_point(self.lat, self.lon, self.track, dist_nm)

    # ──────────────────────────────────────────────────────────────────────
    def _active_waypoint(self):
        d_hedvi = haversine(self.lat, self.lon, *self.wps["ABHEDVI"])
        if d_hedvi > 1.0:
            return "ABHEDVI", *self.wps["ABHEDVI"]
        return "ABHOBOL", *self.wps["ABHOBOL"]

    # ──────────────────────────────────────────────────────────────────────
    def get_state(self) -> Dict[str, Any]:
        aw_name, aw_lat, aw_lon = self._active_waypoint()
        aw_dist = haversine(self.lat, self.lon, aw_lat, aw_lon)
        aw_brg  = bearing_to(self.lat, self.lon, aw_lat, aw_lon)

        if self.gs > 10:
            eta_s   = int(aw_dist / self.gs * 3600)
            eta_abs = (self.base_clock - int(self.sim_time) + eta_s) % 86400
            aw_eta  = f"{eta_abs // 3600:02d}:{(eta_abs % 3600) // 60:02d}"
        else:
            aw_eta = "--:--"

        wind_cross = self.wind_speed * math.sin(to_rad(self.wind_dir - self.track))
        drift      = math.degrees(math.atan2(wind_cross, max(self.tas, 1))) if self.tas > 0 else 0.0

        vor1_dist = haversine(self.lat, self.lon, self.vor1_lat, self.vor1_lon)
        vor1_brg  = bearing_to(self.lat, self.lon, self.vor1_lat, self.vor1_lon)

        waypoints = []
        passed = {"ABBLH": True, "ABHEDVI": False, "ABHOBOL": False}
        for name in ["ABBLH", "ABHEDVI", "ABHOBOL"]:
            lat, lon = self.wps[name]
            waypoints.append({
                "name": name, "lat": lat, "lon": lon,
                "bearing":  round(bearing_to(self.lat, self.lon, lat, lon), 1),
                "distance": round(haversine(self.lat, self.lon, lat, lon), 1),
                "is_airport": False,
                "is_active":  name == aw_name,
                "is_passed":  passed[name],
            })
        for name, (lat, lon) in self.airports.items():
            waypoints.append({
                "name": name, "lat": lat, "lon": lon,
                "bearing":  round(bearing_to(self.lat, self.lon, lat, lon), 1),
                "distance": round(haversine(self.lat, self.lon, lat, lon), 1),
                "is_airport": True, "is_active": False, "is_passed": False,
            })

        # Current flap configuration
        _flap_cfg = A320_FLAP_TABLE[self.flap_conf_index]

        # Effective VMO: lower of VMO, MMO-equivalent IAS, and lever VFE
        _vmo_atm = isa_atmosphere(self.altitude)
        _mmo_ias = A320_MMO * _vmo_atm["sos_kt"] * math.sqrt(_vmo_atm["rho"] / _ISA_RHO0)
        _lever_vfe = A320_LEVER_VFE[self.flap_lever]
        _vmo_eff = min(A320_VMO, _mmo_ias, _lever_vfe)

        # Target speed in IAS (for PFD speed bug)
        if self.fcu_mach_mode:
            _tgt_tas = self.fcu_sel_mach * _vmo_atm["sos_kt"]
            _tgt_ias = round(_tgt_tas * math.sqrt(_vmo_atm["rho"] / _ISA_RHO0))
        else:
            _tgt_ias = self.fcu_sel_spd

        return {
            # ── Aircraft state ──────────────────────────────────────────────
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "altitude": round(self.altitude),
            "sel_alt":  int(self.sel_alt),
            "vmo":          round(_vmo_eff),
            "target_spd_ias": _tgt_ias,
            "vls":          _flap_cfg["vls"],
            "alpha_prot":   _flap_cfg["alpha_prot"],
            "alpha_max":    _flap_cfg["alpha_max"],
            "mach":         round(self.mach, 3),
            "tas":          round(self.tas),
            "ias":          round(self.ias),
            "spd_trend":    round(self._ias_accel * 10, 1),  # kt change in 10 sec
            "actual_spd":   round(self.actual_spd, 1),
            "gs":           round(self.gs),
            "crossover_ft": round(self._crossover_ft),
            "pitch":    round(self.pitch, 1),
            "roll":     round(self.roll, 1),
            "heading":  round(self.heading, 1),
            "track":    round(self.track, 1),
            "vs":       round(self.vs),
            "n1":       round(self.n1, 1),
            # ── Flap/Slat ────────────────────────────────────────────────
            "flap_lever":    self.flap_lever,
            "flap_conf":     _flap_cfg["name"],
            "slat_angle":    round(self.slat_angle, 1),
            "flap_angle":    round(self.flap_angle, 1),
            "vfe":           _flap_cfg["vfe"],
            "vfe_next":      {0: 230, 1: 200, 2: 185, 3: 177}.get(self.flap_lever),
            "gd_speed":      A320_GD_SPEED,
            "s_speed":       A320_S_SPEED,
            "f_speed":       A320_F_SPEED,
            # ── Speed Brake ──────────────────────────────────────────────
            "spd_brk_lever":  self.spd_brk_lever,
            "spd_brk_actual": round(self.spd_brk_actual, 2),
            "wind_dir": round(self.wind_dir),
            "wind_speed": round(self.wind_speed),
            # ── AP / mode strings (read by PFD) ────────────────────────────
            "spd_mode": self.spd_mode,
            "alt_mode": self.alt_mode,
            "lat_mode": self.lat_mode,
            "ap_num":   self.ap_num,
            "fd1":      self.fd1,
            "fd2":      self.fd2,
            "athr":     self.athr,
            # ── Baro / VOR ──────────────────────────────────────────────────
            "baro_std":   self.baro_std,
            "baro_value": round(self.baro_value, 2),
            "vor1_id":       self.vor1_id,
            "vor1_distance": round(vor1_dist, 1),
            "vor1_bearing":  round(vor1_brg, 1),
            # ── Navigation ──────────────────────────────────────────────────
            "active_wp_name":     aw_name,
            "active_wp_bearing":  round(aw_brg),
            "active_wp_distance": round(aw_dist, 1),
            "active_wp_eta":      aw_eta,
            "drift":  round(drift, 1),
            "phase":  self.phase,
            "sim_time": round(self.sim_time, 1),
            "waypoints": waypoints,
            # ── FCU state (read by FCU component) ──────────────────────────
            "fcu_spd_managed":  self.fcu_spd_managed,
            "fcu_mach_mode":    self.fcu_mach_mode,
            "fcu_sel_mach":     self.fcu_sel_mach,
            "fcu_sel_spd":      self.fcu_sel_spd,
            "fcu_hdg_managed":  self.fcu_hdg_managed,
            "fcu_hdg_trk_mode": self.fcu_hdg_trk_mode,
            "fcu_vs_fpa_mode":  self.fcu_vs_fpa_mode,
            "fcu_sel_hdg":      round(self.fcu_sel_hdg, 1),
            "fcu_sel_vs":       round(self.fcu_sel_vs),
            "fcu_vs_managed":   self.fcu_vs_managed,
            "fcu_sel_alt":      int(self.fcu_sel_alt),
            "fcu_alt_step":     self.fcu_alt_step,
            "metric_alt":       self.metric_alt,
            "exped_active":     self.exped_active,
            "ap1_engaged":      self.ap1_engaged,
            "ap2_engaged":      self.ap2_engaged,
            "athr_engaged":     self.athr_engaged,
            "loc_armed":        self.loc_armed,
            "appr_armed":       self.appr_armed,
        }
