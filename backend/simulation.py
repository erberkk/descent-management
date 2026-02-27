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
A320_CD0       = 0.024       # zero-lift drag coefficient (clean cruise)
A320_G         = 9.80665     # gravitational acceleration [m/s²]

# Thrust model — CFM56-5B4 (approximate)
A320_T_MAX_SL_N = 120_000   # N per engine, sea-level static
A320_N_ENGINES  = 2
A320_N1_IDLE    = 24.0      # % N1 at ground/flight IDLE
A320_N1_CLB     = 88.0      # % N1 at CLB (climb) thrust
A320_N1_MIN     = 18.0      # % N1 absolute minimum

# Crossover altitude for M0.78 / 300 kt IAS in standard ISA  →  ≈ FL270
A320_CROSSOVER_FT = _crossover_ft(0.78, 300)


class Aircraft:
    def __init__(self):
        # ── Position ────────────────────────────────────────────────────────
        self.lat = 33.10
        self.lon = -113.00

        # ── Altitude ────────────────────────────────────────────────────────
        self.altitude = 27000.0
        self.sel_alt  = 27000.0       # driven by FCU

        # ── Attitude ────────────────────────────────────────────────────────
        self.pitch = 2.5
        self.roll  = 0.0

        # ── Navigation ──────────────────────────────────────────────────────
        self.heading = 87.0
        self.track   = 87.0
        self.vs      = 0.0

        # ── Wind ────────────────────────────────────────────────────────────
        self.wind_dir   = 234.0
        self.wind_speed = 22.0

        # ── Speeds (ISA-derived at initial altitude) ─────────────────────────
        self.mach = 0.788
        _atm      = isa_atmosphere(self.altitude)
        self.tas  = round(self.mach * _atm["sos_kt"], 1)
        self.ias  = round(self.tas * math.sqrt(_atm["rho"] / _ISA_RHO0), 1)
        self.gs   = round(max(self.tas + self.wind_speed * math.cos(
                        to_rad(self.wind_dir - self.heading)), 50.0), 1)
        self.actual_spd = self.ias   # kept for API compatibility

        # ── PFD mode annunciator strings ─────────────────────────────────────
        self.spd_mode = "MACH"
        self.alt_mode = "ALTCRZ"
        self.lat_mode = "NAV"

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
        self.descent_trigger = 60.0
        self._vs_managed_override = False   # True when FCU VS knob is active
        self._leveloff_target     = None    # Temporary stop altitude from LVL OFF
        self._alt_capture_vs      = None    # VS at moment of entering capture zone

        # ── FCU state (mirrors the physical FCU panel) ───────────────────────
        # Speed section
        self.fcu_spd_managed  = True
        self.fcu_mach_mode    = True
        self.fcu_sel_mach     = 0.788
        self.fcu_sel_spd      = 300

        # Lateral section
        self.fcu_hdg_managed  = True
        self.fcu_hdg_trk_mode = "HDG"    # "HDG" or "TRK"
        self.fcu_vs_fpa_mode  = "V/S"    # "V/S" or "FPA"
        self.fcu_sel_hdg      = 87.0

        # Altitude section
        self.fcu_sel_alt     = 27000.0  # FCU knob display value (pending target)
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
            self.fcu_mach_mode = bool(patch["fcu_mach_mode"])

        if "fcu_sel_mach" in patch:
            self.fcu_sel_mach = round(max(0.10, min(0.99, float(patch["fcu_sel_mach"]))), 3)
            self.fcu_spd_managed = False
            self._update_spd_mode()
            # Sync: convert Mach → target IAS at current altitude
            _atm = isa_atmosphere(self.altitude)
            _tas = self.fcu_sel_mach * _atm["sos_kt"]
            self.fcu_sel_spd = int(round(max(100, min(400, _tas * math.sqrt(_atm["rho"] / _ISA_RHO0)))))

        if "fcu_sel_spd" in patch:
            self.fcu_sel_spd = int(max(100, min(400, patch["fcu_sel_spd"])))
            self.fcu_spd_managed = False
            self._update_spd_mode()
            # Sync: convert target IAS → Mach at current altitude
            _atm = isa_atmosphere(self.altitude)
            _tas = self.fcu_sel_spd * math.sqrt(_ISA_RHO0 / _atm["rho"])
            self.fcu_sel_mach = round(max(0.10, min(0.99, _tas / _atm["sos_kt"])), 3)

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

        # ── ALT knob (display only — does NOT start climb/descent) ──────────
        if "fcu_sel_alt" in patch:
            raw = float(patch["fcu_sel_alt"])
            self.fcu_sel_alt = max(100.0, min(49900.0, float(raw)))

        # ── ALT PULL (commits fcu_sel_alt and starts climb/descent) ─────────
        if patch.get("alt_pull"):
            self.sel_alt = self.fcu_sel_alt
            self._alt_capture_vs = None
            if self.altitude < self.sel_alt - 50:
                self.vs = 0.0       # physics computes VS on first update() tick
                self.alt_mode = "OP CLB"
                self._vs_managed_override = True
            elif self.altitude > self.sel_alt + 50:
                self.vs = 0.0       # physics computes VS on first update() tick
                self.alt_mode = "OP DES"
                self._vs_managed_override = True
            else:
                self.vs = 0.0
                self.alt_mode = "ALT"

        # ── V/S PULL (commits target alt and starts climb/descent at fcu_sel_vs) ─
        if patch.get("vs_pull"):
            self.sel_alt = self.fcu_sel_alt
            self._alt_capture_vs = None
            if self.fcu_sel_vs != 0:
                self.vs = self.fcu_sel_vs
                self.fcu_vs_managed = False
                self._vs_managed_override = True
                self.alt_mode = "V/S"
            else:
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

        # ── Level off ────────────────────────────────────────────────────────
        if patch.get("level_off") and self.vs != 0:
            direction = 1 if self.vs > 0 else -1
            self._leveloff_target = round((self.altitude + direction * 100) / 100) * 100
            self.fcu_sel_vs = 0.0
            self._alt_capture_vs = None
            # Clear the override flag so the fcu_sel_vs:0 in the same patch
            # does not immediately zero vs before _leveloff_target is reached
            self._vs_managed_override = False
            # sel_alt stays unchanged — pilot keeps full control of target altitude

        # ── V/S knob ────────────────────────────────────────────────────────
        if "fcu_sel_vs" in patch:
            self.fcu_sel_vs = max(-6000.0, min(6000.0, float(patch["fcu_sel_vs"])))
            # New V/S is only armed — it applies when V/S PULL is pressed.
            # Exception: if currently level, resume toward sel_alt if pointed right way.
            if self.vs == 0 and self.fcu_sel_vs != 0:
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
                self.alt_mode = "ALTCRZ" if self.phase == "CRUISE" else "ALT"

        # ── APPR ────────────────────────────────────────────────────────────
        if "appr_armed" in patch:
            self.appr_armed = bool(patch["appr_armed"])
            if self.appr_armed:
                self.alt_mode = "G/S*"

    # ──────────────────────────────────────────────────────────────────────
    def _update_spd_mode(self):
        if self.fcu_spd_managed:
            self.spd_mode = "MACH"
        else:
            if self.fcu_mach_mode:
                self.spd_mode = f".{int(self.fcu_sel_mach * 1000):03d}"
            else:
                self.spd_mode = f"{self.fcu_sel_spd}KT"

    # ── Thrust helpers ─────────────────────────────────────────────────────

    def _compute_drag(self) -> float:
        """Drag force [N] at current TAS and altitude."""
        atm  = isa_atmosphere(self.altitude)
        V_ms = self.tas / 1.94384                          # kt → m/s
        q    = 0.5 * atm["rho"] * V_ms ** 2               # dynamic pressure
        CL   = (A320_MASS_KG * A320_G) / max(q * A320_WING_S, 1.0)
        CD   = A320_CD0 + CL ** 2 / (math.pi * A320_AR * A320_OSWALD)
        return q * A320_WING_S * CD

    def _thrust_from_n1(self) -> float:
        """Total thrust [N] produced at current N1 and altitude."""
        atm   = isa_atmosphere(self.altitude)
        t_max = A320_T_MAX_SL_N * A320_N_ENGINES * (atm["rho"] / _ISA_RHO0) ** 0.6
        if self.n1 <= A320_N1_IDLE:
            frac = 0.04
        else:
            f    = (self.n1 - A320_N1_IDLE) / (100.0 - A320_N1_IDLE)
            frac = 0.04 + 0.96 * f ** 2
        return t_max * frac

    def _n1_for_level_mach(self) -> float:
        """N1 [%] required to maintain current Mach in level flight."""
        D     = self._compute_drag()
        atm   = isa_atmosphere(self.altitude)
        t_max = A320_T_MAX_SL_N * A320_N_ENGINES * (atm["rho"] / _ISA_RHO0) ** 0.6
        frac  = D / max(t_max, 1.0)
        if frac <= 0.04:
            return A320_N1_IDLE
        f = math.sqrt(max(0.0, (frac - 0.04) / 0.96))
        return min(A320_N1_CLB, A320_N1_IDLE + f * (100.0 - A320_N1_IDLE))

    def _compute_vs(self, thrust_n: float) -> float:
        """Vertical speed [FPM] from thrust–drag energy balance."""
        D         = self._compute_drag()
        W         = A320_MASS_KG * A320_G
        sin_gamma = max(-0.35, min(0.35, (thrust_n - D) / W))
        return self.tas * 101.269 * sin_gamma    # kt × 101.269 → FPM

    # ──────────────────────────────────────────────────────────────────────
    def update(self, dt: float):
        self.sim_time += dt

        # ── Phase transitions (only when FCU VS is not manually overridden) ──
        if not self._vs_managed_override:
            if self.phase == "CRUISE" and self.sim_time >= self.descent_trigger:
                self.phase    = "DESCENT"
                self.alt_mode = "DES"
                self.vs       = -1800.0
                self.pitch    = -3.0

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

        # ── Physics VS for OP CLB / OP DES (outside capture zone) ───────────
        if (self.alt_mode in ("OP DES", "OP CLB")
                and self._vs_managed_override
                and self._alt_capture_vs is None):
            thrust = self._thrust_from_n1()
            self.vs = round(self._compute_vs(thrust), 1)

        # ── Altitude ─────────────────────────────────────────────────────────
        if self.phase != "CRUISE" or self._vs_managed_override:
            self.altitude += self.vs * (dt / 60.0)
            self.altitude  = max(self.altitude, 500.0)

        # Level off at LVL OFF target (100 ft coast, doesn't change sel_alt)
        if self._leveloff_target is not None:
            if (self.vs < 0 and self.altitude <= self._leveloff_target) or \
               (self.vs > 0 and self.altitude >= self._leveloff_target):
                self.altitude = self._leveloff_target
                self.vs = 0.0
                self.alt_mode = "ALT"
                self._vs_managed_override = False
                self._leveloff_target = None

        # Altitude capture — smooth deceleration toward sel_alt
        elif self._vs_managed_override and self.vs != 0:
            remaining = abs(self.sel_alt - self.altitude)

            # Overshot or arrived — hard stop
            if (self.vs < 0 and self.altitude <= self.sel_alt) or \
               (self.vs > 0 and self.altitude >= self.sel_alt):
                self.altitude = self.sel_alt
                self.vs = 0.0
                self.fcu_sel_vs = 0.0
                self.alt_mode = "ALT"
                self._vs_managed_override = False
                self.fcu_vs_managed = True
                self._alt_capture_vs = None

            else:
                # Enter capture zone?
                capture_ft = max(abs(self._alt_capture_vs or self.vs) * 0.05, 50.0)

                if remaining <= capture_ft:
                    if self._alt_capture_vs is None:
                        self._alt_capture_vs = self.vs
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

        # ── Speed: ISA atmosphere → Mach → TAS → IAS ────────────────────────
        # Mach is held at the commanded value (no thrust dynamics yet).
        # TAS and IAS update realistically as altitude changes.
        self.mach = self.fcu_sel_mach
        _atm = isa_atmosphere(self.altitude)
        self.tas  = round(self.mach * _atm["sos_kt"], 1)
        self.ias  = round(self.tas * math.sqrt(_atm["rho"] / _ISA_RHO0), 1)
        self.actual_spd = self.ias

        wind_comp = self.wind_speed * math.cos(to_rad(self.wind_dir - self.track))
        self.gs   = round(max(self.tas + wind_comp, 50.0), 1)

        # ── Heading: turn toward fcu_sel_hdg at 3°/second ───────────────────
        hdg_error = (self.fcu_sel_hdg - self.heading + 540) % 360 - 180
        max_turn  = 3.0 * dt
        self.heading = (self.heading + max(-max_turn, min(max_turn, hdg_error))) % 360
        self.track   = self.heading

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

        return {
            # ── Aircraft state ──────────────────────────────────────────────
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "altitude": round(self.altitude),
            "sel_alt":  int(self.sel_alt),
            "mach":         round(self.mach, 3),
            "tas":          round(self.tas),
            "ias":          round(self.ias),
            "actual_spd":   round(self.actual_spd, 1),
            "gs":           round(self.gs),
            "crossover_ft": round(A320_CROSSOVER_FT),
            "pitch":    round(self.pitch, 1),
            "roll":     round(self.roll, 1),
            "heading":  round(self.heading, 1),
            "track":    round(self.track, 1),
            "vs":       round(self.vs),
            "n1":       round(self.n1, 1),
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
