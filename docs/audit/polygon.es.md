# COPM en Polygon — Auditoría y análisis on-chain

> Auditoría completa del contrato [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) en Polygon mainnet: cada evento `Transfer` desde el bloque de deploy hasta el checkpoint, verificado contra la chain en vivo.
>
> 🇬🇧 [English version](./polygon.md) · 📖 [Glosario](../GLOSSARY.es.md) · 🔔 [Eventos del contrato](../EVENTS.es.md) · 🔗 [Auditoría unificada Polygon + Celo](../AUDIT.es.md)

Los datos de este documento no salen de un dashboard ni de un tercero. Salen de la blockchain, evento por evento, con scripts que están en este mismo repositorio. Cualquiera puede reproducir cada número. Cada cifra de abajo se completa desde `data/polygon/` con `npm run reports`; el checkpoint es el bloque <!-- copm:polygon.checkpointBlock -->95.370.448<!-- /copm --> (<!-- copm:polygon.checkpointDate -->2026-10-11<!-- /copm -->).

## Resumen ejecutivo

| Métrica | Valor |
| :--- | :--- |
| **Período auditado** | <!-- copm:polygon.firstDay -->2023-09-21<!-- /copm --> → <!-- copm:polygon.lastDay -->2026-10-11<!-- /copm --> (<!-- copm:polygon.totalDays -->1.117<!-- /copm --> días, ~<!-- copm:polygon.years -->3,1<!-- /copm --> años) |
| **Eventos `Transfer`** | **<!-- copm:polygon.transfers -->241.858<!-- /copm -->** |
| **Volumen bruto movido** | <!-- copm:polygon.grossVolumeCopm -->8,661 billones<!-- /copm --> COPM ≈ **<!-- copm:polygon.grossVolumeUsd -->US$2.165 millones<!-- /copm -->** |
| **Volumen neto** (sin mints/burns) | <!-- copm:polygon.netVolumeCopm -->6,164 billones<!-- /copm --> COPM ≈ **<!-- copm:polygon.netVolumeUsd -->US$1.541 millones<!-- /copm -->** |
| **Total emitido (mints)** | <!-- copm:polygon.minted -->1,251 billones<!-- /copm --> COPM ≈ <!-- copm:polygon.mintedUsd -->US$312,7 millones<!-- /copm --> |
| **Total redimido (burns)** | <!-- copm:polygon.burned -->1,246 billones<!-- /copm --> COPM ≈ <!-- copm:polygon.burnedUsd -->US$311,5 millones<!-- /copm --> |
| **Promedio diario** | <!-- copm:polygon.avgDailyTransfers -->217<!-- /copm --> transfers · <!-- copm:polygon.avgDailyGrossUsd -->US$1,9 millones<!-- /copm --> |
| **Ticket promedio por transfer** | ~<!-- copm:polygon.avgTicketUsd -->US$8.952<!-- /copm --> |
| **Pico de transferencias en un día** | **<!-- copm:polygon.peakTxCount -->2.597<!-- /copm -->** (<!-- copm:polygon.peakTxDay -->2025-11-24<!-- /copm -->) |
| **Pico de volumen en un día** | **<!-- copm:polygon.peakVolumeUsd -->US$38,6 millones<!-- /copm -->** (<!-- copm:polygon.peakVolumeDay -->2025-11-24<!-- /copm -->) |
| **Mes pico** | **<!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm -->: <!-- copm:polygon.peakMonthUsd -->US$318,4 millones<!-- /copm -->** |
| **Pico de supply** | <!-- copm:polygon.peakSupplyCopm -->11.363 millones<!-- /copm --> COPM ≈ <!-- copm:polygon.peakSupplyUsd -->US$2,8 millones<!-- /copm --> (<!-- copm:polygon.peakSupplyDay -->2026-05-07<!-- /copm -->) |
| **Supply actual** | <!-- copm:polygon.supply -->4.482.231.674,75<!-- /copm --> COPM ≈ <!-- copm:polygon.supplyUsd -->US$1,1 millones<!-- /copm --> |
| **Holders con saldo** | <!-- copm:polygon.holders -->582<!-- /copm --> (el mayor tiene <!-- copm:polygon.top1Pct -->65,6 %<!-- /copm -->, los 10 mayores tienen <!-- copm:polygon.top10Pct -->95,5 %<!-- /copm -->) |

