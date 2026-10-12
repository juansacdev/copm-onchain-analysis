# COPM en Celo — Auditoría y análisis on-chain

> Auditoría on-chain de COPM en Celo: el contrato [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) en Celo mainnet, cada evento `Transfer` desde el deploy hasta el checkpoint, verificado contra la chain en vivo.
>
> 🇬🇧 [English version](./celo.md) · 📖 [Glosario](../GLOSSARY.es.md) · 🔔 [Eventos del contrato](../EVENTS.es.md) · 🔗 [Auditoría unificada Polygon + Celo](../AUDIT.es.md)

Si la historia de COPM en [Polygon](./polygon.es.md) es la de un rail institucional, la de Celo es otra completamente distinta — y verlas juntas es donde está la gracia. Misma stablecoin, dos roles. Cada cifra de abajo se completa desde `data/celo/` con `npm run reports`; el checkpoint es el bloque <!-- copm:celo.checkpointBlock -->79.861.762<!-- /copm --> (<!-- copm:celo.checkpointDate -->2026-10-11<!-- /copm -->).

## Resumen ejecutivo

| Métrica | Valor |
| :--- | :--- |
| **Período auditado** | <!-- copm:celo.firstDay -->2024-09-17<!-- /copm --> → <!-- copm:celo.lastDay -->2026-10-10<!-- /copm --> (<!-- copm:celo.totalDays -->754<!-- /copm --> días, ~<!-- copm:celo.years -->2,1<!-- /copm --> años) |
| **Eventos `Transfer`** | **<!-- copm:celo.transfers -->132.944<!-- /copm -->** |
| **Volumen bruto movido** | <!-- copm:celo.grossVolumeCopm -->52.116 millones<!-- /copm --> COPM ≈ **<!-- copm:celo.grossVolumeUsd -->US$13 millones<!-- /copm -->** |
| **Volumen neto** (sin mints/burns) | <!-- copm:celo.netVolumeCopm -->41.971 millones<!-- /copm --> COPM ≈ **<!-- copm:celo.netVolumeUsd -->US$10,5 millones<!-- /copm -->** |
| **Total emitido (mints)** | <!-- copm:celo.minted -->5.282 millones<!-- /copm --> COPM ≈ <!-- copm:celo.mintedUsd -->US$1,3 millones<!-- /copm --> |
| **Total redimido (burns)** | <!-- copm:celo.burned -->4.863 millones<!-- /copm --> COPM ≈ <!-- copm:celo.burnedUsd -->US$1,2 millones<!-- /copm --> |
| **Ticket promedio por transfer** | **~<!-- copm:celo.avgTicketUsd -->US$98<!-- /copm -->** |
| **Promedio diario** | <!-- copm:celo.avgDailyTransfers -->176<!-- /copm --> transfers · <!-- copm:celo.avgDailyGrossUsd -->US$17,3 mil<!-- /copm --> |
| **Pico de transferencias en un día** | **<!-- copm:celo.peakTxCount -->1.919<!-- /copm -->** (<!-- copm:celo.peakTxDay -->2025-01-19<!-- /copm -->) |
| **Pico de volumen en un día** | **<!-- copm:celo.peakVolumeUsd -->US$737 mil<!-- /copm -->** (<!-- copm:celo.peakVolumeDay -->2025-07-23<!-- /copm -->) |
| **Mes pico (volumen)** | <!-- copm:celo.peakMonth -->julio 2025<!-- /copm -->: <!-- copm:celo.peakMonthUsd -->US$2,2 millones<!-- /copm --> |
| **Mes pico (transferencias)** | <!-- copm:celo.peakTxMonth -->enero 2025<!-- /copm -->: <!-- copm:celo.peakTxMonthCount -->18.491<!-- /copm --> |
| **Pico de supply** | <!-- copm:celo.peakSupplyCopm -->1.145 millones<!-- /copm --> COPM ≈ <!-- copm:celo.peakSupplyUsd -->US$286 mil<!-- /copm --> (<!-- copm:celo.peakSupplyDay -->2026-03-24<!-- /copm -->) |
| **Supply actual** | <!-- copm:celo.supply -->418.585.134,63<!-- /copm --> COPM ≈ <!-- copm:celo.supplyUsd -->US$105 mil<!-- /copm --> |
| **Holders con saldo** | <!-- copm:celo.holders -->998<!-- /copm --> (el mayor tiene <!-- copm:celo.top1Pct -->76,2 %<!-- /copm -->, los 10 mayores tienen <!-- copm:celo.top10Pct -->98,8 %<!-- /copm -->) |

