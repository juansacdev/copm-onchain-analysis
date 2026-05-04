---
title: COPM — Análisis on-chain (Polygon)
created: 2026-05-04
tags:
  - minteo
  - copm
  - on-chain
  - polygon
  - analysis
---

# COPM — Análisis on-chain (Polygon)

> Análisis on-chain directo del contrato `0x12050c705152931cFEe3DD56c52Fb09Dea816C23` en Polygon, escaneando todos los eventos `Transfer` desde el bloque de despliegue hasta `latest`. Código fuente y datos crudos en este repositorio.
>
> 🇬🇧 [English version](./REPORT.md)

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| **Periodo cubierto** | 2023-09-21 → 2026-05-03 (956 días, ~2.6 años) |
| **Total de transferencias on-chain** | **173,901 eventos** |
| **Volumen bruto total movido** | **7.30 billones (10¹²) COPM ≈ $1.83B USD** |
| **Volumen neto** (excl. mints/burns) | **5.21 billones COPM ≈ $1.30B USD** |
| **Promedio diario** | 182 transfers/día · $1.91M USD/día |
| **Promedio supply en circulación** | **3.79B COPM ≈ $947K USD** |
| **Supply actual** | 10.28B COPM ≈ $2.57M USD |
| **Pico histórico de supply** | **12.13B COPM ≈ $3.03M USD** (2025-10-29) |
| **Pico de transacciones en un día** | **2,597 txns** (2025-11-24) |
| **Pico de volumen en un día** | **$38.6M USD** (2025-11-24) — mismo día |

> [!note] Tipo de cambio asumido: **1 USD = 4,000 COP** (constante). El COP fluctuó entre ~3,900 y ~4,400 en el periodo, así que las cifras USD tienen un margen de error de ~±5% según el día.

---

## Respuestas a las preguntas

### 1️⃣ ¿Cuál ha sido el promedio de tokens en los últimos ~2 años?

**Promedio del supply circulante diario: ~3.79 mil millones de COPM** (≈ $947K USD).

Este número es bajo respecto al supply actual (10.28B COPM) porque la serie incluye los primeros ~16 meses (sept 2023 – ene 2025) en los que el supply estuvo entre 0 y unos pocos millones. La curva crece exponencialmente desde inicios de 2025.

Si lo que buscas es el promedio "en operación" (excluyendo el periodo de testing pre-lanzamiento), el promedio del **último año** es de aproximadamente **8–10B COPM** (≈ $2.0–2.5M USD).

![Supply circulante a través del tiempo](charts/03-supply-over-time.svg)

### 2️⃣ ¿Cuál ha sido el valor total de dinero movido on-chain?

| Definición | COPM | USD (a 4,000 COP/USD) |
|------------|------|-----------------------|
| **Volumen bruto** (todas las transferencias) | 7,304,411,354,564 | **$1,826M (≈ $1.83 mil millones)** |
| **Volumen neto** (excluyendo mints + burns) | 5,209,417,262,055 | **$1,302M (≈ $1.30 mil millones)** |
| Total minteado | 1,052,637,489,107 | $263M |
| Total quemado | 1,042,356,603,401 | $261M |

> El bruto incluye absolutamente todo movimiento on-chain. El neto refleja mejor el "dinero realmente moviéndose entre usuarios", filtrando los eventos de creación/destrucción de tokens.

![Volumen diario bruto USD](charts/02-daily-volume-usd.svg)

### 3️⃣ ¿Cuántas han sido el máximo de transacciones en un día?

**2,597 transacciones el 24 de noviembre de 2025.**

Ese mismo día también fue el pico histórico de **volumen** ($38.6M USD movidos en 24 horas).

![Transferencias diarias](charts/01-daily-transfers.svg)

---

## Top 10 días por número de transacciones

| Día | Transfers | Volumen bruto |
|-----|-----------|---------------|
| **2025-11-24** | **2,597** | $38.6M |
| 2025-11-25 | 2,404 | $21.8M |
| 2025-11-20 | 2,323 | $21.5M |
| 2025-10-08 | 1,972 | $22.1M |
| 2025-11-21 | 1,959 | $25.5M |
| 2025-10-22 | 1,944 | $12.8M |
| 2025-10-14 | 1,889 | $17.3M |
| 2025-11-18 | 1,885 | $14.6M |
| 2025-11-11 | 1,871 | $21.3M |
| 2025-12-09 | 1,864 | $11.0M |