> **Tasa de cambio:** 1 USD = <!-- copm:fx.copPerUsd -->4.000<!-- /copm --> COP, constante. La tasa real se movió durante el período, así que las cifras en USD cargan un margen de ±5%. Configurable al reproducir.

¿Algún término no te suena? Está en el [glosario](../GLOSSARY.es.md).

---

## La historia que cuenta la chain

### Más de <!-- copm:polygon.grossVolumeUsd -->US$2.165 millones<!-- /copm --> movidos. Ninguna pausa, nunca.

<!-- copm:polygon.grossVolumeCopm -->8,661 billones<!-- /copm --> de COPM cambiaron de manos en <!-- copm:polygon.totalDays -->1.117<!-- /copm --> días: **~<!-- copm:polygon.grossVolumeUsd -->US$2.165 millones<!-- /copm -->** brutos, **<!-- copm:polygon.netVolumeUsd -->US$1.541 millones<!-- /copm -->** netos entre wallets. El `PAUSER_ROLE` puede detener todas las transferencias; su evento `Paused` se emitió <!-- copm:polygon.events.Paused -->0<!-- /copm --> veces. Hubo actividad en <!-- copm:polygon.activeDays -->910<!-- /copm --> de los <!-- copm:polygon.totalDays -->1.117<!-- /copm --> días auditados (<!-- copm:polygon.activeDaysPct -->81 %<!-- /copm -->).

![Volumen bruto diario USD](../../charts/polygon/02-daily-volume-usd.svg)

### El token existió 16,5 meses (contados desde el despliegue) antes de cruzar 100 transferencias por día.

Deploy: <!-- copm:polygon.deployDate -->2023-09-19<!-- /copm -->. Primer día con más de 100 transfers: **<!-- copm:polygon.firstDayAbove100 -->2025-02-03<!-- /copm -->**.

Ese gap cuenta cómo escala un settlement layer B2B: no por adquisición de usuarios retail, sino por integraciones grandes. Cada partner nuevo es un escalón, no una pendiente. Los primeros meses fueron pruebas; el despegue real llegó cuando las integraciones entraron en producción — y de ahí en adelante la curva es otra.

![Transfers diarios](../../charts/polygon/01-daily-transfers.svg)

### <!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm -->: el mes que lo cambió todo.

**<!-- copm:polygon.peakMonthUsd -->US$318,4 millones<!-- /copm --> en un solo mes. <!-- copm:polygon.peakMonthTransfers -->30.983<!-- /copm --> transferencias.** El día récord de actividad es el <!-- copm:polygon.peakTxDay -->2025-11-24<!-- /copm -->: **<!-- copm:polygon.topTx.1.usd -->US$38,6 millones<!-- /copm -->** en **<!-- copm:polygon.peakTxCount -->2.597<!-- /copm --> transferencias**. El día récord de volumen es el <!-- copm:polygon.peakVolumeDay -->2025-11-24<!-- /copm -->, con **<!-- copm:polygon.peakVolumeUsd -->US$38,6 millones<!-- /copm -->**.

Casi todos los 10 días con más transferencias de toda la historia del token cayeron entre octubre y noviembre de 2025 (ver la tabla más abajo). Eso no es ruido: es la firma de una integración mayor o un caso de uso nuevo entrando en producción.

![Volumen mensual USD](../../charts/polygon/04-monthly-volume-usd.svg)

### Después del pico, la actividad retrocedió, rebotó una vez en mayo de 2026 y viene reduciéndose desde entonces.