> **Tasa de cambio:** 1 USD = <!-- copm:fx.copPerUsd -->4.000<!-- /copm --> COP, constante. Margen de ±5% según el día. Configurable al reproducir.

¿Algún término no te suena? Está en el [glosario](../GLOSSARY.es.md).

---

## La historia que cuenta la chain

### Mismo token, otra película: aquí el ticket promedio es de <!-- copm:celo.avgTicketUsd -->US$98<!-- /copm -->.

En Polygon, el transfer promedio de COPM mueve **~<!-- copm:polygon.avgTicketUsd -->US$8.952<!-- /copm -->**. En Celo mueve **~<!-- copm:celo.avgTicketUsd -->US$98<!-- /copm -->**. Unos dos órdenes de magnitud de diferencia.

La lectura: Polygon carga el settlement institucional — montos grandes, partners B2B. Celo carga pagos pequeños y frecuentes — el perfil de remesas, micropagos y billeteras de usuario final. Que ambas convivan bajo el mismo token es justamente el diseño multi-chain funcionando: cada red atiende el caso de uso donde es más fuerte.

![Transfers diarios](../../charts/celo/01-daily-transfers.svg)

### En Polygon el despegue tardó 16,5 meses. En Celo, 7 semanas. Ambos contados desde el despliegue.

Deploy: <!-- copm:celo.deployDate -->2024-09-11<!-- /copm -->. Primer día con transfers en Celo: <!-- copm:celo.firstDay -->2024-09-17<!-- /copm -->. Primer día con más de 100 transfers: **<!-- copm:celo.firstDayAbove100 -->2024-10-30<!-- /copm -->**. Son 7 semanas después del despliegue y unas 6 después de la primera transferencia.

La explicación es de manual: cuando COPM llegó a Celo, ya existía la operación, los partners y el caso de uso probados en Polygon. La segunda chain no arranca de cero — hereda la tracción de la primera. Y <!-- copm:celo.peakTxMonth -->enero 2025<!-- /copm --> fue su mes más activo de la historia: **<!-- copm:celo.peakTxMonthCount -->18.491<!-- /copm --> transferencias**.

### El volumen es chico; la actividad no.

<!-- copm:celo.grossVolumeUsd -->US$13 millones<!-- /copm --> brutos en <!-- copm:celo.years -->2,1<!-- /copm --> años suena pequeño al lado de los <!-- copm:polygon.grossVolumeUsd -->US$2.165 millones<!-- /copm --> de Polygon — y lo es. Pero el dato que sorprende es otro: **el promedio diario de transferencias es del mismo orden en las dos chains** (~<!-- copm:celo.avgDailyTransfers -->176<!-- /copm -->/día en Celo vs ~<!-- copm:polygon.avgDailyTransfers -->217<!-- /copm -->/día en Polygon). Celo procesa un flujo constante de operaciones pequeñas: hubo actividad en <!-- copm:celo.activeDays -->688<!-- /copm --> de los <!-- copm:celo.totalDays -->754<!-- /copm --> días auditados (<!-- copm:celo.activeDaysPct -->91 %<!-- /copm -->).

La actividad llega en oleadas, eso sí. Los últimos meses son tranquilos: <!-- copm:celo.month.2026-09.transfers -->448<!-- /copm --> transfers en septiembre de 2026 frente a <!-- copm:celo.month.2026-06.transfers -->9.135<!-- /copm --> en junio de 2026 y <!-- copm:celo.peakTxMonthCount -->18.491<!-- /copm --> en <!-- copm:celo.peakTxMonth -->enero 2025<!-- /copm -->.

![Volumen mensual USD](../../charts/celo/04-monthly-volume-usd.svg)

### <!-- copm:celo.peakMonth -->julio 2025<!-- /copm -->: el pico de volumen.

**<!-- copm:celo.peakMonthUsd -->US$2,2 millones<!-- /copm --> en un mes**, con el <!-- copm:celo.peakVolumeDay -->2025-07-23<!-- /copm --> moviendo **<!-- copm:celo.peakVolumeUsd -->US$737 mil<!-- /copm --> en un solo día** — el récord histórico de la chain. A diferencia de Polygon, donde el mes de mayor actividad y el de mayor volumen son <!-- copm:polygon.peakTxMonth -->noviembre 2025<!-- /copm --> y <!-- copm:polygon.peakMonth -->noviembre 2025<!-- /copm -->, en Celo los picos van por separado: el de transferencias fue en <!-- copm:celo.peakTxMonth -->enero 2025<!-- /copm -->, el de volumen en <!-- copm:celo.peakMonth -->julio 2025<!-- /copm -->. Otra señal de que los flujos aquí responden a dinámicas distintas.