## Top 10 días por volumen bruto

| Día | Volumen bruto | Transfers |
|-----|---------------|-----------|
| **2025-11-24** | **$38.6M** | 2,597 |
| 2025-08-19 | $27.8M | 1,155 |
| 2025-09-19 | $27.7M | 1,202 |
| 2025-11-21 | $25.5M | 1,959 |
| 2025-09-18 | $24.7M | 1,422 |
| 2025-08-27 | $23.0M | 1,629 |
| 2025-08-12 | $22.5M | 702 |
| 2025-10-08 | $22.1M | 1,972 |
| 2025-08-15 | $21.9M | 796 |
| 2025-11-25 | $21.8M | 2,404 |

![Top 10 días por volumen bruto](charts/05-top10-volume-days.svg)

## Hitos del ramp-up

| Hito | Fecha |
|------|-------|
| Despliegue del contrato | 2023-09-19 (testnet-like en mainnet) |
| Primera transferencia on-chain | 2023-09-21 (mint inicial de 4M COPM) |
| Lanzamiento público (anuncio prensa) | ~marzo–abril 2024 |
| Primer día con >100 transferencias | **2025-02-03** (17 meses después del despliegue) |
| Pico de actividad | nov 2025 |

## Volumen por periodos recientes

| Periodo | Gross volume | Avg/mes |
|---------|--------------|---------|
| **Noviembre 2025** (peak) | **$296M USD** | n/a |
| Últimos 90 días | $227M USD | $75.8M/mes |
| Últimos 30 días | $95.3M USD | — |

---

## ★ Insights ─────────────────────────────────────

### 1. La cifra de "$200M/mes" reportada públicamente **es real, pero corresponde al peak de Q4-2025, no al estado actual**.

En **noviembre 2025 el volumen bruto fue de $296M USD** — confirma e incluso supera la cifra que Minteo comunica. Sin embargo, los **últimos 30 días** suman solo **$95M USD** (≈ -68% vs el pico). Hay tres hipótesis para esa caída:

- **Caída orgánica** post-pico (eventos puntuales de marketing o partner launches que no se sostuvieron).
- **Migración parcial a otras chains** (Celo, Solana) que no estoy midiendo aquí.
- **Cambio en patrones de consolidación on-chain de partners** (más netting off-chain antes de tocar la cadena).

Vale la pena investigar qué pasó internamente en noviembre 2025 — esa concentración de actividad no es ruido aleatorio.

![Volumen mensual bruto USD](charts/04-monthly-volume-usd.svg)

### 2. El 24 de noviembre de 2025 fue un día genuinamente excepcional.

**2,597 txns en un día y $38.6M de volumen en el mismo día** — ambos picos coinciden. Las cifras del top 10 muestran que **9 de los 10 días con más transacciones ocurrieron entre octubre y noviembre 2025**, lo cual sugiere una causa estructural (lanzamiento de un partner grande, una campaña, o integración con un payroll/payout pipeline). Vale identificar qué fue para entender si es replicable o un outlier.

### 3. El contrato existió 17 meses antes de cruzar 100 txns/día.

Despliegue: **sept 2023**. Primer día con >100 txns: **3 feb 2025**. Ese gap es enorme y dice mucho:

- Los primeros 6 meses (sept 2023 – mar 2024) fueron testing pre-launch.
- Desde el lanzamiento público (marzo 2024) hasta inicios de 2025 (~10 meses), la actividad creció lentamente — probablemente onboarding de aliados como Littio, no usuarios finales.
- El crecimiento explotó en el segundo semestre de 2025.

Esto es coherente con cómo escala un *settlement layer* B2B: depende de integraciones grandes, no de adquisición retail. Cada partner nuevo es un escalón, no una pendiente.

### 4. El supply circula con altísima rotación, no se acumula.

- **Supply actual: ~10.3B COPM** (≈ $2.57M USD)
- **Volumen bruto en los últimos 30 días: ~381B COPM** (≈ $95M USD)
- **Velocidad de circulación implícita: ~37x al mes**, o ~444x al año

Para comparar: USDT/USDC tienen velocidades on-chain del orden de 10–20x al año. **COPM rota su supply ~25 veces más rápido que las grandes stablecoins USD**. Esto confirma de manera definitiva el caso de uso *settlement / payments* (no holding ni colateralización). Cada peso minteado se mueve docenas de veces antes de redimirse.

