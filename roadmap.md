# Proje Yol Planı — A320 Uçuş Simülasyonu

Hedef: Gerçek A320 uçuş fiziğini ve otomasyon mantığını adım adım,
katman katman simülasyona eklemek.

Her aşama bir öncekinin üzerine inşa edilir.

---

## GENEL DURUM

```
Aşama 1   Dikey mod sağlamlaştırma    🔄  %80 tamamlandı
Aşama 2   ISA atmosfer               ✅  TAMAM
Aşama 3   Gerçekçi hız modeli        🔄  %70 tamamlandı
Aşama 4   Thrust modeli              🔄  %80 tamamlandı
Aşama 5   Aerodinamik                ⏳  Sabitler girildi
Aşama 6   Ağırlık & yakıt            ✅  Sabitlendi (değişmeyecek)
Aşama 7   FMGC managed modes         ⏳  Uzun vade
Aşama 8   Görsel geliştirmeler       🔄  FMA eklendi
```

---

## SABİT PARAMETRELER (Değişmeyecek)

Kullanıcı kararıyla aşağıdaki değerler simülasyon boyunca sabit kalır:

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Atmosfer | Standart ISA | Sapma yok, her zaman standart |
| Kütle | 65.000 kg | Sabit operasyonel ağırlık |
| Yakıt | — | Yanmaz, kütle değişmez |
| Aerodinamik | A320 sabitleri | S=122.6 m², AR=9.4, e=0.85, CD0=0.024 |
| Crossover alt. | ~FL271 | M0.78 / 300 kt IAS — ISA'dan hesaplanır |

---

## BAŞLANGIÇ DURUMU (Commit `cee43bb`)

**Vardı:**
- FCU — ALT, V/S, HDG, SPEED seçimi
- ALT PULL → sabit FPM ile tırmanma/alçalma
- V/S PULL → seçilen FPM ile tırmanma/alçalma
- Level Off butonu
- PFD — yapay ufuk, irtifa bandı, basit mod satırı
- ND — harita, waypoint, VOR

**Yoktu:**
- Gerçek atmosfer, thrust, ağırlık, aerodinamik

---

## AŞAMA 1 — Dikey Modların Sağlamlaştırılması  🔄

### ✅ 1.1 Altitude Capture — yumuşak yakalama
Hedef irtifaya `|VS| × 0.05` ft öncesinden `ALT*` zonu başlar.
VS doğrusal olarak sıfıra düşer, min 50 FPM.

```
capture_ft = max(|VS| × 0.05,  50)
VS_yeni    = VS_giriş × (kalan_ft / capture_ft)
```

`simulation.py → update()` — `_alt_capture_vs` ile takip edilir.

---

### ⏳ 1.2 V/S Sınır Kontrolü — amber uyarı
Aşırı VS seçildiğinde PFD'de amber renk (hız kaybı uyarısı).
Thrust modeli geldikten sonra anlamlı olacak → Aşama 4'e ertelendi.

```
VS_max_climb   = +2500 FPM
VS_max_descent = −3000 FPM
```

---

### ✅ 1.3 FMA — Flight Mode Annunciator
PFD üst kısmında 3 kolonlu FMA kutusu:

```
┌──────────────┬──────────────┬──────────────┐
│  ┌───────┐   │  ┌────────┐  │  ┌───────┐   │  ← yeşil aktif
│  │ SPEED │   │  │OP DES  │  │  │  HDG  │   │
│  └───────┘   │  └────────┘  │  └───────┘   │
│              │    -1800     │              │  ← V/S modunda FPM
├──────────────┼──────────────┼──────────────┤
│              │     ALT      │              │  ← mavi armed
└──────────────┴──────────────┴──────────────┘
```

Dikey mod stringleri: `OP CLB`, `OP DES`, `V/S`, `ALT*`, `ALT`, `ALTCRZ`

---

## AŞAMA 2 — ISA Atmosfer Modeli  ✅ TAMAM

### ✅ 2.1 Sıcaklık profili

```
Troposfer  (h ≤ 11.000 m):  T = 288.15 − 0.0065 × h_m
Stratosfer (h > 11.000 m):  T = 216.65  (sabit)
```

### ✅ 2.2 Ses hızı & Mach → TAS

```
SoS = √(1.4 × 287.05 × T) × 1.94384   (knot)
TAS = Mach × SoS
```

FL270, M0.788:  SoS = 596.9 kt  →  TAS = 470.4 kt

### ✅ 2.3 Basınç & Yoğunluk

```
Troposfer:   P = 101325 × (T / 288.15)^5.2558
Stratosfer:  P = P_tropopause × e^(−g×Δh / (R×T))
ρ = P / (287.05 × T)
```

FL270:  T = 234.7 K,  P = 34.093 Pa,  ρ = 0.5112 kg/m³

`simulation.py` — `isa_atmosphere(altitude_ft)` fonksiyonu.

---

## AŞAMA 3 — Gerçekçi Hız Modeli  🔄

### ✅ 3.1 IAS ↔ TAS ↔ Mach dönüşümü

```
IAS  = TAS × √(ρ / ρ₀)         ρ₀ = 1.225 kg/m³
Mach = TAS / SoS(h)
```

FL270, M0.788:  TAS = 470.4 kt  →  IAS = 303.9 kt

PFD sol bandı artık IAS gösteriyor.
Altında `.788` Mach readout kutusu var.

### ✅ 3.2 Crossover Altitude

```python
# Binary search: TAS_mach == TAS_ias olduğu irtifa
A320_CROSSOVER_FT = _crossover_ft(0.78, 300)  # → 27.116 ft ≈ FL271
```

ISA standart, M0.78 / 300 kt IAS için FL271.
State'e `crossover_ft` olarak eklendi.

