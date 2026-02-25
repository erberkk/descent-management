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


class Aircraft:
    def __init__(self):
        # ── Position ────────────────────────────────────────────────────────
        self.lat = 33.10
        self.lon = -113.00

        # ── Altitude ────────────────────────────────────────────────────────
        self.altitude = 27000.0
        self.sel_alt  = 36000.0       # driven by FCU

        # ── Speeds ──────────────────────────────────────────────────────────
        self.mach = 0.788
        self.tas  = 464.0
        self.gs   = 478.0

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

        # ── Phase control ────────────────────────────────────────────────────
        self.phase           = "CRUISE"
        self.descent_trigger = 60.0
        self._vs_managed_override = False   # True when FCU VS knob is active

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

        if "fcu_sel_spd" in patch:
            self.fcu_sel_spd = int(max(100, min(400, patch["fcu_sel_spd"])))
            self.fcu_spd_managed = False
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
            self.heading  = self.fcu_sel_hdg
            self.track    = self.fcu_sel_hdg

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

        # ── ALT knob ────────────────────────────────────────────────────────
        if "fcu_sel_alt" in patch:
            raw  = float(patch["fcu_sel_alt"])
            step = self.fcu_alt_step
            snapped = round(raw / step) * step
            self.sel_alt = max(100.0, min(49900.0, snapped))
            # Determine new alt mode
            if self.altitude < self.sel_alt - 50:
                self.alt_mode = "CLB"
            elif self.altitude > self.sel_alt + 50:
                self.alt_mode = "DES"
            else:
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

        # ── V/S knob ────────────────────────────────────────────────────────
        if "fcu_sel_vs" in patch:
            self.fcu_sel_vs     = max(-6000.0, min(6000.0, float(patch["fcu_sel_vs"])))
            self.fcu_vs_managed = False
            self.vs             = self.fcu_sel_vs
            self._vs_managed_override = True
            self.alt_mode = "V/S" if self.fcu_vs_fpa_mode == "V/S" else "FPA"

        if "fcu_vs_managed" in patch:
            self.fcu_vs_managed = bool(patch["fcu_vs_managed"])
            if self.fcu_vs_managed:
                self.fcu_sel_vs = 0.0
                self.vs = 0.0
                self._vs_managed_override = False
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

        # ── Altitude ─────────────────────────────────────────────────────────
        if self.phase != "CRUISE" or self._vs_managed_override:
            self.altitude += self.vs * (dt / 60.0)
            self.altitude  = max(self.altitude, 500.0)

        # Stop descending at sel_alt
        if self.vs < 0 and self.altitude <= self.sel_alt:
            self.altitude = self.sel_alt
            self.vs       = 0.0
            self.alt_mode = "ALT"
            self._vs_managed_override = False
            self.fcu_vs_managed = True

        # ── Mach / Speed ─────────────────────────────────────────────────────
        if not self.fcu_spd_managed:
            # Slew toward FCU-selected Mach
            target = self.fcu_sel_mach
            error  = target - self.mach
            self.mach += max(-0.002, min(0.002, error))
        else:
            # Managed: auto-schedule by phase
            if self.phase == "CRUISE":
                self.mach = 0.788
            elif self.phase == "DESCENT":
                if self.altitude > 25000:
                    self.mach = 0.788
                else:
                    self.mach = max(0.78 * (self.altitude / 25000), 0.45)

        # ── TAS / GS ─────────────────────────────────────────────────────────
        temp_k = 288.15 - 0.0065 * min(self.altitude * 0.3048, 11000)
        sos     = math.sqrt(1.4 * 287.05 * temp_k) * 1.94384
        self.tas = self.mach * sos

        wind_comp = self.wind_speed * math.cos(to_rad(self.wind_dir - self.track))
        self.gs   = max(self.tas + wind_comp, 50.0)

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
            "mach":     round(self.mach, 3),
            "tas":      round(self.tas),
            "gs":       round(self.gs),
            "pitch":    round(self.pitch, 1),
            "roll":     round(self.roll, 1),
            "heading":  round(self.heading, 1),
            "track":    round(self.track, 1),
            "vs":       round(self.vs),
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
            "fcu_alt_step":     self.fcu_alt_step,
            "metric_alt":       self.metric_alt,
            "exped_active":     self.exped_active,
            "ap1_engaged":      self.ap1_engaged,
            "ap2_engaged":      self.ap2_engaged,
            "athr_engaged":     self.athr_engaged,
            "loc_armed":        self.loc_armed,
            "appr_armed":       self.appr_armed,
        }