### El supply cuadra exacto. Al wei.

Reproducir los <!-- copm:celo.transfers -->132.944<!-- /copm --> eventos da un supply derivado de **<!-- copm:celo.supply -->418.585.134,63<!-- /copm --> COPM**. El `totalSupply()` del contrato en el mismo bloque reporta **<!-- copm:celo.supply -->418.585.134,63<!-- /copm --> COPM**.

**Diferencia: cero, al wei.** Cada mint y cada burn de la historia del contrato en Celo está clasificado y cuadra contra el estado on-chain, y los <!-- copm:celo.holders -->998<!-- /copm --> saldos suman el mismo total. Es la reconciliación perfecta que en contabilidad llamarías "libros cuadrados" — derivada exclusivamente de eventos públicos. El supply tuvo su máximo en <!-- copm:celo.peakSupplyCopm -->1.145 millones<!-- /copm --> COPM el <!-- copm:celo.peakSupplyDay -->2026-03-24<!-- /copm -->.

![Supply circulante](../../charts/celo/03-supply-over-time.svg)

### Mints y burns: el peg también operó bidireccional aquí.

- Total emitido: **<!-- copm:celo.minted -->5.282 millones<!-- /copm --> COPM**
- Total redimido: **<!-- copm:celo.burned -->4.863 millones<!-- /copm --> COPM** (<!-- copm:celo.burnedPct -->92,1 %<!-- /copm --> de lo emitido)
- Diferencia: <!-- copm:celo.supplyCompact -->418,6 millones<!-- /copm --> COPM = exactamente el supply actual ✓

![Mints vs burns mensuales](../../charts/celo/06-monthly-mints-burns.svg)

### Acciones de cumplimiento: visibles y poco frecuentes.

El `FREEZER_ROLE` puede bloquear una dirección; el contrato emitió <!-- copm:celo.events.Frozen -->2<!-- /copm --> eventos `Frozen`, <!-- copm:celo.events.Thawed -->1<!-- /copm --> `Thawed` y <!-- copm:celo.events.BurnedFrozen -->1<!-- /copm --> `BurnedFrozen` en toda su historia. Cuentas congeladas en el checkpoint: <!-- copm:celo.frozenAccounts -->1<!-- /copm -->. Polygon tiene <!-- copm:polygon.events.Frozen -->0<!-- /copm --> eventos de este tipo. El evento `Paused` se emitió <!-- copm:polygon.events.Paused -->0<!-- /copm --> veces en Polygon y <!-- copm:celo.events.Paused -->0<!-- /copm --> en Celo. [Por qué importan estos eventos](../EVENTS.es.md).

---

## Top 10 días

### Por transferencias

| Día | Transfers | Volumen bruto |
| :--- | ---: | ---: |
| **<!-- copm:celo.topTx.1.day -->2025-01-19<!-- /copm -->** | **<!-- copm:celo.topTx.1.transfers -->1.919<!-- /copm -->** | <!-- copm:celo.topTx.1.usd -->US$19,9 mil<!-- /copm --> |
| <!-- copm:celo.topTx.2.day -->2026-08-28<!-- /copm --> | <!-- copm:celo.topTx.2.transfers -->1.572<!-- /copm --> | <!-- copm:celo.topTx.2.usd -->US$67 mil<!-- /copm --> |
| <!-- copm:celo.topTx.3.day -->2025-02-03<!-- /copm --> | <!-- copm:celo.topTx.3.transfers -->1.461<!-- /copm --> | <!-- copm:celo.topTx.3.usd -->US$18,2 mil<!-- /copm --> |
| <!-- copm:celo.topTx.4.day -->2025-01-20<!-- /copm --> | <!-- copm:celo.topTx.4.transfers -->1.408<!-- /copm --> | <!-- copm:celo.topTx.4.usd -->US$14,5 mil<!-- /copm --> |
| <!-- copm:celo.topTx.5.day -->2025-01-27<!-- /copm --> | <!-- copm:celo.topTx.5.transfers -->1.301<!-- /copm --> | <!-- copm:celo.topTx.5.usd -->US$32,1 mil<!-- /copm --> |
| <!-- copm:celo.topTx.6.day -->2025-02-02<!-- /copm --> | <!-- copm:celo.topTx.6.transfers -->1.249<!-- /copm --> | <!-- copm:celo.topTx.6.usd -->US$12,2 mil<!-- /copm --> |
| <!-- copm:celo.topTx.7.day -->2024-11-26<!-- /copm --> | <!-- copm:celo.topTx.7.transfers -->1.221<!-- /copm --> | <!-- copm:celo.topTx.7.usd -->US$35,3 mil<!-- /copm --> |
| <!-- copm:celo.topTx.8.day -->2025-02-04<!-- /copm --> | <!-- copm:celo.topTx.8.transfers -->1.218<!-- /copm --> | <!-- copm:celo.topTx.8.usd -->US$39,3 mil<!-- /copm --> |
| <!-- copm:celo.topTx.9.day -->2025-01-23<!-- /copm --> | <!-- copm:celo.topTx.9.transfers -->1.106<!-- /copm --> | <!-- copm:celo.topTx.9.usd -->US$7,8 mil<!-- /copm --> |
| <!-- copm:celo.topTx.10.day -->2026-06-23<!-- /copm --> | <!-- copm:celo.topTx.10.transfers -->1.070<!-- /copm --> | <!-- copm:celo.topTx.10.usd -->US$24,9 mil<!-- /copm --> |

