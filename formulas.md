# Descent Management — Teknik Formüller

Bu dokümanda projede kullanılan tüm matematiksel ve fiziksel formüller açıklanmaktadır.

---21313

## 1. Haversine Formülü — İki Nokta Arası Mesafe

İki enlem/boylam noktası arasındaki mesafeyi **deniz mili (NM)** cinsinden hesaplar.
Dünya'nın küreselliğini dikkate alır.

### Formül

```
a = sin²(Δlat/2) + cos(lat₁) · cos(lat₂) · sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
d = R · c
```

| Sembol | Değer / Birim | Açıklama |
|--------|--------------|----------|
| Δlat   | radyan       | İki nokta arası enlem farkı |
| Δlon   | radyan       | İki nokta arası boylam farkı |
| R      | 3440.065 NM  | Dünya'nın ortalama yarıçapı |
| d      | NM           | Sonuç mesafe |

### Kod (simulation.py)

```python
def haversine(lat1, lon1, lat2, lon2):
    R = 3440.065
    dlat = to_rad(lat2 - lat1)
    dlon = to_rad(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(to_rad(lat1)) * cos(to_rad(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
```

### Neden Haversine?

Basit Pisagor (`√(Δx² + Δy²)`) düz yüzey varsayar.
Büyük mesafelerde (> 10 NM) ciddi hata verir.
Haversine küresel yüzeyi modelleyerek bu hatayı ortadan kaldırır.

---

## 2. Bearing Formülü — Yön Açısı

Bir noktadan diğerine **manyetik kuzeyden saat yönünde** olan açıyı hesaplar (0° – 360°).

### Formül

```
x       = sin(Δlon) · cos(lat₂)
y       = cos(lat₁) · sin(lat₂) − sin(lat₁) · cos(lat₂) · cos(Δlon)
bearing = atan2(x, y)
bearing = (bearing + 360) % 360      ← normalize (negatif değerleri engeller)
```

### Kod (simulation.py)

```python
def bearing_to(lat1, lon1, lat2, lon2):
    dlon = to_rad(lon2 - lon1)
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return (degrees(atan2(x, y)) + 360) % 360
```

### Neden atan2?

Tek argümanlı `atan` yalnızca −90° ile +90° döndürür; 4 kadranı kaplayamaz.
`atan2(x, y)` işaret bilgisini koruyarak −180° ile +180° döndürür,
ardından `+360` ile normalize edilerek 0°–360° aralığına çekilir.

---

## 3. Dead Reckoning — Konum Güncelleme

Uçak belirli bir **yön (bearing)** ve **mesafe** kadar hareket ettiğinde
yeni coğrafi koordinatları hesaplar.

### Formül

```
lat₂ = asin( sin(lat₁) · cos(d/R)
           + cos(lat₁) · sin(d/R) · cos(bearing) )

lon₂ = lon₁ + atan2( sin(bearing) · sin(d/R) · cos(lat₁),
                      cos(d/R) − sin(lat₁) · sin(lat₂) )
```

### Simülasyondaki Kullanımı

Her 0.1 saniyede bir çalışır:

```python
dist_nm = (GS / 3600.0) * dt        # dt = 0.1 s  →  ~0.013 NM
lat, lon = move_point(lat, lon, track, dist_nm)
```

| Değişken | Açıklama |
|----------|----------|
| GS       | Ground Speed (yer hızı, knot) |
| dt       | Zaman adımı (saniye) |
| dist_nm  | Bu adımda alınan yol (NM) |

---

## 4. ISA Atmosfer Modeli — Mach'tan TAS Hesabı

**Uluslararası Standart Atmosfer (ISA)** modeli ile troposferde
sıcaklık ve ses hızı hesaplanır, ardından TAS (Gerçek Hava Hızı) elde edilir.

### Formüller

```
T(h) = 288.15 − 0.0065 · h_metre          (troposfer: 0 – 11.000 m)

SoS  = √(γ · R · T)                       (ses hızı, m/s)
SoS_kt = SoS × 1.94384                    (m/s → knot dönüşümü)

TAS = Mach × SoS_kt
```

| Sembol  | Değer        | Açıklama |
|---------|-------------|----------|
| γ       | 1.4          | Havanın ısı kapasitesi oranı (Cp/Cv) |
| R       | 287.05 J/(kg·K) | Kuru hava özgül gaz sabiti |
| 1.94384 | —            | m/s → knot katsayısı |
| h       | metre        | Basınç irtifası |

### Sayısal Örnek — FL270

```
h = 27.000 ft × 0.3048 = 8.230 m

T   = 288.15 − 0.0065 × 8230  = 234.7 K
SoS = √(1.4 × 287.05 × 234.7) × 1.94384  ≈  589 kt
TAS = 0.788 × 589  ≈  464 kt   ✓  (görüntüdeki değerle örtüşüyor)
```

