# COPM — Auditoría y análisis on-chain (Polygon + Celo)

> Auditoría reproducible de **COPM**, la stablecoin de peso colombiano de [Minteo](https://minteo.com/), sobre sus dos deployments EVM. Cada evento `Transfer` de la historia de ambos contratos, escaneado directo de cada chain, validado contra el estado on-chain en vivo, y analizado.
>
> 🇬🇧 [English version](./README.md)

| | |
| :--- | :--- |
| 📖 **[La historia como sitio web](https://copm.juansac.dev/)** | El storytelling para todo público — sitio Astro bilingüe (ES/EN), código en [`site/`](./site) |
| 📊 **[Auditoría unificada (Polygon + Celo)](./docs/AUDIT.es.md)** | La vista consolidada, lado a lado |
| 🟣 **[Auditoría de Polygon](./docs/audit/polygon.es.md)** | <!-- copm:polygon.grossVolumeUsd -->US$2.165 millones<!-- /copm --> movidos en <!-- copm:polygon.years -->3,1<!-- /copm --> años |
| 🟢 **[Auditoría de Celo](./docs/audit/celo.es.md)** | <!-- copm:celo.transfers -->132.944<!-- /copm --> transferencias con ticket promedio de <!-- copm:celo.avgTicketUsd -->US$98<!-- /copm --> |
| 🔔 **[Eventos del contrato](./docs/EVENTS.es.md)** | Qué eventos importan y qué cuenta cada uno |
| 📚 **[Glosario](./docs/GLOSSARY.es.md)** | Todos los términos, en lenguaje claro |

---

## Por qué existe este repositorio

Fui parte del equipo founding que construyó COPM en Minteo. Diseñamos y construimos los sistemas, los workflows y la arquitectura que movieron ese dinero.

Y aquí viene el problema clásico: casi nada de eso se puede mostrar. El código es propiedad de la empresa. Los dashboards son internos. Los NDAs existen y se respetan.

Pero hay una excepción enorme: **la blockchain es pública por definición.** Cada mint, cada burn, cada transfer de COPM quedó registrado en Polygon y Celo, verificable por cualquiera, para siempre. No es información interna de la empresa, ni su codebase, ni su IP — es el registro público de lo que el sistema hizo.

Así que en vez de pedirte que me creas, lo audité: **<!-- copm:combined.transfers -->374.802<!-- /copm --> eventos `Transfer`, ~<!-- copm:combined.grossVolumeUsd -->US$2.178 millones<!-- /copm --> en volumen, dos chains, <!-- copm:combined.checksPassed -->34<!-- /copm --> checks de validación en verde.** Este repositorio es la evidencia, los scripts para reproducirla y el análisis de lo que cuenta.

## Los titulares

| Métrica | Valor |
| :--- | :--- |
| Volumen bruto total (ambas chains) | **~<!-- copm:combined.grossVolumeUsd -->US$2.178 millones<!-- /copm -->** |
| Eventos `Transfer` auditados | **<!-- copm:combined.transfers -->374.802<!-- /copm -->** |
| Mes pico (Polygon) | **<!-- copm:polygon.peakMonthUsd -->US$318,4 millones<!-- /copm -->** (<!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm -->) |
| Día de mayor volumen (Polygon) | **<!-- copm:polygon.peakVolumeUsd -->US$38,6 millones<!-- /copm -->** (<!-- copm:polygon.peakVolumeDay -->2025-11-24<!-- /copm -->) |
| Día con más transferencias (Polygon) | **<!-- copm:polygon.peakTxCount -->2.597<!-- /copm --> transferencias** (<!-- copm:polygon.peakTxDay -->2025-11-24<!-- /copm -->) |
| Rotación del supply (Polygon, últimos 30 días) | **~<!-- copm:polygon.turnoverMonthly -->13,7<!-- /copm -->x al mes** |
| Reconciliación de supply | **Exacta en ambas chains**: minted − burned es igual a `totalSupply()` al wei |
| Validación | **<!-- copm:combined.checksPassed -->34<!-- /copm -->/<!-- copm:combined.checksTotal -->34<!-- /copm --> checks estrictos** — offline, sin tolerancia, cada balance contrastado con `balanceOf` |

→ El detalle, los gráficos y la historia completa están en la **[auditoría unificada](./docs/AUDIT.es.md)**.

## En los medios

En septiembre de 2025, **La República** (el diario financiero colombiano) cubrió el hito de Minteo superando los **US$200 millones mensuales** en transacciones con COPM sobre Polygon: [*"Cómo hacer transacciones con stablecoins"*](https://www.larepublica.co/finanzas/como-hacer-transacciones-con-stablecoins-4221338). Esta auditoría confirma ese hito con datos públicos — y muestra que dos meses después el sistema llegó a **<!-- copm:polygon.month.2025-11.usd -->US$318,4 millones<!-- /copm -->** en un solo mes.

## Cómo funciona

Un pipeline de Node.js, liviano a propósito (una sola dependencia: [viem](https://viem.sh)), que corre por chain:

```
discover          → actualiza los metadatos estáticos del token (manifest.json)
scan              → scan incremental y verificado de todos los eventos del contrato
                     (eth_getLogs, workers paralelos); continúa desde el último checkpoint
holders           → snapshot de holders en el bloque del checkpoint, cada balance
                     verificado con balanceOf (holders.csv, holders.json)
aggregate         → serie diaria: volumen, mints, burns, supply derivado, approvals
charts            → SVGs autocontenidos (sin canvas, sin headless browser)
charts:combined   → gráficos Polygon + Celo en los mismos ejes
validate          → reglas estrictas por chain, offline y sin tolerancia; exit 1 si falla alguna
reports           → completa cada cifra de los reportes en Markdown desde los archivos de datos
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

**Lo que estas verificaciones no prueban.** El canario es un filtro, no una prueba: los elementos de un mismo lote pueden ser respondidos por backends distintos. La reconciliación prueba el libro de saldos, pero un rango perdido cuyo mint, pago y burn se cancelen dejaría intactos la oferta y los saldos; contra eso solo protege la confirmación repetida de los rangos vacíos. En un endpoint que falla seguido, sube `emptyConfirmations`.

**Procedencia del historial de Celo.** El 2026-10-11 el endpoint público de Celo (`forno.celo.org`) devolvió respuestas vacías para entre el 11 % y el 75 % de los rangos con eventos y casi nunca pasó el canario del bloque de despliegue, así que un scan del historial completo no pudo terminar ahí. El historial hasta el bloque 79.856.063 se armó con la unión de siete scans más el dataset anterior, se cargó a este formato y luego se certificó con las mismas verificaciones: oferta igual a `totalSupply()` al wei y cada uno de los <!-- copm:celo.addressesEverSeen -->3.123<!-- /copm --> saldos igual a `balanceOf`. Las transferencias quedan cubiertas por esa prueba; los contadores de approvals de Celo son una cota inferior. Las corridas diarias continúan desde ese checkpoint, donde el canario es reciente y el endpoint responde bien. `scan --fresh --chain celo` contra un endpoint de archivo lo reconstruye desde el deploy block.

### El snapshot de holders

`holders` lee las transferencias que guardó `scan` y la chain en el mismo bloque, `state.lastBlock`, nunca en el head actual. No escribe nada salvo que se cumplan tres cosas, al wei:

- toda dirección que aparece alguna vez en una transferencia tiene un balance del libro igual a `balanceOf` en ese bloque;
- los balances positivos on-chain suman `totalSupply()`;
- ningún balance del libro es negativo.

Un `eth_call` fijado a un bloque o falla o responde bien, y los ítems de un lote pueden ser atendidos por backends distintos, así que cada ítem se verifica por separado y se reintenta (lotes de máximo 100 llamadas, `--max-batch-attempts` por ítem). Un error nunca se interpreta como cero. El paso también lee `paused()`, el slot de implementación ERC-1967, los miembros de cada rol, `eth_getCode` de cada holder (`contract` o `wallet`) e `isFrozen` de las cuentas que aparecen en eventos `Frozen`, `Thawed` o `BurnedFrozen`.

Escribe `data/<chain>/holders.csv` (una fila por dirección con balance positivo: `rank,address,balance_copm,share_pct,kind,frozen,received_copm,sent_copm,transfers_in,transfers_out,first_seen,last_seen`) y `data/<chain>/holders.json` (bloque, supply, cantidad de holders, concentración del top 1/5/10/50, rangos de balance, miembros de cada rol, estado de pausa, implementación, top 25).

### Las cifras de estos documentos

Ningún número de los reportes se escribe a mano. Una cifra se escribe como `<!-- copm:polygon.transfers -->241.858<!-- /copm -->`, invisible al renderizar, y `npm run reports` reescribe su contenido desde `data/<chain>/*` (formato en inglés o en español según el nombre del archivo: `*.es.md` es español). `npm run reports:check` no escribe nada y termina con exit 1 si alguna cifra está desactualizada; `audit:all` termina con `reports`. Las claves se construyen en [`pipeline/domain/report.js`](./pipeline/domain/report.js). Lo que no se deriva de los datos (años, direcciones, enlaces a exploradores) queda como texto fijo.

### Validación

`validate` es estricto y offline: lee solo los archivos que escriben `scan`, `holders` y `aggregate`, así que el CI puede correrlo en cada push. Entre sus <!-- copm:polygon.checksTotal -->17<!-- /copm --> reglas: minted − burned es igual a `totalSupply` al wei, recorrer las transferencias guardadas reproduce el checkpoint, ningún balance negativo, `holders.csv` suma `totalSupply` en el bloque del checkpoint, las particiones están estrictamente ordenadas y cada fila está en su mes UTC, nada queda por encima del checkpoint y `daily.csv` es exactamente lo que producen las transferencias. El resultado va a `data/<chain>/validation.json`.

Ajustes, todos opcionales: `--workers`, `--max-log-range`, `--ranges-per-batch`, `--empty-confirmations`, `--confirmations`, `--stage-blocks`, `--max-batch-attempts` (o las variables `SCAN_*` equivalentes). Los valores por defecto están por chain en `pipeline/config/chains.js`. `scan --fresh` descarta lo que el scan generó para esa chain y empieza de cero.

## Reprodúcelo

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
cp .env.example .env   # configura tus RPCs (el de Celo público ya viene puesto)
npm install

npm run audit:polygon  # solo Polygon (~10 min desde el deploy block con RPC de pago)
npm run audit:celo     # solo Celo (segundos desde el checkpoint versionado)
npm run audit:all      # ambas + charts combinados + cifras de los reportes
```

El primer `scan` recorre todo el historial desde el deploy block; las corridas siguientes solo escanean los bloques agregados desde el checkpoint. Requiere Node.js 22+; `npm test` corre los tests unitarios (sin red).

## Automatización diaria

Dos workflows de GitHub Actions mantienen los datos al día y verificados:

- **`.github/workflows/daily-scan.yml`** corre todos los días a las 09:17 UTC (04:17 en Colombia) y a demanda. Para cada chain ejecuta `scan`, `holders`, `aggregate` y `validate`, y luego hace commit de `data/`. El scan solo cubre los bloques agregados desde el checkpoint versionado, así que una corrida toma un par de minutos. Si el supply no reconcilia, un saldo difiere de `balanceOf` o falla cualquier regla de validación, el job falla y no hace commit de nada.
- **`.github/workflows/ci.yml`** corre en cada pull request y en los pushes a `main` hechos por personas: tests unitarios, la validación estricta de los datos versionados y el build del sitio. No necesita endpoint RPC. Los pushes hechos con el token del repositorio no disparan otros workflows, así que `ci.yml` no revisa los commits diarios de datos; el job diario los revisa por su cuenta antes de hacer commit, con los tests unitarios y la validación estricta.

Los charts y las cifras de estos documentos se regeneran el primer día de cada mes (o cuando el workflow se lanza a mano con `month_close`), así los reportes son un corte mensual coherente mientras los datos y el dashboard se mueven a diario.

Configuración, una sola vez:

```bash
gh secret set POLYGON_RPC_URL   # obligatorio: los endpoints públicos de Polygon no sirven el historial de logs de forma confiable
gh secret set CELO_RPC_URL      # opcional: sin él se usa el endpoint público
```

El workflow hace push a la rama por defecto con el token del repositorio, así que esa rama debe aceptar pushes de GitHub Actions. En un repositorio público los runners estándar son gratuitos. GitHub desactiva los workflows programados tras 60 días sin actividad en el repositorio; el commit diario cuenta como actividad.

## Estructura del repositorio

```
├── docs/
│   ├── AUDIT.es.md / AUDIT.md    # auditoría unificada (empieza aquí)
│   ├── audit/
│   │   ├── polygon.es.md / polygon.md  # auditoría por chain
│   │   └── celo.es.md / celo.md
│   ├── EVENTS.es.md / EVENTS.md        # qué eventos del contrato importan
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
│   ├── holders.csv / holders.json # snapshot de holders en el bloque del checkpoint
│   ├── daily.csv                 # serie diaria agregada
│   ├── summary.json              # totales, promedios, picos
│   ├── manifest.json             # metadatos estáticos del contrato
│   └── validation.json           # resultado de las reglas estrictas
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
