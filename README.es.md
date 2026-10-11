# COPM — Auditoría y análisis on-chain (Polygon + Celo)

> Auditoría reproducible de **COPM**, la stablecoin de peso colombiano de [Minteo](https://minteo.com/), sobre sus dos deployments EVM. Cada evento `Transfer` de la historia de ambos contratos, escaneado directo de cada chain, validado contra el estado on-chain en vivo, y analizado.
>
> 🇬🇧 [English version](./README.md)

| | |
| :--- | :--- |
| 📖 **[La historia como sitio web](https://copm.juansac.dev/)** | El storytelling para todo público — sitio Astro bilingüe (ES/EN), código en [`site/`](./site) |
| 📊 **[Auditoría unificada (Polygon + Celo)](./docs/AUDIT.es.md)** | La vista consolidada, lado a lado |
| 🟣 **[Auditoría de Polygon](./docs/audit/polygon.es.md)** | $2.03B movidos en 2.7 años |
| 🟢 **[Auditoría de Celo](./docs/audit/celo.es.md)** | 120,900 pagos con ticket promedio de $96 |
| 📚 **[Glosario](./docs/GLOSSARY.es.md)** | Todos los términos, en lenguaje claro |

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

→ El detalle, los gráficos y la historia completa están en la **[auditoría unificada](./docs/AUDIT.es.md)**.

## En los medios

En septiembre de 2025, **La República** (el diario financiero colombiano) cubrió el hito de Minteo superando los **US$200 millones mensuales** en transacciones con COPM sobre Polygon: [*"Cómo hacer transacciones con stablecoins"*](https://www.larepublica.co/finanzas/como-hacer-transacciones-con-stablecoins-4221338). Esta auditoría confirma ese hito con datos públicos — y muestra que dos meses después el sistema llegó a **$318.4M** en un solo mes.

## Cómo funciona

Un pipeline de Node.js, liviano a propósito (una sola dependencia: [viem](https://viem.sh)), que corre por chain:

```
discover          → actualiza los metadatos estáticos del token (manifest.json)
scan              → scan incremental y verificado de todos los eventos del contrato
                     (eth_getLogs, workers paralelos); continúa desde el último checkpoint
aggregate         → serie diaria: volumen, mints, burns, supply derivado, approvals
charts            → SVGs autocontenidos (sin canvas, sin headless browser)
charts:combined   → gráficos Polygon + Celo en los mismos ejes
validate          → 12 checks por chain, incluyendo spot checks contra la chain en vivo
```

Cada paso es un comando de un único CLI: `node pipeline/cli.js <comando> [--chain polygon|celo] [--fresh]`. `--chain` toma por defecto la variable de entorno `CHAIN` y, si no existe, `polygon`. Los scripts de `npm run` de abajo lo envuelven.

**La única fuente es un endpoint RPC.** Sin indexers, sin APIs de terceros, sin exploradores de bloques. Funciona con un RPC de pago (más rápido) o con uno público (gratis; el scanner reintenta y contrasta sus respuestas).

### Por qué se puede confiar en el scan

Los endpoints públicos están detrás de balanceadores de carga, y un backend al que le falta parte del índice de logs responde `eth_getLogs` con un arreglo vacío y sin error. Un scan simple guarda esos huecos. Este no avanza hasta que los eventos que tiene cuadran con el contrato:

- **Canario y verificación del head en cada lote.** Un lote es `[eth_blockNumber, un bloque con cantidad de logs conocida, ...rangos]`; se descarta salvo que el canario devuelva exactamente esa cantidad y el head cubra los rangos.
- **Los rangos vacíos se confirman.** Una respuesta con eventos es definitiva; una vacía debe repetirse `emptyConfirmations` veces (2 en Polygon, 6 en Celo) en lotes independientes.
- **Reconciliación exacta antes de mover el checkpoint.** Minted − burned debe ser igual a `totalSupply()` en el último bloque de la etapa, al wei (un `eth_call` fijado a ese bloque y enviado por separado). Si no cuadra, la corrida falla y no escribe nada de esa etapa.
- **Timestamps exactos.** Cada transferencia lleva el timestamp de su bloque (del log, o del header del bloque cuando el nodo devuelve `0x0`), así que los días no se interpolan.
- **Idempotente y reanudable.** Las escrituras son atómicas; `data/<chain>/state.json` se escribe al final, y una nueva corrida tras una caída descarta todo lo que esté por encima del checkpoint.

Ajustes, todos opcionales: `--workers`, `--max-log-range`, `--ranges-per-batch`, `--empty-confirmations`, `--confirmations`, `--stage-blocks`, `--max-batch-attempts` (o las variables `SCAN_*` equivalentes). Los valores por defecto están por chain en `pipeline/config/chains.js`. `scan --fresh` descarta lo que el scan generó para esa chain y empieza de cero.

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

El primer `scan` recorre todo el historial desde el deploy block; las corridas siguientes solo escanean los bloques agregados desde el checkpoint. Requiere Node.js 22+; `npm test` corre los tests unitarios (sin red).

## Estructura del repositorio

```
├── docs/
│   ├── AUDIT.es.md / AUDIT.md    # auditoría unificada (empieza aquí)
│   ├── audit/
│   │   ├── polygon.es.md / polygon.md  # auditoría por chain
│   │   └── celo.es.md / celo.md
│   └── GLOSSARY.es.md / GLOSSARY.md    # glosario
├── pipeline/
│   ├── cli.js                    # punto de entrada: node pipeline/cli.js <comando>
│   ├── config/                   # tabla de chains y rutas (sin efectos secundarios)
│   ├── domain/                   # lógica pura: eventos, ledger, rangos, integridad, agregación, reglas de validación
│   ├── adapters/                 # cliente JSON-RPC, almacenamiento del scan (escrituras atómicas)
│   ├── steps/                    # un módulo por comando
│   └── charts/                   # librería de gráficos SVG
├── tests/                        # node --test, sin dependencias adicionales
├── data/<chain>/                 # datos crudos y derivados por chain
│   ├── transfers/YYYY-MM.jsonl   # cada evento Transfer, un archivo por mes UTC
│   ├── admin-events.jsonl        # upgrades, roles, pausas, congelamientos
│   ├── approvals.json            # conteo de Approval por día y por spender
│   ├── state.json                # checkpoint del scan (solo se escribe tras reconciliar)
│   ├── daily.csv                 # serie diaria agregada
│   ├── summary.json              # totales, promedios, picos
│   ├── manifest.json             # metadatos estáticos del contrato
│   └── validation.json           # resultado de los 12 checks
├── charts/<chain>/               # 6 SVGs por chain
├── charts/combined/              # 4 SVGs comparativos
├── site/                         # sitio web del storytelling (Astro, ES + EN)
└── package.json                  # scripts de npm que envuelven el CLI
```

## Contratos auditados

| Chain | Contrato |
| :--- | :--- |
| Polygon | [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) |
| Celo | [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) |

## Licencia

[MIT](./LICENSE) — úsalo, fórkealo, audita tu propio token con él.