Volumen bruto mensual, desde el pico:

| Mes | Volumen bruto | Transfers |
| :--- | ---: | ---: |
| <!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm --> (pico) | <!-- copm:polygon.month.2025-11.usd -->US$318,4 millones<!-- /copm --> | <!-- copm:polygon.month.2025-11.transfers -->30.983<!-- /copm --> |
| Diciembre 2025 | <!-- copm:polygon.month.2025-12.usd -->US$88,3 millones<!-- /copm --> | <!-- copm:polygon.month.2025-12.transfers -->15.140<!-- /copm --> |
| Enero 2026 | <!-- copm:polygon.month.2026-01.usd -->US$82,1 millones<!-- /copm --> | <!-- copm:polygon.month.2026-01.transfers -->6.950<!-- /copm --> |
| Febrero 2026 | <!-- copm:polygon.month.2026-02.usd -->US$67,7 millones<!-- /copm --> | <!-- copm:polygon.month.2026-02.transfers -->4.884<!-- /copm --> |
| Marzo 2026 | <!-- copm:polygon.month.2026-03.usd -->US$61,7 millones<!-- /copm --> | <!-- copm:polygon.month.2026-03.transfers -->5.616<!-- /copm --> |
| Abril 2026 | <!-- copm:polygon.month.2026-04.usd -->US$96,9 millones<!-- /copm --> | <!-- copm:polygon.month.2026-04.transfers -->5.309<!-- /copm --> |
| Mayo 2026 (rebote) | <!-- copm:polygon.month.2026-05.usd -->US$189,9 millones<!-- /copm --> | <!-- copm:polygon.month.2026-05.transfers -->18.813<!-- /copm --> |
| Junio 2026 | <!-- copm:polygon.month.2026-06.usd -->US$48,3 millones<!-- /copm --> | <!-- copm:polygon.month.2026-06.transfers -->13.985<!-- /copm --> |
| Julio 2026 | <!-- copm:polygon.month.2026-07.usd -->US$34,3 millones<!-- /copm --> | <!-- copm:polygon.month.2026-07.transfers -->12.717<!-- /copm --> |
| Agosto 2026 | <!-- copm:polygon.month.2026-08.usd -->US$26,1 millones<!-- /copm --> | <!-- copm:polygon.month.2026-08.transfers -->9.913<!-- /copm --> |
| Septiembre 2026 | <!-- copm:polygon.month.2026-09.usd -->US$22,3 millones<!-- /copm --> | <!-- copm:polygon.month.2026-09.transfers -->9.118<!-- /copm --> |
| Octubre 2026 (hasta <!-- copm:polygon.lastDay -->2026-10-11<!-- /copm -->) | <!-- copm:polygon.month.2026-10.usd -->US$6 millones<!-- /copm --> | <!-- copm:polygon.month.2026-10.transfers -->3.023<!-- /copm --> |

El volumen se asentó entre diciembre y abril, saltó en mayo de 2026 y ha bajado cada mes desde entonces. El segundo día de mayor volumen de la historia del token, **<!-- copm:polygon.topVol.2.day -->2026-05-05<!-- /copm -->** (<!-- copm:polygon.topVol.2.usd -->US$31,5 millones<!-- /copm -->), pertenece a ese rebote. El supply acompañó: tuvo su máximo en <!-- copm:polygon.peakSupplyCopm -->11.363 millones<!-- /copm --> COPM el <!-- copm:polygon.peakSupplyDay -->2026-05-07<!-- /copm --> y está en <!-- copm:polygon.supplyCompact -->4.482 millones<!-- /copm --> COPM en el checkpoint.

| Ventana | Volumen bruto |
| :--- | :--- |
| <!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm --> (mes pico) | <!-- copm:polygon.peakMonthUsd -->US$318,4 millones<!-- /copm --> |
| Últimos 90 días | <!-- copm:polygon.last90GrossUsd -->US$76,1 millones<!-- /copm --> |
| Últimos 30 días | <!-- copm:polygon.last30GrossUsd -->US$21,2 millones<!-- /copm --> |

