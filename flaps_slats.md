# A320 Flap/Slat Referans — 65,000 kg

## Konfigürasyon Tablosu

| Lever | CONF   | Slats | Flaps | VFE (kt) | ΔCD0  | CL_max | Vs1g (kt) | VLS (kt) | α_prot | α_max |
|-------|--------|-------|-------|----------|-------|--------|-----------|----------|--------|-------|
| 0     | CLEAN  | 0°    | 0°    | VMO(350) | —     | 1.30   | 157       | 201      | 177    | 162   |
| 1     | 1      | 18°   | 0°    | 230      | 0.010 | 1.60   | 142       | 174      | 160    | 146   |
| 1*    | 1+F    | 18°   | 10°   | 215      | 0.025 | 1.85   | 132       | 162      | 149    | 136   |
| 2     | 2      | 22°   | 15°   | 200      | 0.040 | 2.10   | 124       | 152      | 140    | 127   |
| 3     | 3      | 22°   | 20°   | 185      | 0.060 | 2.40   | 116       | 142      | 131    | 119   |
| FULL  | FULL   | 27°   | 35°   | 177      | 0.085 | 2.70   | 109       | 134      | 123    | 112   |

> *Lever 1: IAS > 210 kt → CONF 1 (sadece slats), IAS ≤ 210 kt → CONF 1+F (slats + flaps)

---

## Karakteristik Hızlar (65t, ISA, deniz seviyesi)

| Hız            | Değer    | Açıklama                                   | PFD Gösterimi     |
|----------------|----------|--------------------------------------------|--------------------|
| **GD** (Green Dot) | 215 kt  | Best L/D, engine-out drift-down speed      | Yeşil ● (CONF 0)  |
| **S speed**    | 201 kt   | VLS clean — slat retraction min hızı       | Yeşil "S" (CONF 1)|
| **F speed**    | 174 kt   | VLS CONF 1 — flap retraction min hızı      | Yeşil "F" (CONF 2)|

### Formüller

```
GD  = 2 × (kütle_ton) + 85  =  2 × 65 + 85  =  215 kt
S   = VLS_clean              =  Vs1g_clean × 1.28
F   = VLS_CONF1              =  Vs1g_conf1 × 1.23
```

---

## VFE — Maximum Flap Extension Speed

Her konfigürasyonun hız üst limiti. PFD speed tape'de barber pole olarak gösterilir.

```
CONF 0   → VMO = 350 kt / MMO = 0.82
CONF 1   → VFE = 230 kt
CONF 1+F → VFE = 215 kt
CONF 2   → VFE = 200 kt
CONF 3   → VFE = 185 kt
CONF FULL→ VFE = 177 kt
```

Flap konfigürasyonu değiştiğinde PFD'deki barber pole otomatik güncellenir.

---

## VLS — Lowest Selectable Speed

Her konfigürasyonun minimum güvenli hızı. PFD'de amber çizgi.

```
VLS = Vs1g × factor
  factor = 1.28 (clean)
  factor = 1.23 (flapped configs)

Vs1g = √(2 × m × g / (ρ₀ × S × CL_max))
```

---

## Aerodinamik Etki — Drag Modeli

Flap/slat açılarına orantılı CD0 artışı:

```
ΔCD0 = slat_angle × (0.015 / 27°) + flap_angle × (0.070 / 35°)
CD0_total = CD0_base + CD0_altitude + ΔCD0_flap
```

| Bileşen       | Katkı          |
|---------------|----------------|
| Slat drag     | 0–0.015 (0°–27°) |
| Flap drag     | 0–0.070 (0°–35°) |
| **Toplam max**| **0.085** (CONF FULL) |

---

## Geçiş Hızları

| Yüzey | Hız      | Tam açılma süresi (yaklaşık) |
|--------|----------|------------------------------|
| Slats  | 4°/s     | ~7 s (0°→27°)               |
| Flaps  | 3.5°/s   | ~10 s (0°→35°)              |

---

## PFD Speed Tape Gösterimleri

| CONF    | Marker                          |
|---------|---------------------------------|
| CONF 0  | GD (yeşil ●) @ 215 kt          |
| CONF 1  | S (yeşil S) @ 201 kt           |
| CONF 1+F| S (yeşil S) @ 201 kt           |
| CONF 2  | F (yeşil F) @ 174 kt           |
| CONF 3  | sadece VLS                      |
| FULL    | sadece VLS                      |

Her konfigürasyonda VFE barber pole + dinamik VLS gösterilir.
