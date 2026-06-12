# COPM en Polygon — Auditoría y análisis on-chain

> Auditoría completa del contrato [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) en Polygon mainnet: cada evento `Transfer` desde el bloque de deploy hasta el más reciente, validado contra la chain en vivo.
>
> 🇬🇧 [English version](./polygon.md) · 📖 [Glosario](../GLOSSARY.es.md) · 🔗 [Auditoría unificada Polygon + Celo](../AUDIT.es.md)

Los datos de este documento no salen de un dashboard ni de un tercero. Salen de la blockchain, evento por evento, con scripts que están en este mismo repositorio. Cualquiera puede reproducir cada número.

## Resumen ejecutivo

| Métrica | Valor |
| :--- | :--- |
| **Período auditado** | 2023-09-21 → 2026-06-12 (996 días, ~2.7 años) |
| **Eventos `Transfer`** | **196,796** |
| **Volumen bruto movido** | 8.14T COPM ≈ **$2,034M USD (~$2.03B)** |
| **Volumen neto** (sin mints/burns) | 5.79T COPM ≈ **$1,447M USD** |
| **Total emitido (mints)** | 1.178T COPM ≈ $294M USD |
| **Total redimido (burns)** | 1.170T COPM ≈ $293M USD |
| **Promedio diario** | 198 transfers · $2.04M USD |
| **Pico de transacciones en un día** | **2,597** (2025-11-24) |
| **Pico de volumen en un día** | **$38.6M USD** (2025-11-24) |
| **Mes pico** | **Noviembre 2025: $318.4M USD** |
| **Pico de supply** | 12.67B COPM ≈ $3.17M USD (2026-05-07) |

> **Tasa de cambio:** 1 USD = 4,000 COP, constante. La tasa real fluctuó entre ~3,900 y ~4,400 en el período, así que las cifras en USD cargan un margen de ±5%. Configurable al reproducir.

¿Algún término no te suena? Está en el [glosario](../GLOSSARY.es.md).

---

## La historia que cuenta la chain

### Más de $2 mil millones movidos. Sin un solo incidente visible on-chain.

8.14 billones (10¹²) de COPM cambiaron de manos en 996 días: **~$2.03B USD** brutos, **$1.45B** netos entre wallets. La serie no muestra pausas anómalas, ni reversiones masivas, ni días en cero después del arranque operativo.

![Volumen bruto diario USD](../charts/polygon/02-daily-volume-usd.svg)

### El token existió 17 meses antes de cruzar 100 transacciones por día.

Deploy: septiembre 2023. Primer día con más de 100 transfers: **2025-02-03**.

Ese gap cuenta cómo escala un settlement layer B2B: no por adquisición de usuarios retail, sino por integraciones grandes. Cada partner nuevo es un escalón, no una pendiente. Los primeros meses fueron pruebas; el despegue real llegó cuando las integraciones entraron en producción — y de ahí en adelante la curva es otra.

![Transfers diarios](../charts/polygon/01-daily-transfers.svg)

### Noviembre 2025: el mes que lo cambió todo.

**$318.4M USD en un solo mes. 30,983 transacciones.** Y dentro de ese mes, un día récord absoluto: el 24 de noviembre movió **$38.6M** en **2,597 transacciones** — pico de volumen y de actividad el mismo día.

9 de los 10 días con más transacciones de toda la historia del token cayeron entre octubre y noviembre de 2025. Eso no es ruido: es la firma de una integración mayor o un caso de uso nuevo entrando en producción.

![Volumen mensual USD](../charts/polygon/04-monthly-volume-usd.svg)

### Después del pico, la actividad se normalizó — y en mayo 2026 volvió a acelerar.

Tras el máximo de noviembre ($318M), el volumen mensual se asentó en un rango de $60–95M entre diciembre y abril. Y en **mayo 2026 rebotó a $189.9M**, con el **2026-05-05 como el segundo día de mayor volumen de la historia: $31.5M**.

| Ventana | Volumen bruto |
| :--- | :--- |
| Noviembre 2025 (pico) | $318.4M |
| Mayo 2026 (rebote) | $189.9M |
| Últimos 90 días | $335.2M |
| Últimos 30 días | $74.9M |

### El supply rota ~35 veces al mes. Eso es un rail de pagos, no una bóveda.

- Supply promedio (últimos 30 días): ~8.5B COPM
- Volumen bruto (últimos 30 días): ~$74.9M ≈ 300B COPM
- **Rotación implícita: ~35x al mes, ~420x al año**

Para comparar: USDT y USDC rotan en el orden de 10–20x **al año**. COPM rota su supply **~25 veces más rápido** que las stablecoins de dólar. La lectura es directa: nadie acumula COPM — cada peso emitido se mueve decenas de veces antes de redimirse. Es el comportamiento de un *settlement rail*, no de una reserva de valor.

![Supply circulante](../charts/polygon/03-supply-over-time.svg)

### Mints y burns casi en espejo: el peg operó en ambas direcciones.

- Total emitido en 2.7 años: **1.178T COPM**
- Total redimido: **1.170T COPM** (99.4% de lo emitido)