### El supply rota ~<!-- copm:polygon.turnoverMonthly -->13,7<!-- /copm --> veces al mes. Eso es un rail de pagos, no una bóveda.

- Supply promedio (últimos 30 días): ~<!-- copm:polygon.last30AvgSupply -->6.209 millones<!-- /copm --> COPM
- Volumen bruto (últimos 30 días): ~<!-- copm:polygon.last30GrossUsd -->US$21,2 millones<!-- /copm --> ≈ <!-- copm:polygon.last30GrossCopm -->84.925 millones<!-- /copm --> COPM
- **Rotación implícita: ~<!-- copm:polygon.turnoverMonthly -->13,7<!-- /copm -->x al mes, ~<!-- copm:polygon.turnoverYearly -->166<!-- /copm -->x al año**

Para comparar: USDT y USDC rotan en el orden de 10–20x **al año**. COPM rota su supply aproximadamente un orden de magnitud más rápido que ese rango. La lectura es directa: nadie acumula COPM por mucho tiempo — el COPM promedio cambia de manos ~<!-- copm:polygon.turnoverYearly -->166<!-- /copm --> veces al año. Es el comportamiento de un *settlement rail*, no de una reserva de valor.

![Supply circulante](../../charts/polygon/03-supply-over-time.svg)

### Mints y burns casi en espejo: el peg operó en ambas direcciones.

- Total emitido en <!-- copm:polygon.years -->3,1<!-- /copm --> años: **<!-- copm:polygon.minted -->1,251 billones<!-- /copm --> COPM**
- Total redimido: **<!-- copm:polygon.burned -->1,246 billones<!-- /copm --> COPM** (<!-- copm:polygon.burnedPct -->99,6 %<!-- /copm --> de lo emitido)
- Diferencia: <!-- copm:polygon.supplyCompact -->4.482 millones<!-- /copm --> COPM = exactamente el supply actual, al wei ✓

¿Por qué importa? Porque un burn es alguien convirtiendo COPM de vuelta a pesos. Si los burns fueran mucho menores que los mints, sería una bandera roja: tokens que se emiten pero no se pueden redimir. El balance casi 1:1 sostenido durante años es la evidencia on-chain de un peg con operación bidireccional fluida.

![Mints vs burns mensuales](../../charts/polygon/06-monthly-mints-burns.svg)

### Quién lo tiene: un puñado de direcciones.

En el checkpoint, <!-- copm:polygon.holders -->582<!-- /copm --> direcciones tienen saldo (de <!-- copm:polygon.addressesEverSeen -->2.555<!-- /copm --> que alguna vez tocaron el token). La mayor tiene el <!-- copm:polygon.top1Pct -->65,6 %<!-- /copm --> del supply y las 10 mayores tienen el <!-- copm:polygon.top10Pct -->95,5 %<!-- /copm -->. <!-- copm:polygon.contracts -->244<!-- /copm --> de los holders son contratos, no wallets. La tabla completa está en `data/polygon/holders.csv`.

### Gobernanza: quién tiene los roles.

