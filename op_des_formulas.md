# OP DES (Open Descent) — Kullanılan Formüller

## 1. Sabitler

| Sabit | Değer | Açıklama |
|-------|-------|----------|
| `A320_MASS_KG` | 65,000 kg | Sabit uçak kütlesi |
| `A320_WING_S` | 122.6 m² | Kanat referans alanı |
| `A320_AR` | 9.4 | Kanat aspect ratio |
| `A320_OSWALD` | 0.85 | Oswald verimlilik faktörü |
| `A320_CD0` | 0.022 | Sıfır-kaldırma sürükleme katsayısı |
| `A320_G` | 9.80665 m/s² | Yerçekimi ivmesi |
| `A320_T_MAX_SL_N` | 120,000 N | Motor başına max thrust (deniz seviyesi) |
| `A320_N_ENGINES` | 2 | Motor sayısı |
| `A320_N1_IDLE` | 24% | Flight idle N1 |
| `A320_N1_MIN` | 18% | Minimum N1 |
| `A320_T_IDLE_SL` | 12,000 N | Toplam idle thrust (deniz seviyesi, 2 motor) |
| `A320_IDLE_EXP` | 1.3 | Idle thrust yoğunluk üssü |
| `A320_CD0_ALT_REF` | 27.0 kft | CD0 artışı başlangıç irtifası |
| `A320_CD0_ALT_K` | 0.0098 | CD0 irtifa düzeltme katsayısı |
| `A320_CD0_ALT_POW` | 2.0 | CD0 irtifa düzeltme üssü |

---

## 2. ISA Atmosfer Modeli

```
h = altitude_ft × 0.3048          (ft → m)

Troposfer (h ≤ 11,000 m):
  T   = 288.15 - 0.0065 × h       [K]
  P   = 101325 × (T / 288.15)^5.2558   [Pa]

Stratosfer (h > 11,000 m):
  T   = 216.65 K  (sabit)
  P_t = 101325 × (T_t / 288.15)^5.2558
  P   = P_t × exp(-9.80665 × (h - 11000) / (287.05 × 216.65))

Her iki katmanda:
  ρ     = P / (287.05 × T)          [kg/m³]
  a_kt  = √(1.4 × 287.05 × T) × 1.94384   [kt]  (ses hızı)
```

---

## 3. Hız Dönüşümleri

```
Mach modundayken (crossover üstü):
  TAS = Mach × a_kt
  IAS = TAS × √(ρ / ρ₀)

IAS modundayken (crossover altı):
  TAS = IAS × √(ρ₀ / ρ)
  Mach = TAS / a_kt

ρ₀ = 1.225 kg/m³ (deniz seviyesi yoğunluğu)
```

---

## 4. Drag (Sürükleme) Hesabı — `_compute_drag()`

```
V_ms = TAS / 1.94384                    (kt → m/s)

q = 0.5 × ρ × V_ms²                     (dinamik basınç) [Pa]

CL = (m × g) / (q × S)                   (kaldırma katsayısı)
   = (65000 × 9.80665) / (q × 122.6)

# İrtifaya bağlı CD0 düzeltmesi (Reynolds / sıkıştırılabilirlik)
alt_kft = altitude / 1000

Eğer alt_kft > 27.0:
  cd0_alt = 0.0098 × (alt_kft - 27.0)² / (35.0 - 27.0)²
Değilse:
  cd0_alt = 0

cd0_eff = 0.022 + cd0_alt

# Toplam drag katsayısı (parasite + induced)
CD = cd0_eff + CL² / (π × 9.4 × 0.85)

# Drag kuvveti
D = q × S × CD                          [N]
  = q × 122.6 × CD
```

---

## 5. Thrust (İtme) Hesabı — `_thrust_from_n1()`

OP DES modunda N1 hedefi = **N1_IDLE (24%)**, yani bu fonksiyon idle thrust verir.