¿Por qué importa? Porque un burn es alguien convirtiendo COPM de vuelta a pesos. Si los burns fueran mucho menores que los mints, sería una bandera roja: tokens que se emiten pero no se pueden redimir. El balance casi 1:1 sostenido durante años es la evidencia on-chain de un peg con operación bidireccional fluida.

![Mints vs burns mensuales](../charts/polygon/06-monthly-mints-burns.svg)

---

## Top 10 días

### Por transacciones

| Día | Transfers | Volumen bruto |
| :--- | ---: | ---: |
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

### Por volumen

| Día | Volumen bruto | Transfers |
| :--- | ---: | ---: |
| **2025-11-24** | **$38.6M** | 2,597 |
| 2026-05-05 | $31.5M | 1,620 |
| 2025-08-19 | $27.8M | 1,155 |
| 2025-09-19 | $27.7M | 1,202 |
| 2025-11-21 | $25.5M | 1,959 |
| 2025-09-18 | $24.7M | 1,422 |
| 2025-08-27 | $23.0M | 1,629 |
| 2025-08-12 | $22.5M | 702 |
| 2025-10-08 | $22.1M | 1,972 |
| 2025-08-15 | $21.9M | 796 |

![Top 10 días por volumen](../charts/polygon/05-top10-volume-days.svg)

---

## Validación

Ningún número de esta auditoría se reporta sin verificarse. El paso de validación ([`07-validate.js`](../07-validate.js)) corre 12 checks y todos pasaron:

| # | Check | Resultado |
| :--- | :--- | :--- |
| 1 | Conteo de eventos vs progreso del scan | ✅ 196,796 = 196,796 |
| 2 | Cero duplicados (tx hash + log index) | ✅ 0 duplicados |
| 3 | Todos los eventos dentro del rango escaneado | ✅ 0 fuera de rango |
| 4 | Scan completo (todos los workers llegaron al final) | ✅ |
| 5 | Cada bloque con evento tiene timestamp | ✅ 136,082 bloques, 0 faltantes |
| 6 | Timestamps dentro de la ventana deploy → latest | ✅ |
| 7 | Serie diaria del largo correcto | ✅ 996 días |
| 8 | Serie diaria continua (sin días faltantes) | ✅ 0 gaps |
| 9 | Total del CSV = total del summary | ✅ |
| 10 | mints − burns = supply derivado | ✅ exacto |
| 11 | Supply derivado vs `totalSupply()` en vivo | ✅ dentro del límite (ver caveat) |
| 12 | **Spot check: 12 transfers re-verificados contra receipts en vivo** | ✅ 12/12 coinciden |

El check 12 es el más fuerte: toma eventos distribuidos por todo el dataset, vuelve a pedir el receipt de cada transacción directamente a la chain, y verifica que bloque, log index y monto coincidan exactamente con lo escaneado. Resultado completo en [`data/polygon/validation.json`](../data/polygon/validation.json).

---

## Metodología

El pipeline son 5 pasos, cada uno un script de Node sin dependencias más allá de [viem](https://viem.sh):

1. **Discover** — encuentra el bloque de deploy por búsqueda binaria sobre `eth_getCode` y lee los metadatos del token (`name`, `symbol`, `decimals`, `totalSupply`).
2. **Scan** — descarga todos los eventos `Transfer` con `eth_getLogs`, en chunks de hasta 10,000 bloques, paralelizado en workers con backoff adaptativo ante rate limits.
3. **Timestamps** — resuelve el timestamp de ~136K bloques únicos interpolando entre cientos de muestras reales (error máximo: segundos; irrelevante para agregados diarios).
4. **Aggregate** — reproduce los eventos en orden y construye la serie diaria: volumen, mints, burns, supply derivado.
5. **Charts** — renderiza los SVG sin canvas ni headless browser.

**Fuente única: un endpoint RPC.** Sin indexers, sin APIs de terceros, sin exploradores. Sirve cualquier proveedor — uno de pago (más rápido) o uno público (gratis, con rate limits que el scanner maneja solo).

## Limitaciones

1. **Solo Polygon.** La actividad en Celo se audita por separado en [su propia auditoría](./celo.es.md), y ambas se consolidan en la [auditoría unificada](../AUDIT.es.md).
2. **Tasa fija 4,000 COP/USD.** Margen de ±5% en cifras USD según el día.
3. **Direcciones internas no filtradas.** El volumen "neto" excluye mints y burns, pero no distingue movimientos entre wallets corporativas del emisor.
4. **Supply derivado vs supply on-chain.** El replay de mints − burns da 7.63B COPM; el `totalSupply()` del contrato reporta 6.32B. La diferencia (~1.3B, estable entre auditorías) apunta a operaciones del proxy que emiten eventos con direcciones especiales distintas de `0x0` y que este análisis no clasifica como mint/burn. No afecta volúmenes ni picos, que se calculan directamente de los eventos.
5. **Timestamps interpolados.** Por diseño (ver metodología); error máximo en el orden de segundos.

## Reproduce esta auditoría

```bash
cp .env.example .env   # configura tu RPC de Polygon
npm install
npm run audit:polygon  # discover → scan → timestamps → aggregate → charts → validate
```

En una máquina normal con un RPC de pago: ~15 minutos. Con un RPC público: más lento, pero llega. Cada paso es re-ejecutable de forma independiente (`CHAIN=polygon npm run scan`, etc.).