Los seis roles (`DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, `FREEZER_ROLE`, `RESCUER_ROLE`) pueden otorgarse a cualquier dirección. Direcciones distintas que hoy tienen al menos uno: <!-- copm:polygon.roleHolders -->1<!-- /copm -->. El proxy emitió <!-- copm:polygon.events.Upgraded -->2<!-- /copm --> eventos `Upgraded` (el primero fija la implementación inicial en el deploy). Mira [qué eventos importan](../EVENTS.es.md) para seguir estos cambios.

---

## Top 10 días

### Por transferencias

| Día | Transfers | Volumen bruto |
| :--- | ---: | ---: |
| **<!-- copm:polygon.topTx.1.day -->2025-11-24<!-- /copm -->** | **<!-- copm:polygon.topTx.1.transfers -->2.597<!-- /copm -->** | <!-- copm:polygon.topTx.1.usd -->US$38,6 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.2.day -->2025-11-25<!-- /copm --> | <!-- copm:polygon.topTx.2.transfers -->2.404<!-- /copm --> | <!-- copm:polygon.topTx.2.usd -->US$21,8 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.3.day -->2025-11-20<!-- /copm --> | <!-- copm:polygon.topTx.3.transfers -->2.323<!-- /copm --> | <!-- copm:polygon.topTx.3.usd -->US$21,5 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.4.day -->2025-10-08<!-- /copm --> | <!-- copm:polygon.topTx.4.transfers -->1.972<!-- /copm --> | <!-- copm:polygon.topTx.4.usd -->US$22,1 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.5.day -->2025-11-21<!-- /copm --> | <!-- copm:polygon.topTx.5.transfers -->1.959<!-- /copm --> | <!-- copm:polygon.topTx.5.usd -->US$25,5 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.6.day -->2025-10-22<!-- /copm --> | <!-- copm:polygon.topTx.6.transfers -->1.944<!-- /copm --> | <!-- copm:polygon.topTx.6.usd -->US$12,8 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.7.day -->2025-10-14<!-- /copm --> | <!-- copm:polygon.topTx.7.transfers -->1.889<!-- /copm --> | <!-- copm:polygon.topTx.7.usd -->US$17,3 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.8.day -->2025-11-18<!-- /copm --> | <!-- copm:polygon.topTx.8.transfers -->1.885<!-- /copm --> | <!-- copm:polygon.topTx.8.usd -->US$14,6 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.9.day -->2025-11-11<!-- /copm --> | <!-- copm:polygon.topTx.9.transfers -->1.871<!-- /copm --> | <!-- copm:polygon.topTx.9.usd -->US$21,3 millones<!-- /copm --> |
| <!-- copm:polygon.topTx.10.day -->2025-12-09<!-- /copm --> | <!-- copm:polygon.topTx.10.transfers -->1.864<!-- /copm --> | <!-- copm:polygon.topTx.10.usd -->US$11 millones<!-- /copm --> |

### Por volumen

| Día | Volumen bruto | Transfers |
| :--- | ---: | ---: |
| **<!-- copm:polygon.topVol.1.day -->2025-11-24<!-- /copm -->** | **<!-- copm:polygon.topVol.1.usd -->US$38,6 millones<!-- /copm -->** | <!-- copm:polygon.topVol.1.transfers -->2.597<!-- /copm --> |
| <!-- copm:polygon.topVol.2.day -->2026-05-05<!-- /copm --> | <!-- copm:polygon.topVol.2.usd -->US$31,5 millones<!-- /copm --> | <!-- copm:polygon.topVol.2.transfers -->1.620<!-- /copm --> |
| <!-- copm:polygon.topVol.3.day -->2025-08-19<!-- /copm --> | <!-- copm:polygon.topVol.3.usd -->US$27,8 millones<!-- /copm --> | <!-- copm:polygon.topVol.3.transfers -->1.155<!-- /copm --> |
| <!-- copm:polygon.topVol.4.day -->2025-09-19<!-- /copm --> | <!-- copm:polygon.topVol.4.usd -->US$27,7 millones<!-- /copm --> | <!-- copm:polygon.topVol.4.transfers -->1.202<!-- /copm --> |
| <!-- copm:polygon.topVol.5.day -->2025-11-21<!-- /copm --> | <!-- copm:polygon.topVol.5.usd -->US$25,5 millones<!-- /copm --> | <!-- copm:polygon.topVol.5.transfers -->1.959<!-- /copm --> |
| <!-- copm:polygon.topVol.6.day -->2025-09-18<!-- /copm --> | <!-- copm:polygon.topVol.6.usd -->US$24,7 millones<!-- /copm --> | <!-- copm:polygon.topVol.6.transfers -->1.422<!-- /copm --> |
| <!-- copm:polygon.topVol.7.day -->2025-08-27<!-- /copm --> | <!-- copm:polygon.topVol.7.usd -->US$23 millones<!-- /copm --> | <!-- copm:polygon.topVol.7.transfers -->1.629<!-- /copm --> |
| <!-- copm:polygon.topVol.8.day -->2025-08-12<!-- /copm --> | <!-- copm:polygon.topVol.8.usd -->US$22,5 millones<!-- /copm --> | <!-- copm:polygon.topVol.8.transfers -->702<!-- /copm --> |
| <!-- copm:polygon.topVol.9.day -->2025-10-08<!-- /copm --> | <!-- copm:polygon.topVol.9.usd -->US$22,1 millones<!-- /copm --> | <!-- copm:polygon.topVol.9.transfers -->1.972<!-- /copm --> |
| <!-- copm:polygon.topVol.10.day -->2025-08-15<!-- /copm --> | <!-- copm:polygon.topVol.10.usd -->US$21,9 millones<!-- /copm --> | <!-- copm:polygon.topVol.10.transfers -->796<!-- /copm --> |

![Top 10 días por volumen](../../charts/polygon/05-top10-volume-days.svg)

---

## Validación

Ningún número de esta auditoría se reporta sin verificarse. El paso de validación ([`pipeline/steps/validate.js`](../../pipeline/steps/validate.js)) es estricto y offline, corre <!-- copm:polygon.checksTotal -->17<!-- /copm --> reglas sin tolerancia, y <!-- copm:polygon.checksPassed -->17<!-- /copm --> pasaron (validado el <!-- copm:polygon.validatedDate -->2026-10-12<!-- /copm -->):

| # | Regla | Resultado |
| :--- | :--- | :--- |
| 1 | Conteo de eventos: las transferencias guardadas igualan el checkpoint | ✅ <!-- copm:polygon.transfers -->241.858<!-- /copm --> = <!-- copm:polygon.transfers -->241.858<!-- /copm --> |
| 2 | Supply: minted − burned es igual a `totalSupply()` en el bloque del checkpoint | ✅ diferencia de 0 wei |
| 3 | Recorrer las transferencias guardadas reproduce el libro del checkpoint | ✅ |
| 4 | Ningún balance negativo en el libro | ✅ |
| 5 | `holders.csv` suma `totalSupply()`; cada balance es igual a `balanceOf` | ✅ <!-- copm:polygon.holders -->582<!-- /copm --> holders, <!-- copm:polygon.addressesEverSeen -->2.555<!-- /copm --> direcciones |
| 6 | Particiones estrictamente ordenadas, sin duplicados (tx hash, log index) | ✅ |
| 7 | Cada fila está en la partición de su mes UTC | ✅ |
| 8 | Nada por encima del bloque del checkpoint | ✅ |
| 9 | Nada antes del bloque de deploy | ✅ bloque <!-- copm:polygon.deployBlock -->47.747.145<!-- /copm --> |
| 10 | Cada transferencia tiene el timestamp exacto de su bloque | ✅ <!-- copm:polygon.transfers -->241.858<!-- /copm --> eventos, 0 faltantes |
| 11 | Timestamps dentro de la ventana deploy → checkpoint | ✅ |
| 12 | Eventos administrativos estrictamente ordenados, ninguno por encima del checkpoint | ✅ |
| 13 | El conteo de eventos administrativos iguala el checkpoint | ✅ <!-- copm:polygon.adminEvents -->11<!-- /copm --> eventos |
| 14 | `daily.csv` es igual a la serie reconstruida desde el libro y termina en `totalSupply()` | ✅ |
| 15 | La serie diaria tiene el largo que anuncia `summary.json` | ✅ <!-- copm:polygon.totalDays -->1.117<!-- /copm --> días |
| 16 | La serie diaria es continua (sin días faltantes) | ✅ 0 gaps |
| 17 | El total de transferencias de `daily.csv` es igual al de `summary.json` | ✅ |

La comparación con la chain en vivo ocurre cuando se escriben los datos: `scan` reconcilia minted − burned contra `totalSupply()` al final de cada etapa antes de mover el checkpoint, y `holders` contrasta el balance de cada dirección con `balanceOf` en el bloque del checkpoint. Resultado completo en [`data/polygon/validation.json`](../../data/polygon/validation.json).

---

## Metodología

El pipeline son unos pocos pasos, cada uno un comando de `node pipeline/cli.js`, sin dependencias más allá de [viem](https://viem.sh):

1. **Discover** — encuentra el bloque de deploy (bloque <!-- copm:polygon.deployBlock -->47.747.145<!-- /copm -->) por búsqueda binaria sobre `eth_getCode` y lee los metadatos del token.
2. **Scan** — descarga todos los eventos del contrato con `eth_getLogs` por etapas, con un canario y una verificación del head en cada lote, confirmación de los rangos vacíos y una reconciliación exacta contra `totalSupply()` antes de avanzar el checkpoint. Las transferencias se guardan por mes con el timestamp exacto de su bloque; los approvals se cuentan por día y por spender.
3. **Holders** — calcula cada balance desde el libro y contrasta cada uno con `balanceOf` en el bloque del checkpoint.
4. **Aggregate** — reproduce los eventos en orden y construye la serie diaria: volumen, mints, burns, supply derivado.
5. **Charts** — renderiza los SVG sin canvas ni headless browser.
6. **Validate** — las <!-- copm:polygon.checksTotal -->17<!-- /copm --> reglas estrictas de arriba.
7. **Reports** — completa cada cifra de estos documentos desde los datos.

**Fuente única: un endpoint RPC.** Sin indexers, sin APIs de terceros, sin exploradores. Sirve cualquier proveedor — uno de pago (más rápido) o uno público (gratis, con rate limits que el scanner maneja solo).

## Limitaciones

1. **Solo Polygon.** La actividad en Celo se audita por separado en [su propia auditoría](./celo.es.md), y ambas se consolidan en la [auditoría unificada](../AUDIT.es.md).
2. **Tasa fija <!-- copm:fx.copPerUsd -->4.000<!-- /copm --> COP/USD.** Margen de ±5% en cifras USD según el día.
3. **Direcciones internas no filtradas.** El volumen "neto" excluye mints y burns, pero no distingue movimientos entre wallets corporativas del emisor.
4. **Las direcciones no son entidades.** <!-- copm:polygon.contracts -->244<!-- /copm --> de los <!-- copm:polygon.holders -->582<!-- /copm --> holders son contratos, y una misma entidad puede controlar varias wallets, así que las cifras de concentración describen direcciones, no dueños.
5. **Las transferencias no son pagos.** Un solo pago puede emitir varias transferencias (por ejemplo a través de un router), así que el volumen bruto y el conteo de transfers miden movimiento on-chain, no la cantidad de pagos.
6. **Un dataset anterior estaba mal.** Las versiones de este repositorio previas al scan verificado omitían parte del historial de Polygon y mostraban una diferencia contra `totalSupply()`. Ahora el scan reconcilia al wei en cada etapa y la validación no tolera ninguna diferencia.

## Reproduce esta auditoría

```bash
cp .env.example .env   # configura tu RPC de Polygon
npm install
npm run audit:polygon  # scan → holders → aggregate → charts → validate
npm run reports        # actualiza las cifras de los reportes en Markdown
```

En una máquina normal con un RPC de pago, un primer scan desde el deploy block toma del orden de diez minutos; las corridas siguientes solo escanean los bloques agregados desde el checkpoint. Con un RPC público: más lento, pero llega. Cada paso es re-ejecutable de forma independiente (`CHAIN=polygon npm run scan`, etc.).
