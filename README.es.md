# COPM — Auditoría y análisis on-chain (Polygon + Celo)

> Auditoría reproducible de **COPM**, la stablecoin de peso colombiano de [Minteo](https://minteo.com/), sobre sus dos deployments EVM. Cada evento `Transfer` de la historia de ambos contratos, escaneado directo de cada chain, validado contra el estado on-chain en vivo, y analizado.
>
> 🇬🇧 [English version](./README.md)

| | |
| :--- | :--- |
| 📖 **[La historia como sitio web](https://copm.juansac.dev/)** | El storytelling para todo público — sitio Astro bilingüe (ES/EN), código en [`site/`](./site) |
| 📊 **[Auditoría unificada (Polygon + Celo)](./AUDIT.es.md)** | La vista consolidada, lado a lado |
| 🟣 **[Auditoría de Polygon](./audit/polygon.es.md)** | $2.03B movidos en 2.7 años |
| 🟢 **[Auditoría de Celo](./audit/celo.es.md)** | 120,900 pagos con ticket promedio de $96 |
| 📚 **[Glosario](./GLOSSARY.es.md)** | Todos los términos, en lenguaje claro |

---

## Por qué existe este repositorio

Fui parte del equipo founding que construyó COPM en Minteo. Diseñamos y construimos los sistemas, los workflows y la arquitectura que movieron ese dinero.

Y aquí viene el problema clásico: casi nada de eso se puede mostrar. El código es propiedad de la empresa. Los dashboards son internos. Los NDAs existen y se respetan.

Pero hay una excepción enorme: **la blockchain es pública por definición.** Cada mint, cada burn, cada transfer de COPM quedó registrado en Polygon y Celo, verificable por cualquiera, para siempre. No es información interna de la empresa, ni su codebase, ni su IP — es el registro público de lo que el sistema hizo.

Así que en vez de pedirte que me creas, lo audité: **317,696 eventos, ~$2.05 mil millones de dólares en volumen, dos chains, 24 checks de validación en verde.** Este repositorio es la evidencia, los scripts para reproducirla y el análisis de lo que cuenta.

## Los titulares

| Métrica | Valor |
| :--- | :--- |
| Volumen bruto total (ambas chains) | **~$2.05B USD** |
| Eventos `Transfer` auditados | **317,696** |
| Mes pico (Polygon) | **$318.4M USD** (noviembre 2025) |
| Día pico (Polygon) | **$38.6M USD · 2,597 transacciones** (2025-11-24) |
| Rotación del supply (Polygon) | **~35x al mes** (~25 veces más rápido que USDT/USDC) |
| Reconciliación de supply (Celo) | **Exacta: 0.0% de desviación** contra `totalSupply()` |
| Validación | **24/24 checks** — incluye re-verificación de transfers contra la chain en vivo |

→ El detalle, los gráficos y la historia completa están en la **[auditoría unificada](./AUDIT.es.md)**.

## En los medios

En septiembre de 2025, **La República** (el diario financiero colombiano) cubrió el hito de Minteo superando los **US$200 millones mensuales** en transacciones con COPM sobre Polygon: [*"Cómo hacer transacciones con stablecoins"*](https://www.larepublica.co/finanzas/como-hacer-transacciones-con-stablecoins-4221338). Esta auditoría confirma ese hito con datos públicos — y muestra que dos meses después el sistema llegó a **$318.4M** en un solo mes.

## Cómo funciona

Un pipeline de Node.js, liviano a propósito (una sola dependencia: [viem](https://viem.sh)), que corre por chain:

```
01-discover.js    → encuentra el bloque de deploy (búsqueda binaria sobre eth_getCode)
02-scan.js        → descarga todos los eventos Transfer (eth_getLogs, workers paralelos,
                     backoff adaptativo ante rate limits)
03-resolve-timestamps.js → timestamps por muestreo e interpolación
04-aggregate.js   → serie diaria: volumen, mints, burns, supply derivado
05-charts.js      → SVGs autocontenidos (sin canvas, sin headless browser)
06-combined-charts.js → gráficos Polygon + Celo en los mismos ejes
07-validate.js    → 12 checks por chain, incluyendo spot checks contra la chain en vivo
```

**La única fuente es un endpoint RPC.** Sin indexers, sin APIs de terceros, sin exploradores de bloques. Funciona con un RPC de pago (más rápido) o con uno público (gratis; el scanner se autorregula).

## Reprodúcelo

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
cp .env.example .env   # configura tus RPCs (el de Celo público ya viene puesto)
npm install

npm run audit:polygon  # solo Polygon (~15 min con RPC de pago)
npm run audit:celo     # solo Celo (~25 min con el RPC público)
npm run audit:all      # ambas + charts combinados
```

Cada corrida es completa e idempotente: escanea desde el deploy block hasta `latest`, valida y regenera todo.

## Estructura del repositorio

```
├── AUDIT.es.md / AUDIT.md        # auditoría unificada (empieza aquí)
├── audit/
│   ├── polygon.es.md / polygon.md  # auditoría por chain
│   └── celo.es.md / celo.md
├── GLOSSARY.es.md / GLOSSARY.md  # glosario
├── data/<chain>/                 # datos crudos y derivados por chain
│   ├── transfers.jsonl           # cada evento Transfer (crudo)
│   ├── daily.csv                 # serie diaria agregada
│   ├── summary.json              # totales, promedios, picos
│   ├── manifest.json             # metadatos del contrato y del scan
│   └── validation.json           # resultado de los 12 checks
├── charts/<chain>/               # 6 SVGs por chain
├── charts/combined/              # 4 SVGs comparativos
├── site/                         # sitio web del storytelling (Astro, ES + EN)
└── 0*.js                         # el pipeline
```

## Contratos auditados

| Chain | Contrato |
| :--- | :--- |
| Polygon | [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) |
| Celo | [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) |

## Licencia

[MIT](./LICENSE) — úsalo, fórkealo, audita tu propio token con él.