```
σ = ρ / ρ₀                              (yoğunluk oranı)

Eğer N1 ≤ N1_IDLE (24%):
  # Kalibre edilmiş idle thrust (ayrı lapse rate)
  T_total = T_IDLE_SL × σ^1.3
          = 12000 × σ^1.3               [N]

Eğer N1 > N1_IDLE:
  T_max = T_MAX_SL × N_engines × σ^0.6
        = 120000 × 2 × σ^0.6

  f = (N1 - N1_IDLE) / (100 - N1_IDLE)
    = (N1 - 24) / 76

  frac = 0.04 + 0.96 × f²

  T_total = T_max × frac                [N]
```

---

## 6. Vertical Speed Hesabı — `_compute_vs()`

Enerji dengesi (total energy model):

```
sin(γ) = (T - D) / W

  T = thrust [N]  (OP DES'te idle thrust)
  D = drag [N]
  W = m × g = 65000 × 9.80665 = 637,432 N

sin(γ) = clamp((T - D) / W, -0.35, 0.35)

VS = TAS × 101.269 × sin(γ)             [FPM]

  TAS: true airspeed [kt]
  101.269: dönüşüm faktörü (kt → ft/min, sin(γ) için)
    = 6076.12 ft/nm ÷ 60 min
```

**OP DES'te T < D olduğu için sin(γ) negatif → VS negatif (iniş)**

Tipik değerler (FL350, M0.77):
- Idle Thrust ≈ ~3,500 N
- Drag ≈ ~35,000 N
- VS ≈ -2,500 ~ -3,500 FPM

---

## 7. N1 Spool Dinamiği

```
N1 hedefi (OP DES) = N1_IDLE = 24%

n1_err = n1_target - n1_current
n1_change = clamp(n1_err, -4.0, +4.0) × dt

n1_new = clamp(n1_current + n1_change, N1_MIN, 100)
       = clamp(n1_current + n1_change, 18, 100)

Spool rate: max ±4% N1/saniye
```

---

## 8. İrtifa Entegrasyonu

```
altitude_new = altitude + VS × (dt / 60)     [ft]

  VS: [ft/min]
  dt: [saniye]
  dt/60: saniyeyi dakikaya çevir
```

---

## 9. ALT* Capture (İrtifa Yakalama)

OP DES sırasında hedef irtifaya yaklaşınca:

```
remaining = |sel_alt - altitude|          [ft]

capture_zone = max(|VS| × 0.05, 50)      [ft]
  (VS'nin %5'i kadar uzaklıkta başlar, min 50 ft)

Eğer remaining ≤ capture_zone:
  Mod → ALT*
  ratio = remaining / capture_zone
  VS_new = sign(VS_capture) × max(|VS_capture| × ratio, 50)

Eğer altitude hedefi geçilirse veya ulaşılırsa:
  altitude = sel_alt
  VS = 0
  Mod → ALT
```

---

## 10. Crossover Altitude

```
TAS_mach = Mach × a_kt(altitude)
TAS_ias  = IAS × √(ρ₀ / ρ(altitude))

Crossover: TAS_mach = TAS_ias olan irtifa
  Binary search ile bulunur [0, 45000 ft]

M0.78 / 300 kt → ≈ FL271
M0.77 / 260 kt → değişken (FCU ayarına bağlı)

Otomatik geçiş: 200 ft histerezis
  altitude > crossover + 200 → Mach modu
  altitude < crossover - 200 → IAS modu
```

---

## 11. Akış Özeti (OP DES Tick Sırası)

```
1. N1 hedefi = N1_IDLE (24%)
2. N1 spool: mevcut N1 → N1_IDLE (max 4%/s)
3. Thrust = _thrust_from_n1()  → idle thrust
4. VS = _compute_vs(thrust)    → negatif (iniş)
5. altitude += VS × dt/60
6. ALT* capture kontrolü
7. Crossover kontrolü (Mach ↔ IAS otomatik geçiş)
8. Hız güncelleme (TAS, IAS, Mach)
9. Pozisyon güncelleme
```