### Kod (simulation.py)

```python
temp_k = 288.15 - 0.0065 * min(altitude * 0.3048, 11000)
sos    = sqrt(1.4 * 287.05 * temp_k) * 1.94384   # knot
tas    = mach * sos
```

---

## 5. Yer Hızı (GS) ve Rüzgar Düzeltmesi

Rüzgarın uçuş izi üzerindeki boylamasına bileşeni hesaplanarak GS elde edilir.

### Formüller

```
wind_component = V_wind · cos(wind_dir − track)
GS = TAS + wind_component
```

| Durum | wind_dir − track | cos | Etki |
|-------|-----------------|-----|------|
| Tam baş rüzgarı  | 180° | −1 | GS < TAS |
| Tam kıç rüzgarı  |   0° | +1 | GS > TAS |
| Tam çapraz rüzgar | 90° |  0 | GS ≈ TAS |

### Sürüklenme Açısı (Drift)

Rüzgarın enine bileşeninin yol sapmasına etkisi:

```
wind_cross = V_wind · sin(wind_dir − track)
drift      = atan2(wind_cross, TAS)           (derece cinsinden)
```

### Kod (simulation.py)

```python
wind_comp = wind_speed * cos(to_rad(wind_dir - track))
gs        = max(tas + wind_comp, 50.0)

wind_cross = wind_speed * sin(to_rad(wind_dir - track))
drift      = degrees(atan2(wind_cross, max(tas, 1)))
```

---

## 6. ND Koordinat Dönüşümü — Coğrafi → Ekran

**Track-up** modunda (uçak ilerleyiş yönü yukarıda) herhangi bir
waypoint'in canvas ekran koordinatını hesaplar.

### Formül

```
rel_bearing = bearing_to_waypoint − track          (derece)
rel_rad     = rel_bearing × π / 180

screen_x = AC_x + dist_NM × SCALE × sin(rel_rad)
screen_y = AC_y − dist_NM × SCALE × cos(rel_rad)
```

| Sabit  | Değer       | Açıklama |
|--------|-------------|----------|
| AC_x   | 290 px      | Uçak sembolü yatay merkez |
| AC_y   | 420 px      | Uçak sembolü düşey merkez |
| SCALE  | 2.0 px/NM   | 80 NM = 160 px (iç halka) |

### Neden sin/cos Bu Sırayla?

Canvas'ta Y ekseni **aşağı** artar (standart matematiğin tersi):

```
sin(0°) = 0   →  rel_bearing = 0  →  waypoint tam önde  →  Δx = 0       ✓
cos(0°) = 1   →  screen_y eksilir  →  yukarıya gider    ✓
```

### Kod (NavigationDisplay.jsx)

```javascript
function toScreen(bearing, dist, track) {
  const rel = toRad(bearing - track)
  return {
    x: ACX + dist * SCALE * Math.sin(rel),
    y: ACY - dist * SCALE * Math.cos(rel),
  }
}
```

---

## 7. Compass Arc — Derece → Yay Noktası

Pusula yayındaki her dereceyi, uçak merkezli büyük yarıçaplı yay
üzerindeki bir canvas noktasına dönüştürür.

### Formül

```
canvas_angle = (bearing − track) × π/180 − π/2

arc_x = AC_x + R · cos(canvas_angle)
arc_y = AC_y + R · sin(canvas_angle)
```

### −π/2 Kaydırmasının Nedeni

Canvas'ta `angle = 0` sağa (doğu) işaret eder.
Biz `bearing = track` (ileri yön) yukarıya işaret etsin istiyoruz:

```
İstenen: 0° (ileri) → canvas yukarı (−π/2 radyan)
Düzeltme: canvas_angle = rel_rad − π/2
```

### Kod (NavigationDisplay.jsx)

```javascript
const angle = toRad(bear - track) - Math.PI / 2
const ox = ACX + CRAD * Math.cos(angle)
const oy = ACY + CRAD * Math.sin(angle)
```

---

## 8. Yapay Ufuk (AI) — Pitch Hareketi

Pitch açısına göre ufuk çizgisinin merkeze göre kayması hesaplanır.

### Formül

```
horizon_offset_y = pitch_degrees × PITCH_SCALE     (px)
```

| Değer         | Açıklama |
|---------------|----------|
| PITCH_SCALE   | 28 px/°  |
| +pitch (burun yukarı) | ufuk **aşağı** kayar → daha fazla gökyüzü görünür |
| −pitch (burun aşağı) | ufuk **yukarı** kayar → daha fazla yer görünür |