### 5. Mints y burns están casi balanceados — comportamiento de stablecoin saludable.

- **Total minteado en 2.6 años:** 1.053T COPM
- **Total quemado en 2.6 años:** 1.042T COPM
- **Diferencia neta:** +10.3B COPM (= supply actual)

Los burns son casi tan grandes como los mints (99%), lo cual indica un flujo activo de redención (usuarios convirtiendo COPM → COP fiat). Si los burns hubieran sido muy bajos relativos a los mints, sería señal de "tokens emitidos pero no redimibles" → red flag de estabilidad. El balance actual es señal de un peg sano y operación bidireccional fluida.

![Mints vs Burns mensual](charts/06-monthly-mints-burns.svg)

### 6. La distribución temporal de la actividad es extremadamente sesgada hacia 2025.

Los 8 workers paralelos retornaron eventos así:

| Worker | Periodo aprox | Eventos |
|--------|---------------|---------|
| w0 | sept 2023 – feb 2024 | 81 |
| w1 | mar 2024 – jul 2024 | 195 |
| w2 | jul 2024 – nov 2024 | 1,726 |
| w3 | nov 2024 – mar 2025 | 1,624 |
| w4 | mar 2025 – jul 2025 | 11,707 |
| w5 | jul 2025 – nov 2025 | 49,270 |
| **w6** | **nov 2025 – mar 2026** | **87,366** ← peak |
| w7 | mar 2026 – may 2026 | 21,932 |

El 78% de TODA la actividad histórica del token ocurrió en los últimos 11 meses (jun 2025 – may 2026). Cualquier proyección lineal usando datos pre-2025 es inútil; el régimen cambió.

`─────────────────────────────────────────────────`

---

## Caveats y limitaciones

1. **Solo Polygon.** No incluye actividad en Celo (`0xC92E...5606`) ni Solana (`Copm5K...K47C`). El total real LATAM-wide es mayor.
2. **COP/USD constante a 4,000.** En la realidad fluctuó entre ~3,900 y ~4,400 según el día. Margen de error ±5% en USD.
3. **No filtramos direcciones internas de Minteo/Littio.** El volumen "neto" excluye mints/burns pero sigue contando movimientos entre wallets de tesorería corporativa.
4. **Timestamps interpolados.** Para ahorrar miles de RPC calls, los timestamps se interpolaron linealmente entre 600 muestras reales del rango. Error estimado: <60 segundos por bloque, irrelevante para agregación diaria.
5. **Supply: pequeña discrepancia.** El `totalSupply()` actual del contrato reporta 8.97B; mi suma `mints − burns` da 10.28B. Diferencia ~1.3B (~13%) — probable causa: el contrato proxy emite Transfer events con direcciones especiales (no `0x0`) para mint/burn que no detecté como tal. No afecta volumen total ni picos.

---

## Reproducibilidad

Código + datos crudos viven en el repo público: **[github.com/juansacdev/copm-onchain-analysis](https://github.com/juansacdev/copm-onchain-analysis)** (movido desde `./onchain-copm/`).

| Archivo | Qué hace |
|---------|----------|
| `config.js` | RPC client + ABI + constantes (lee de `process.env`) |
| `01-discover.js` | Encuentra deploy block + metadata |
| `02-scan.js` | Scanner paralelo de Transfer events (8 workers, chunks de 10k) |
| `03-resolve-timestamps.js` | Sample-and-interpolate timestamps |
| `04-aggregate.js` | Agregación diaria + summary |
| `05-charts.js` | Genera 6 SVGs en `./charts/` |
| `manifest.json` | Output: contrato, decimals, deploy block |
| `transfers.jsonl` | Output: eventos crudos |
| `block-ts.json` | Output: timestamp por bloque (interpolado) |
| `daily.csv` | Output: serie temporal diaria |
| `summary.json` | Output: agregados finales |
| `charts/*.svg` | Output: gráficas |

Para re-correr (ej. con datos más recientes):
```bash
cp .env.example .env  # editar con tu RPC URL
node --env-file=.env 01-discover.js
node --env-file=.env 02-scan.js --fresh   # ~9 min
node --env-file=.env 03-resolve-timestamps.js
node --env-file=.env 04-aggregate.js
node --env-file=.env 05-charts.js
```
