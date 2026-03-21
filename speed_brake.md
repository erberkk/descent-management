# A320 Speed Brake Referans — 65,000 kg

## Genel

Speed brake (spoiler panelleri) kanat üstünde açılarak drag artırır.
Descent'te iniş oranını artırmak veya hızı kontrol etmek için kullanılır.

---

## Lever Pozisyonları

| Pozisyon | Değer | Açıklama                  |
|----------|-------|---------------------------|
| RET      | 0%    | Kapalı — normal uçuş      |
| 1/4      | 25%   | Hafif drag artışı          |
| 1/2      | 50%   | Orta drag                  |
| 3/4      | 75%   | Yüksek drag                |
| FULL     | 100%  | Maksimum drag              |

---

## Aerodinamik Etki

```
ΔCD0 = spd_brk_actual × 0.050

CD0_total = CD0_base + CD0_altitude + CD0_flap + CD0_speed_brake
```

| Pozisyon | ΔCD0   | Toplam CD0 (clean, FL350) |
|----------|--------|---------------------------|
| RET      | 0.000  | ~0.032                    |
| 25%      | 0.0125 | ~0.044                    |
| 50%      | 0.025  | ~0.057                    |
| 75%      | 0.0375 | ~0.069                    |
| FULL     | 0.050  | ~0.082                    |

---

## Geçiş Hızı

| Parametre        | Değer          |
|------------------|----------------|
| Deploy rate      | 0.7 / saniye   |
| Tam açılma süresi| ~1.4 saniye    |
| Tam kapanma      | ~1.4 saniye    |

---

## Mod Etkileşimleri

### OP DES (Idle Thrust + Speed Brake)

Thrust IDLE'da, extra drag VS'i artırır:

```
sin(γ) = (T_idle − D) / W
VS = TAS × sin(γ) × 101.269
```

| Durum              | Yaklaşık VS (FL350, M0.78) |
|--------------------|----------------------------|
| OP DES, brake yok  | ~ -2000 FPM               |
| OP DES, brake FULL | ~ -8000 FPM               |

### Cruise / Level Flight (A/THR aktif)

Speed brake açılınca A/THR thrust artırarak hızı korur:
- N1 yükselir (70 → 87% gibi)
- Hız korunur ama yakıt tüketimi artar
- A/THR limiti aşılırsa hız düşmeye başlar

### A/THR kapalı / V/S modu

Speed brake açılınca:
- Hız daha hızlı düşer (extra drag, sabit thrust)
- Speed trend arrow PFD'de aşağı yönlü büyür

---

## Kısıtlamalar (Henüz Uygulanmadı)

- [ ] CONF 2+ ile speed brake kullanılmamalı (veya otomatik kapatılmalı)
- [ ] Landing'de ground spoiler (otomatik full extend at touchdown)
- [ ] Go-around'da otomatik retract

---

## PFD / FMA Gösterimi

| Durum           | FMA Col 3 (ECAM)      |
|-----------------|-----------------------|
| Brake kapalı    | (boş)                 |
| Brake açık      | Yeşil "SPD BRK"       |

---

## FCU Kontrol

- Motor gauge'larının **solunda**
- 5 pozisyon butonu: RET / 25 / 50 / 75 / 100
- Üstte yüzde göstergesi
- Alt label: "SPD BRK"

---

## Backend Sabitleri

```python
A320_SPD_BRK_CD0  = 0.050     # ΔCD0 at full deployment
A320_SPD_BRK_RATE = 0.7       # deployment rate [1/s]
```

State alanları:
- `spd_brk_lever`:  0.0 – 1.0 (komut edilen pozisyon)
- `spd_brk_actual`: 0.0 – 1.0 (gerçek pozisyon, kademeli geçiş)