### Por volumen

| Día | Volumen bruto | Transfers |
| :--- | ---: | ---: |
| **<!-- copm:celo.topVol.1.day -->2025-07-23<!-- /copm -->** | **<!-- copm:celo.topVol.1.usd -->US$737 mil<!-- /copm -->** | <!-- copm:celo.topVol.1.transfers -->192<!-- /copm --> |
| <!-- copm:celo.topVol.2.day -->2026-09-16<!-- /copm --> | <!-- copm:celo.topVol.2.usd -->US$300 mil<!-- /copm --> | <!-- copm:celo.topVol.2.transfers -->43<!-- /copm --> |
| <!-- copm:celo.topVol.3.day -->2025-07-17<!-- /copm --> | <!-- copm:celo.topVol.3.usd -->US$258 mil<!-- /copm --> | <!-- copm:celo.topVol.3.transfers -->20<!-- /copm --> |
| <!-- copm:celo.topVol.4.day -->2025-07-24<!-- /copm --> | <!-- copm:celo.topVol.4.usd -->US$235 mil<!-- /copm --> | <!-- copm:celo.topVol.4.transfers -->90<!-- /copm --> |
| <!-- copm:celo.topVol.5.day -->2024-10-03<!-- /copm --> | <!-- copm:celo.topVol.5.usd -->US$203 mil<!-- /copm --> | <!-- copm:celo.topVol.5.transfers -->8<!-- /copm --> |
| <!-- copm:celo.topVol.6.day -->2025-07-25<!-- /copm --> | <!-- copm:celo.topVol.6.usd -->US$194 mil<!-- /copm --> | <!-- copm:celo.topVol.6.transfers -->786<!-- /copm --> |
| <!-- copm:celo.topVol.7.day -->2025-12-19<!-- /copm --> | <!-- copm:celo.topVol.7.usd -->US$176 mil<!-- /copm --> | <!-- copm:celo.topVol.7.transfers -->174<!-- /copm --> |
| <!-- copm:celo.topVol.8.day -->2024-12-04<!-- /copm --> | <!-- copm:celo.topVol.8.usd -->US$156 mil<!-- /copm --> | <!-- copm:celo.topVol.8.transfers -->229<!-- /copm --> |
| <!-- copm:celo.topVol.9.day -->2025-07-03<!-- /copm --> | <!-- copm:celo.topVol.9.usd -->US$152 mil<!-- /copm --> | <!-- copm:celo.topVol.9.transfers -->37<!-- /copm --> |
| <!-- copm:celo.topVol.10.day -->2025-11-13<!-- /copm --> | <!-- copm:celo.topVol.10.usd -->US$149 mil<!-- /copm --> | <!-- copm:celo.topVol.10.transfers -->26<!-- /copm --> |

![Top 10 días por volumen](../../charts/celo/05-top10-volume-days.svg)

---

## Validación

Las mismas <!-- copm:celo.checksTotal -->19<!-- /copm --> reglas estrictas que en Polygon, offline y sin tolerancia, <!-- copm:celo.checksPassed -->19<!-- /copm --> pasaron (validado el <!-- copm:celo.validatedDate -->2026-10-12<!-- /copm -->):

