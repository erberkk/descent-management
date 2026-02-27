# Airbus A320 — Dikey Modlar: Open Descent & Vertical Speed

Bu dokümanda A320'nin iki temel manuel iniş dikey modunun teknik detayları,
formülleri ve simülasyondaki uygulamaları anlatılmaktadır.

---

## 1. Open Descent (OP DES) Modu

### Nedir?

Open Descent, **thrust idle** (itki boşta) konumunda uçağın hedef irtifaya
**gravity-assisted** (yerçekimi destekli) ineceği moddur.
FMGC (Flight Management Guidance Computer) dikey profili **takip etmez**;
bunun yerine pilotun FCU'dan seçtiği **hedef irtifaya** doğru en hızlı şekilde
iner ve hız kısıtlarını ihlal etmez.

### Temel Özellikler

| Özellik | Değer / Davranış |
|---------|-----------------|
| Thrust | IDLE (minimum itki) |
| Hız kontrolü | A/THR SPEED modu — seçilen hızı (Mach/IAS) korur |
| Dikey kontrol | Elevator ile hız korunur, VS otomatik değişir |
| FCU hedefi | ALT penceresi — PULL ile aktive edilir |
| PFD annunciator | `OP DES` (mavi = armed, yeşil = aktif) |
| Çıkış koşulu | Hedef irtifaya 20 ft yaklaşınca `ALT*` → `ALT` |

### Fizik Prensibi

Sabit Mach/IAS'da idle thrust ile denge:

```
Lift    = Weight · cos(γ)
Drag    = Thrust + Weight · sin(γ)   (alçalışta sin(γ) < 0)

γ_idle ≈ −(D − T_idle) / W           (küçük açı yaklaşımı)
```

| Sembol | Açıklama |
|--------|----------|
| γ | Uçuş yolu açısı (negatif = alçalma) |
| D | Sürükleme kuvveti |
| T_idle | Boştaki itki (~%3–5 tam itkinin) |
| W | Uçak ağırlığı |

Tipik FL330 → FL100 geçişinde:

```
γ ≈ −2.5° ile −3.5°
VS ≈ −1500 ile −2500 FPM   (hıza ve ağırlığa bağlı)
```

### Descent Point (T/D) Hesabı — FMGC Geometrisi

FMGC, Top of Descent noktasını şu formülle belirler:

```
Δh = irtifa_farkı_ft

gerekli_yatay_mesafe = Δh / tan(|γ|)    (ft cinsinden)
gerekli_yatay_mesafe_NM = gerekli_yatay_mesafe / 6076.12

Alternatif kural:
  "3 NM per 1000 ft"  →  Δh_ft / 1000 × 3  NM
```

Örnek — FL350 → 3000 ft:

```
Δh = 35000 − 3000 = 32000 ft
Mesafe = 32000 / 1000 × 3 = 96 NM
```

### Simülasyondaki Uygulama

Bu projede OP DES tam olarak modellenmemiştir; ancak ALT PULL davranışı
benzer prensibi uygular:

```python
if patch.get("alt_pull"):
    self.sel_alt = self.fcu_sel_alt
    rate = abs(self.fcu_sel_vs) if self.fcu_sel_vs != 0 else 1000.0
    if self.altitude > self.sel_alt + 50:
        self.vs = -rate          # alçalma başlar
        self.alt_mode = "DES"
```

---

## 2. Vertical Speed (V/S) Modu

### Nedir?

V/S modu, pilotun FCU üzerindeki V/S kadranı ile belirlediği **sabit dikey hız**
(feet per minute) değerinde tırmanma veya alçalma yapmasını sağlar.
Hız kısıtlaması yapılmaz — hız ikincil önceliktedir.

### Temel Özellikler

| Özellik | Değer / Davranış |
|---------|-----------------|
| Giriş | FCU V/S kadranı PULL |
| Dikey kontrol | Sabit VS (elevator ile) |
| Hız | Korunmaz — değişebilir |
| Thrust | A/THR hız modunu korumaya çalışır; yetersiz kalabilir |
| FCU gösterimi | `+XXXX` veya `−XXXX` FPM |
| PFD annunciator | `V/S` (yeşil) |
| Çıkış koşulu | Hedef irtifaya ulaşınca `ALT*` → `ALT` |

### Dikey Hız Formülü

```
Δh = VS × Δt / 60

yeni_irtifa = mevcut_irtifa + VS × (dt / 60)
```

| Sembol | Birim | Açıklama |
|--------|-------|----------|
| VS | ft/min (FPM) | Dikey hız — pozitif = tırmanma |
| Δt / dt | saniye | Zaman adımı |
| Δh | feet | Bu adımda irtifa değişimi |

