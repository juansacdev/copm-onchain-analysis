# Análisis on-chain de COPM

> Auditoría reproducible de **COPM** — la stablecoin del peso colombiano de [Minteo](https://minteo.com/) — en Polygon. Escanea todos los eventos `Transfer` desde el bloque de despliegue hasta `latest`, computa agregados diarios/mensuales y genera gráficas SVG.

🇬🇧 [English version](./README.md) · 📊 [Reporte completo](./REPORT.es.md) · 📊 [Full Report (EN)](./REPORT.md)

---

## Qué es esto

Un pipeline pequeño en Node.js, sin dependencias pesadas, que:

1. Descubre el bloque de despliegue de un contrato vía búsqueda binaria sobre `eth_getCode`.
2. Escanea todos los eventos `Transfer` en paralelo (8 workers) directamente desde un RPC de Polygon.
3. Resuelve los timestamps de los bloques con sample-and-interpolate (sin necesidad de consultar cada bloque).
4. Agrega los datos en una serie temporal diaria (CSV) y un resumen estructurado (JSON).
5. Genera 6 gráficas SVG (sin canvas / sin navegador headless).

Output principal para COPM (2023-09-21 → 2026-05-03, 956 días):

| Métrica | Valor |
|---------|-------|
| Eventos Transfer | **173,901** |
| Volumen bruto movido | **$1.83 mil millones USD** |
| Día peak | **2,597 txns / $38.6M USD** (2025-11-24) |
| Mes peak | **Noviembre 2025: $296M USD** |
| Velocidad de circulación | **~444x al año** (vs ~10-20x para USDT/USDC) |

→ Lee el análisis completo en **[REPORT.es.md](./REPORT.es.md)**.

---

## De dónde viene la data

- **Fuente primaria:** mainnet de Polygon, contrato `0x12050c705152931cFEe3DD56c52Fb09Dea816C23` (COPM, proxy ERC-20).
- **Método:** llamadas `eth_getLogs` filtradas por la signature del evento `Transfer(address,address,uint256)`, en chunks de 10,000 bloques (límite duro de Chainstack) paralelizados entre 8 workers.
- **No se usan APIs de terceros** para los datos on-chain — solo un endpoint RPC. Esto significa que el análisis es reproducible por cualquiera con una URL de RPC, e independiente de indexadores como The Graph, Dune, o Etherscan.
- **Tipo de cambio:** 1 USD = 4,000 COP (constante, configurable vía env). El tipo de cambio real fluctuó entre ~3,900 y ~4,400 en el periodo.

El contrato COPM también está desplegado en Celo (`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`) y Solana (`Copm5KwCLXDTWYgXJYmo6ixmMZrxd1wabkujkcuaK47C`). Esta auditoría cubre solo Polygon.

---

## Cómo funciona

```
01-discover.js   → encuentra el deploy block, lee decimals/name/symbol
       │
       ▼
02-scan.js       → 8 workers paralelos, eth_getLogs en chunks de 10k bloques,
       │            backoff adaptativo en errores de rate-limit,
       │            appends de eventos a transfers.jsonl
       ▼
03-resolve-timestamps.js → fetch de ~600 bloques de muestra,
       │                    interpola los timestamps de ~118k bloques únicos
       ▼
04-aggregate.js  → agrupa por día, computa mints/burns/net/gross,
       │            escribe daily.csv + summary.json
       ▼
05-charts.js     → renderiza 6 gráficas SVG en ./charts/
```

### Decisiones técnicas clave

- **Sin dependencia de indexadores externos.** Cada número se deriva de llamadas crudas al RPC. Si no confías en el API de alguien más, puedes verificar cada transferencia leyendo la cadena tú mismo.
- **Timestamps por sample-and-interpolate.** Resolver 118k timestamps únicos vía RPC tomaría ~30 min. Sampleando 600 bloques distribuidos uniformemente e interpolando linealmente da <1 min y <60 segundos de error por bloque — irrelevante para agregación diaria.
- **SVGs hechos a mano.** Sin `chartjs-node-canvas`, sin headless Chrome, sin `puppeteer`. El generador de charts son ~300 líneas y produce SVGs pequeños y embebibles.
- **Tamaño de chunk adaptativo.** Arranca con chunks de 10k bloques (límite duro de Chainstack), halves en errores transitorios, vuelve a subir en éxito.

---

## Cómo correr una auditoría nueva

### Prerrequisitos

- **Node.js 20.6+** (requerido para el flag built-in `--env-file`).
- Una **URL de RPC de Polygon** (Alchemy, Chainstack, QuickNode, Infura, o cualquier provider). Los RPCs públicos funcionan pero son lentos y tienen rate-limit.

### Setup

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
npm install
cp .env.example .env
# edita .env y pon tu POLYGON_RPC_URL
```

### Correr el pipeline

```bash
node --env-file=.env 01-discover.js          # ~30 segundos
node --env-file=.env 02-scan.js --fresh      # ~9 min para el rango de COPM
node --env-file=.env 03-resolve-timestamps.js  # ~30 segundos
node --env-file=.env 04-aggregate.js         # ~5 segundos
node --env-file=.env 05-charts.js            # ~1 segundo
```

Outputs:

| Archivo | Descripción |
|---------|-------------|
| `manifest.json` | Metadata del token + deploy block |
| `transfers.jsonl` | Una línea JSON por evento Transfer |
| `block-ts.json` | Timestamp interpolado por bloque único |
| `daily.csv` | Serie temporal diaria (una fila por día) |
| `summary.json` | Totales, promedios y picos agregados |
| `charts/*.svg` | 6 gráficas |

### Auditar otro token

Para analizar otro ERC-20 en Polygon (o cualquier cadena EVM), edita `config.js`:

```js
export const COPM_ADDRESS = "0xLaDireccionDeTuToken";
```

Para chains que no sean Polygon, también cambia el chain importado de `viem/chains`. Todo lo demás generaliza — el pipeline no es específico a COPM.

---

## Estructura del repo

```
copm-onchain-analysis/
├── config.js                  # RPC client + ABI + env vars
├── 01-discover.js             # encuentra deploy block + metadata
├── 02-scan.js                 # scanner paralelo de Transfer events
├── 03-resolve-timestamps.js   # sample-and-interpolate timestamps
├── 04-aggregate.js            # agregación diaria/mensual
├── 05-charts.js               # generador de SVGs
├── charts/                    # SVGs generadas
├── manifest.json              # output: metadata
├── daily.csv                  # output: serie temporal diaria
├── summary.json               # output: agregados
├── transfers.jsonl            # output: eventos crudos
├── REPORT.md                  # análisis completo (inglés)
├── REPORT.es.md               # análisis completo (español)
└── README.md / README.es.md   # este archivo
```

---

## Licencia y atribución

Toda la data on-chain es pública por definición. El código se publica bajo MIT.

Si usas este template para otro token, la atribución se agradece pero no es requerida. Si encuentras issues o mejoras, PRs bienvenidos.

---

## Autor

**Juan Sebastián Agudelo** — [GitHub](https://github.com/juansacdev) · [LinkedIn](https://www.linkedin.com/in/juansacdev/)

Construido como un estudio personal de la stablecoin COPM de Minteo para verificar claims públicos (ej. "$200M/mes") contra datos crudos de Polygon. El hallazgo principal: el claim público fue **conservador** — el peak de noviembre 2025 fue $296M USD/mes — pero la actividad cayó 68% desde entonces.