| # | Regla | Resultado |
| :--- | :--- | :--- |
| 1 | Conteo de eventos: las transferencias guardadas igualan el checkpoint | ✅ <!-- copm:celo.transfers -->132.944<!-- /copm --> = <!-- copm:celo.transfers -->132.944<!-- /copm --> |
| 2 | Supply: minted − burned es igual a `totalSupply()` en el bloque del checkpoint | ✅ diferencia de 0 wei |
| 3 | Recorrer las transferencias guardadas reproduce el libro del checkpoint | ✅ |
| 4 | Ningún balance negativo en el libro | ✅ |
| 5 | `holders.csv` suma `totalSupply()`; cada balance es igual a `balanceOf` | ✅ <!-- copm:celo.holders -->998<!-- /copm --> holders, <!-- copm:celo.addressesEverSeen -->3.123<!-- /copm --> direcciones |
| 6 | Particiones estrictamente ordenadas, sin duplicados (tx hash, log index) | ✅ |
| 7 | Cada fila está en la partición de su mes UTC | ✅ |
| 8 | Nada por encima del bloque del checkpoint | ✅ |
| 9 | Nada antes del bloque de deploy | ✅ bloque <!-- copm:celo.deployBlock -->27.680.993<!-- /copm --> |
| 10 | Cada transferencia tiene el timestamp exacto de su bloque | ✅ <!-- copm:celo.transfers -->132.944<!-- /copm --> eventos, 0 faltantes |
| 11 | Timestamps dentro de la ventana deploy → checkpoint | ✅ |
| 12 | Eventos administrativos estrictamente ordenados, ninguno por encima del checkpoint | ✅ |
| 13 | El conteo de eventos administrativos iguala el checkpoint | ✅ <!-- copm:celo.adminEvents -->12<!-- /copm --> eventos |
| 14 | `daily.csv` es igual a la serie reconstruida desde el libro y termina en `totalSupply()` | ✅ |
| 15 | La serie diaria tiene el largo que anuncia `summary.json` | ✅ <!-- copm:celo.totalDays -->754<!-- /copm --> días |
| 16 | La serie diaria es continua (sin días faltantes) | ✅ 0 gaps |
| 17 | El total de transferencias de `daily.csv` es igual al de `summary.json` | ✅ |

Igual que en Polygon, la comparación con la chain en vivo ocurre cuando se escriben los datos: `holders` contrasta cada balance con `balanceOf` en el bloque del checkpoint, y `scan` reconcilia contra `totalSupply()` antes de mover el checkpoint. Resultado completo en [`data/celo/validation.json`](../../data/celo/validation.json).

---

## Metodología

Idéntica a la de [Polygon](./polygon.es.md#metodología) — mismo pipeline, mismos scripts, solo cambia `CHAIN=celo`. Detalle relevante de esta chain: Celo produce bloques mucho más rápido que Polygon, especialmente después de su migración a L2, así que el rango de bloques desde el deploy (bloque <!-- copm:celo.deployBlock -->27.680.993<!-- /copm -->) hasta el checkpoint es amplio, y el endpoint público es el factor limitante (ver abajo).

## Limitaciones

1. **Solo Celo.** Polygon se audita en [su propia auditoría](./polygon.es.md); la vista consolidada está en la [auditoría unificada](../AUDIT.es.md).
2. **Tasa fija <!-- copm:fx.copPerUsd -->4.000<!-- /copm --> COP/USD.** Margen de ±5%.
3. **Direcciones internas no filtradas.** Igual que en Polygon.
4. **Procedencia del historial.** El endpoint público de Celo (`forno.celo.org`) responde `eth_getLogs` con arreglos vacíos y sin error para una parte grande de los rangos con eventos, así que el 2026-10-11 un scan del historial completo no pudo terminar ahí. El historial hasta el bloque 79.856.063 se armó con la unión de siete scans más el dataset anterior y se certificó con las mismas verificaciones: oferta igual a `totalSupply()` al wei y cada balance igual a `balanceOf`. Las transferencias quedan cubiertas por esa prueba. Los contadores de approvals (<!-- copm:celo.approvals -->82.623<!-- /copm -->) son una cota inferior. Un scan desde el deploy block contra un endpoint de archivo (`scan --fresh --chain celo`) reconstruye el historial desde cero.
5. **Las transferencias no son pagos.** Un solo pago puede emitir varias transferencias, así que el ticket promedio es un valor por transfer, no por pago.

## Reproduce esta auditoría

```bash
cp .env.example .env   # el RPC público de Celo ya viene configurado
npm install
npm run audit:celo     # scan → holders → aggregate → charts → validate
npm run reports        # actualiza las cifras de los reportes en Markdown
```

Desde el checkpoint versionado, una corrida toma segundos: solo se escanean los bloques agregados desde entonces.