Örnek — VS = −1800 FPM, dt = 0.1 s:

```
Δh = −1800 × 0.1 / 60 = −3 ft   (her 0.1 saniyede)
```

### V/S ve FPA İlişkisi

```
FPA (°) = atan( VS / GS_ft_per_min )

GS_ft_per_min = GS_knot × 101.269

VS = GS_ft_per_min × tan(FPA)
```

| GS (kt) | VS (FPM) | FPA |
|---------|---------|-----|
| 450 | −1500 | −1.88° |
| 450 | −1800 | −2.27° |
| 450 | −2500 | −3.14° |
| 300 | −1500 | −2.83° |

### Tipik V/S Değerleri — A320

| Durum | VS (FPM) |
|-------|---------|
| Normal tırmanma (CLB) | +1500 ile +2500 |
| Normal alçalma (DES) | −1500 ile −2000 |
| Hızlı alçalma | −2500 ile −3000 |
| Yaklaşma finali | −600 ile −800 |
| Maximum (sınır) | ±6000 |

### Altitude Capture — Hedef İrtifada Durma

V/S modunda uçak hedef irtifaya yaklaşırken otomatik yakalama:

```
Yakalama başlangıç noktası:

  capture_lead = VS² / (2 × max_deceleration_fpm_per_sec)

Pratik kural:
  capture ≈ |VS| × 0.05   (ft cinsinden)

VS = −2000 FPM  →  capture ≈ 100 ft önce başlar
```

Simülasyondaki uygulama (anlık durdurma):

```python
# Hedef irtifaya ulaşıldı mı?
if (self.vs < 0 and self.altitude <= self.sel_alt) or \
   (self.vs > 0 and self.altitude >= self.sel_alt):
    self.altitude = self.sel_alt
    self.vs       = 0.0
    self.alt_mode = "ALT"
    self._vs_managed_override = False
```

### V/S PULL — Simülasyon Akışı

```
1. Pilot FCU ALT penceresinden hedef irtifayı seçer
          fcu_sel_alt = 15000 ft

2. FCU V/S butonlarıyla dikey hız ayarlanır
          fcu_sel_vs  = −1800 FPM

3. V/S PULL butonuna basılır  →  vs_pull: true

4. Backend apply_fcu():
          sel_alt  ← fcu_sel_alt   (hedef irtifa kilitlendi)
          self.vs  ← fcu_sel_vs    (dikey hız aktive edildi)
          alt_mode ← "DES"

5. simulation.update() her 0.1s:
          altitude += −1800 × (0.1 / 60) = −3 ft

6. altitude ≤ sel_alt olunca:
          vs = 0, alt_mode = "ALT"
```

---

## 3. OP DES ve V/S Karşılaştırması

| Kriter | Open Descent | Vertical Speed |
|--------|-------------|----------------|
| Hız korunur mu? | Evet (A/THR) | Hayır |
| VS sabit mi? | Hayır (değişir) | Evet (sabit) |
| Thrust | IDLE | Gerektiği kadar |
| Profil takibi | Yok — hedef alta dek iner | Yok |
| Pilot kontrolü | Sadece hedef irtifa | Hem hedef irtifa hem VS |
| Tipik kullanım | ATC seviye değişikliği | Belirli VS gereken durumlar |
| Hız aşımı riski | Düşük (A/THR korur) | Yüksek (korunmaz) |
| Uçuş yolu açısı | Değişken | Hıza göre değişir |

---

## 4. FCU Etkileşim Özeti

```
ALT penceresi  ─── fcu_sel_alt (ft) ──────────────────────┐
                                                           │
                        ALT PULL  →  sel_alt kilitlenir    │
                                     VS = fcu_sel_vs        │  Hedef
                                     (0 ise default 1000)  │  irtifaya
                                                           │  ulaşınca
V/S penceresi  ─── fcu_sel_vs (FPM) ─────────────────────  │  VS = 0
                                                           │  ALT modu
                        V/S PULL  →  sel_alt kilitlenir    │
                                     VS = fcu_sel_vs        │
                                     (0 ise no-op)          │
                                                           ▼
                                               altitude = sel_alt  ✓
```

---

## 5. FPM ↔ m/s Dönüşümü

```
1 ft/min = 0.00508 m/s
1 m/s    = 196.85 ft/min

VS_ms = VS_fpm × 0.00508
VS_fpm = VS_ms × 196.85
```

| FPM | m/s |
|-----|-----|
| 500 | 2.54 |
| 1000 | 5.08 |
| 1500 | 7.62 |
| 1800 | 9.14 |
| 2500 | 12.70 |
| 3000 | 15.24 |