### ⏳ 3.3 Hız dinamiği — ivmelenme / yavaşlama

```
a = (Thrust − Drag) / mass
V_new = V + a × dt
```

Thrust modeli olmadan anlamsız → Aşama 4'e bağımlı.
Şu an Mach sabit tutularak `TAS = M × SoS(h)` hesaplanıyor.

---

## AŞAMA 4 — Thrust Modeli  ⏳  ← SIRADAKİ

### 4.1 Thrust seviyeleri (CFM56-5B)

| Lever | Thrust (% max) | ~kN |
|-------|----------------|-----|
| IDLE  | ~4%  | ~5 kN |
| CLB   | ~70% | ~90 kN |
| MCT   | ~90% | ~116 kN |
| TOGA  | 100% | ~130 kN |

### 4.2 A/THR SPEED modu — PID kontrolör

```
thrust_cmd = thrust_base + Kp × (V_target − V_actual)
                         + Ki × ∫(V_target − V_actual) dt
```

### 4.3 OP DES için IDLE thrust

```
OP DES:  thrust = IDLE  (~5 kN)
VS otomatik değişir: VS = f(drag, weight, altitude)
```

Eklenecek: `simulation.py` → `Thrust` sınıfı

---

## AŞAMA 5 — Aerodinamik Model  ⏳

Sabitler zaten `simulation.py`'da tanımlı:

```python
A320_MASS_KG = 65_000    # kg  — sabit
A320_WING_S  = 122.6     # m²
A320_AR      = 9.4
A320_OSWALD  = 0.85
A320_CD0     = 0.024
```

### 5.1 Lift & Drag

```
L = ½ × ρ × V² × S × CL
D = ½ × ρ × V² × S × CD

CD  = CD0 + CL² / (π × AR × e)
CL  = 2 × L / (ρ × V² × S)    →  denge için: L = W = m × g
```

Denge CL'i (cruise):

```
CL_cruise = 2 × m × g / (ρ × V_TAS² × S)

FL270, 65.000 kg, TAS=470 kt (≈242 m/s):
CL ≈ 2 × 65000 × 9.807 / (0.511 × 242² × 122.6)  ≈  0.35
```

### 5.2 L/D max ve glide ratio

```
CL_opt  = √(π × AR × e × CD0)  ≈  √(π × 9.4 × 0.85 × 0.024)  ≈  0.776
CD_opt  = 2 × CD0               ≈  0.048
L/D_max = CL_opt / CD_opt       ≈  16.2

Glide ratio ≈ 16 NM yatay / 1 NM dikey
```

### 5.3 OP DES gerçek VS hesabı

```
Thrust ≈ IDLE (çok küçük, ihmal edilebilir)
D = ½ × ρ × V² × S × CD
FPA = −asin(D / W)                  (küçük açı: FPA ≈ −D/W)
VS  = TAS × sin(FPA) × 101.269      (FPM)
```

---

## AŞAMA 6 — Ağırlık & Yakıt  ✅ SABITLENDI

Kullanıcı kararıyla sabit değerler:

| Parametre | Değer |
|-----------|-------|
| Operasyonel kütle | 65.000 kg (sabit) |
| Yakıt tüketimi | 0 (yanmaz) |
| Kütle değişimi | Yok |

MTOW referans: 78.000 kg / OEW: 42.600 kg

---

## AŞAMA 7 — FMGC Dikey Profil (Managed Modes)  ⏳

Aşama 4+5 tamamlandıktan sonra ele alınacak.

### 7.1 Managed Descent (DES) profili

```
T/D'den itibaren sabit geometrik yol:
hedef_FPA = atan(Δh / yatay_mesafe)
VS_target = GS × tan(hedef_FPA) × 101.269
```

### 7.2 Enerji yönetimi

```
E_total = ½ × m × V² + m × g × h
```

### 7.3 Kısıtlar (constraints)

- Speed limit: 250 kt altında FL100
- Waypoint geçiş hızları ve irtifaları

---

## AŞAMA 8 — Görsel & Arayüz  🔄

- [x] FMA paneli (3 kolon, aktif/armed satırları)
- [x] PFD sol bant: IAS
- [x] PFD Mach readout (tape altı)
- [ ] FPA (Flight Path Vector) sembolü
- [ ] Speed trend arrow (hız eğilim oku)
- [ ] ECAM motor parametreleri (N1, FF)
- [ ] ND — TOD sembolü
- [ ] ND — dikey profil penceresi (VERT DEV)

---

## ÖNCELİK SIRASI (Güncel)

```
✅ Aşama 2   ISA atmosfer             TAMAM
✅ Aşama 6   Ağırlık/yakıt sabitlendi TAMAM
🔄 Aşama 1   Dikey mod (1.2 bekliyor) %80
🔄 Aşama 3   Hız modeli (3.3 bekliyor) %70
🔄 Aşama 4   Thrust modeli            %80 — N1 + fizik VS eklendi
⏳ Aşama 5   Aerodinamik              (sabitler hazır)
⏳ Aşama 7   FMGC managed            (uzun vade)
```

---

## Bağımlılık Grafiği (Güncel)

```
✅ ISA (2) + Sabitler (6)
        │
        ├──► ✅ IAS/Mach dönüşüm (3.1, 3.2)
        │
        └──► ⏳ Thrust (4)
                    │
                    ├──► ⏳ Hız dinamiği (3.3)
                    │
                    └──► ⏳ Aerodinamik (5)
                                │
                                └──► ⏳ FMGC Managed (7)

🔄 Dikey Modlar (1)  ──► 1.2 Aşama 4'e bağlı
🔄 Görsel (8)        ──► bağımsız, herhangi aşamada
```