### Uygulama (PrimaryFlightDisplay.jsx)

```javascript
ctx.translate(AI_CX, AI_CY)
ctx.rotate(toRad(roll))                    // önce roll
ctx.translate(0, pitch * PITCH_PX)        // sonra pitch kayması
// → gök ve yer doldurma
```

---

## 9. Yapay Ufuk (AI) — Roll Rotasyonu

Roll açısına göre gökyüzü/yer katmanının canvas üzerinde döndürülmesi.

### Formül

```
ctx.rotate(roll_radians)     →  saat yönünde döndürür
```

### Kanıt — Sağ Bankı (+30°) İçin

Canvas `rotate(+θ)` dönüşümü:

```
x' = x · cos(θ) − y · sin(θ)
y' = x · sin(θ) + y · cos(θ)
```

Sol taraftaki ufuk noktası `(−100, 0)` için θ = 30°:

```
y' = −100 · sin(30°) = −50     →  ekranda yukarı   ✓
```

Sağ bankta sol taraf yukarı, sağ taraf aşağı gider — gerçek görünümle örtüşür.

---

## 10. FCU Kadran (Knob) Açı Formülü

FCU üzerindeki fiziksel kadranların görsel dönme açısı,
değerin min–max aralığındaki konumuna göre hesaplanır.

### Formül

```
knob_angle = −135° + (value − min) / (max − min) × 270°
```

| Değer        | Kadran Açısı | Görünüm |
|-------------|-------------|---------|
| min          | −135°       | Sol alt (7:30 pozisyonu) |
| orta         |    0°       | Tam yukarı (12:00) |
| max          | +135°       | Sağ alt (4:30 pozisyonu) |

Toplam hareket aralığı **270°** — gerçek Airbus FCU kadranıyla aynı.

### Kod (FCU.jsx)

```javascript
function knobAngle(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return -135 + t * 270
}
```

---

## 11. Knob Sürükleme (Drag) — Fare Hareketi → Değer

Kullanıcının fareyi dikey sürüklemesi, değer değişimine dönüştürülür.

### Formül

```
steps     = round( (startY − currentY) / pixelsPerStep )
new_value = clamp( startValue + steps × step,  min,  max )
```

| Parametre    | Açıklama |
|-------------|----------|
| startY       | Fare basıldığında Y koordinatı |
| currentY     | Anlık fare Y koordinatı |
| pixelsPerStep | Kaç piksel = 1 adım (3–4 px) |
| step         | Değer artış birimi (Mach: 0.001, HDG: 1°, ALT: 100/1000 ft) |

Yukarı sürükleme → Y azalır → `startY − currentY > 0` → değer artar ✓

---

## 12. ETA Hesabı — Tahmini Varış Zamanı

Aktif waypoint'e kalan tahmini uçuş süresi:

### Formül

```
ETA_saniye  = mesafe_NM / GS_knot × 3600
ETA_mutlak  = (şu_an_saniye + ETA_saniye) mod 86400
```

`mod 86400`: Gece yarısı geçişini doğru yönetir
(86400 = bir gündeki saniye sayısı).

### Kod (simulation.py)

```python
eta_s   = int(aw_dist / self.gs * 3600)
eta_abs = (self.base_clock - int(self.sim_time) + eta_s) % 86400
aw_eta  = f"{eta_abs // 3600:02d}:{(eta_abs % 3600) // 60:02d}"
```

---

## Özet Tablosu

| # | Formül | Matematiksel Alan | Kullanıldığı Yer |
|---|--------|-------------------|-----------------|
| 1 | Haversine | Küresel geometri | Waypoint/VOR mesafesi |
| 2 | Bearing (atan2) | Trigonometri | ND yön göstergesi |
| 3 | Dead Reckoning | Küresel trigonometri | Her 0.1s'de konum güncelleme |
| 4 | ISA Atmosfer | Termodinamik / akışkanlar | Mach → TAS dönüşümü |
| 5 | Rüzgar bileşeni | Vektör analizi | GS ve drift hesabı |
| 6 | Track-up projeksiyon | Koordinat dönüşümü | Waypoint ekran konumu |
| 7 | Canvas açı kaydırması | Trigonometri | Pusula yayı çizimi |
| 8 | Pitch offset | Lineer ölçekleme | AI ufuk çizgisi kayması |
| 9 | Roll rotasyonu | 2D döndürme matrisi | AI gökyüzü/yer dönüşü |
| 10 | Knob açı interpolasyonu | Lineer interpolasyon | FCU kadran görsel açısı |
| 11 | Drag → değer dönüşümü | Lineer ölçekleme | FCU fare etkileşimi |
| 12 | ETA | Zaman aritmetiği | Aktif waypoint varış tahmini |
